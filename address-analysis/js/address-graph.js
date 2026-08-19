/*
 * Bitcoin Address Analysis — data controller.
 *
 * Loads AFTER arf.js (the vendored OSINT-Framework d3 tree engine) and shares
 * its global scope. It never touches the tree/zoom/search mechanics — it only:
 *   1. fetches a Bitcoin address's transactions from the Esplora API,
 *   2. turns them into a {name, children[]} hierarchy the engine can render,
 *   3. drives clicks (open detail panel + lazy-expand a node's own txs),
 *   4. populates the detail panel with blockchain fields.
 *
 * Public keys are shown only when revealed on-chain (an address reveals its
 * pubkey the first time it *spends*); otherwise we say "not revealed yet".
 */
(function () {
  "use strict";

  // Esplora-compatible hosts. Both send `Access-Control-Allow-Origin: *`, so
  // they are callable straight from the browser on a static site.
  var ESPLORA_HOSTS = ["https://blockstream.info/api", "https://mempool.space/api"];
  var MAX_COUNTERPARTIES = 40;   // cap counterparty children per transaction
  var apiBase = null;            // first host that answered, reused afterwards
  var txCache = {};              // address -> raw txs array (avoid refetch)

  function $(id) { return document.getElementById(id); }

  function esc(str) {
    return (str == null ? "" : String(str))
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function setStatus(msg, kind) {
    var el = $("aa-status");
    if (!el) return;
    el.textContent = msg || "";
    el.className = kind || "";
  }

  function shorten(str, head, tail) {
    head = head || 10; tail = tail || 8;
    if (!str) return "";
    if (str.length <= head + tail + 1) return str;
    return str.slice(0, head) + "…" + str.slice(-tail);
  }

  function formatBTC(sat) {
    if (sat == null) return "0 BTC";
    var s = (sat / 1e8).toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
    return (s === "" ? "0" : s) + " BTC";
  }

  // Accept mainnet legacy (1.. / 3..) and bech32 / bech32m (bc1..) addresses.
  function isProbablyBtcAddress(a) {
    a = (a || "").trim();
    return /^(bc1[ac-hj-np-z02-9]{6,90})$/i.test(a) ||
           /^[13][a-km-zA-HJ-NP-Z1-9]{25,39}$/.test(a);
  }

  // ---------- API with transparent host fallback ----------
  function fetchJson(path) {
    var hosts = apiBase
      ? [apiBase].concat(ESPLORA_HOSTS.filter(function (h) { return h !== apiBase; }))
      : ESPLORA_HOSTS.slice();
    var idx = 0;
    function attempt() {
      if (idx >= hosts.length) return Promise.reject(new Error("all hosts failed"));
      var host = hosts[idx++];
      return fetch(host + path, { headers: { "Accept": "application/json" } })
        .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .then(function (json) { apiBase = host; return json; })
        .catch(function () { return attempt(); });
    }
    return attempt();
  }
  function getAddressStats(addr) { return fetchJson("/address/" + encodeURIComponent(addr)); }
  function getAddressTxs(addr) { return fetchJson("/address/" + encodeURIComponent(addr) + "/txs"); }

  // ---------- public-key extraction ----------
  function looksLikePubkey(hex) {
    return /^(02|03)[0-9a-fA-F]{64}$/.test(hex) || /^04[0-9a-fA-F]{128}$/.test(hex);
  }
  // Given a spending input, return { key, kind } if a public key is revealed.
  function extractPubkeyFromVin(vin) {
    if (!vin) return null;
    // P2WPKH / P2SH-P2WPKH: witness = [signature, compressed-pubkey]
    if (vin.witness && vin.witness.length) {
      for (var i = vin.witness.length - 1; i >= 0; i--) {
        if (looksLikePubkey(vin.witness[i])) return { key: vin.witness[i], kind: "compressed" };
      }
    }
    // P2PKH: scriptsig_asm ends with "... OP_PUSHBYTES_33 <pubkey>"
    if (vin.scriptsig_asm) {
      var toks = vin.scriptsig_asm.split(/\s+/);
      for (var j = toks.length - 1; j >= 0; j--) {
        if (looksLikePubkey(toks[j])) return { key: toks[j], kind: "compressed" };
      }
    }
    // Taproot key-path: x-only output key lives in prevout scriptpubkey (5120<32B>)
    if (vin.prevout && vin.prevout.scriptpubkey_type === "v1_p2tr" && vin.prevout.scriptpubkey) {
      var m = /^5120([0-9a-fA-F]{64})$/.exec(vin.prevout.scriptpubkey);
      if (m) return { key: m[1], kind: "x-only (taproot)" };
    }
    return null;
  }

  // ---------- hierarchy building ----------
  function summarizeAddress(stats) {
    var cs = stats.chain_stats || {}, ms = stats.mempool_stats || {};
    var funded = (cs.funded_txo_sum || 0) + (ms.funded_txo_sum || 0);
    var spent = (cs.spent_txo_sum || 0) + (ms.spent_txo_sum || 0);
    return {
      funded: funded,
      spent: spent,
      balance: funded - spent,
      txCount: (cs.tx_count || 0) + (ms.tx_count || 0)
    };
  }

  // Build the transaction child-nodes for a given "context" address.
  function buildTxChildren(addr, txs) {
    return txs.map(function (tx) {
      var sumIn = 0, sumOut = 0;
      (tx.vin || []).forEach(function (v) {
        if (v.prevout && v.prevout.scriptpubkey_address === addr) sumIn += v.prevout.value || 0;
      });
      (tx.vout || []).forEach(function (o) {
        if (o.scriptpubkey_address === addr) sumOut += o.value || 0;
      });
      var net = sumOut - sumIn;
      var direction = net > 0 ? "received" : (net < 0 ? "sent" : "self");

      // The context address's own pubkey is revealed here iff it is a spender.
      var ownPubkey = null;
      if (sumIn > 0) {
        (tx.vin || []).some(function (v) {
          if (v.prevout && v.prevout.scriptpubkey_address === addr) {
            var pk = extractPubkeyFromVin(v);
            if (pk) { ownPubkey = pk; return true; }
          }
          return false;
        });
      }

      // Counterparties: senders (if we received) or recipients (if we sent).
      var cps = [], seen = {}, hidden = 0;
      if (direction === "sent") {
        (tx.vout || []).forEach(function (o) {
          var a = o.scriptpubkey_address;
          if (!a || a === addr) return;               // skip self / change / unparsable
          if (seen[a]) { seen[a].value += o.value || 0; return; }
          var n = makeAddressNode(a, o.value || 0, "recipient", null);
          seen[a] = n; cps.push(n);
        });
      } else {
        (tx.vin || []).forEach(function (v) {
          if (!v.prevout) return;
          var a = v.prevout.scriptpubkey_address;
          if (!a || a === addr) return;
          var pk = extractPubkeyFromVin(v);
          if (seen[a]) {
            seen[a].value += v.prevout.value || 0;
            if (pk && !seen[a].pubkey) seen[a].pubkey = pk;
            return;
          }
          var n = makeAddressNode(a, v.prevout.value || 0, "sender", pk);
          seen[a] = n; cps.push(n);
        });
      }
      if (cps.length > MAX_COUNTERPARTIES) { hidden = cps.length - MAX_COUNTERPARTIES; cps = cps.slice(0, MAX_COUNTERPARTIES); }

      var sign = direction === "received" ? "+" : direction === "sent" ? "−" : "±";
      var amt = formatBTC(Math.abs(net) || sumIn || sumOut);
      return {
        name: shorten(tx.txid, 8, 6) + "  " + sign + amt,
        description: "Transaction " + tx.txid + " — " + direction + " " + sign + amt,
        free: true,
        kind: "tx",
        txid: tx.txid,
        direction: direction,
        net: net, sumIn: sumIn, sumOut: sumOut,
        fee: tx.fee,
        size: tx.size,
        confirmed: !!(tx.status && tx.status.confirmed),
        blockHeight: tx.status && tx.status.block_height,
        blockTime: tx.status && tx.status.block_time,
        ownPubkey: ownPubkey,
        contextAddress: addr,
        hiddenCount: hidden,
        children: cps
      };
    });
  }

  function makeAddressNode(addr, value, role, pubkey) {
    var sign = role === "recipient" ? "−" : "+";
    return {
      name: shorten(addr) + "  " + sign + formatBTC(value),
      description: addr + " — click to trace its transactions",
      free: true,
      kind: "address",
      address: addr,
      value: value,
      role: role,
      pubkey: pubkey || null,
      children: null              // lazily loaded on click
    };
  }

  function buildRoot(addr, stats, txs) {
    // Own pubkey across the loaded txs (revealed when this address is a spender).
    var ownPubkey = null;
    txs.some(function (tx) {
      return (tx.vin || []).some(function (v) {
        if (v.prevout && v.prevout.scriptpubkey_address === addr) {
          var pk = extractPubkeyFromVin(v);
          if (pk) { ownPubkey = pk; return true; }
        }
        return false;
      });
    });
    return {
      name: shorten(addr, 12, 10),
      description: addr,
      free: true,
      kind: "address",
      address: addr,
      isRoot: true,
      pubkey: ownPubkey,
      stats: summarizeAddress(stats),
      loadedTxCount: txs.length,
      children: buildTxChildren(addr, txs)
    };
  }

  // ---------- d3 node surgery for lazy expansion ----------
  // Build a real d3 hierarchy subtree from plain data and graft it under `parent`.
  function makeSubtree(data, parent) {
    var n = d3.hierarchy(data, function (x) { return x && x.children ? x.children : null; });
    var base = parent.depth + 1;
    n.each(function (x) { x.depth += base; });   // offset depths onto the parent
    n.parent = parent;
    return n;
  }

  // ---------- click behaviour ----------
  function handleNodeClick(d) {
    openPanel(d);                                  // always show details
    var data = d.data || {};
    if (data.isRoot) return;                       // keep the whole graph visible

    // An un-loaded counterparty address → fetch its transactions on demand.
    if (data.kind === "address" && !d.children && !d._children && !d._loaded && !d._loading) {
      lazyExpand(d);
      return;
    }
    // Otherwise just expand/collapse like the reference tree.
    if (d.children) { toggle(d); update(d); return; }
    if (d._children) { toggle(d); update(d); zoomToNode(d); return; }
  }

  function lazyExpand(d) {
    var addr = d.data.address;
    if (!addr) return;

    function graft(txs) {
      d.data.children = buildTxChildren(addr, txs);
      d.data.loadedTxCount = txs.length;
      var kids = d.data.children.map(function (cd) {
        var node = makeSubtree(cd, d);
        if (node.children) { node._children = node.children; node.children = null; } // collapse tx
        return node;
      });
      d.children = kids.length ? kids : null;
      d._children = null;
      d._loaded = true;
      d._loading = false;
      if (kids.length) {
        allSearchNodes = allSearchNodes.concat(
          d.descendants().filter(function (x) { return x.depth > 0 && x.data && x.data.name; })
        );
      }
      setStatus(kids.length ? "" : ("No further transactions for " + shorten(addr) + "."), "");
      update(d);
      zoomToNode(d);
    }

    if (txCache[addr]) { graft(txCache[addr]); return; }
    d._loading = true;
    setStatus("Loading transactions for " + shorten(addr) + " …", "loading");
    getAddressTxs(addr)
      .then(function (txs) { txs = txs || []; txCache[addr] = txs; graft(txs); })
      .catch(function () { d._loading = false; setStatus("Couldn't load transactions for that address.", "error"); });
  }

  // ---------- detail-panel content ----------
  function pill(text, cls) { return '<span class="badge-pill ' + cls + '">' + esc(text) + '</span>'; }
  function mono(text) { return '<span class="aa-mono">' + esc(text) + '</span>'; }
  function copyBtn(text) { return '<button class="aa-copy" type="button" data-copy="' + esc(text) + '" title="Copy">copy</button>'; }
  function row(label, valueHtml) {
    return '<div class="aa-row">' +
      (label ? '<span class="aa-row-label">' + esc(label) + '</span>' : '') +
      '<span class="aa-row-value">' + valueHtml + '</span></div>';
  }
  function pkRow(label, pk, emptyText) {
    if (pk) return row(label, mono(pk.key) + copyBtn(pk.key) + ' <span class="aa-muted">(' + esc(pk.kind) + ')</span>');
    return row(label, '<span class="aa-muted">' + esc(emptyText) + '</span>');
  }

  function renderPanelContent(d) {
    var data = d.data || {};
    var isTx = data.kind === "tx";

    var titleEl = $("panel-title");
    if (titleEl) titleEl.textContent = isTx ? "Transaction" : (data.isRoot ? "Address (root)" : "Address");

    // Breadcrumb — ancestor path (skip the node itself)
    var bc = $("panel-breadcrumb");
    if (bc) {
      var crumbs = d.ancestors().reverse().slice(0, -1).map(function (a) {
        var ad = a.data || {};
        return esc(ad.kind === "tx" ? ("tx " + shorten(ad.txid, 6, 4)) : shorten(ad.address || ad.name, 8, 6));
      });
      if (crumbs.length) { bc.innerHTML = crumbs.join(" › "); bc.classList.remove("empty"); }
      else { bc.textContent = ""; bc.classList.add("empty"); }
    }

    // Badges
    var badges = $("panel-badges");
    if (badges) {
      var b = "";
      if (isTx) {
        b += pill(data.direction === "received" ? "Received" : data.direction === "sent" ? "Sent" : "Self-transfer",
                  "badge-" + data.direction);
        b += " " + pill(data.confirmed ? "Confirmed" : "Pending", data.confirmed ? "badge-confirmed" : "badge-pending");
      } else if (data.isRoot) {
        b += pill("Root address", "badge-root");
      } else {
        b += pill(data.role === "sender" ? "Sender" : data.role === "recipient" ? "Recipient" : "Address", "badge-address");
      }
      badges.innerHTML = b;
      badges.classList.remove("empty");
    }

    // Summary
    var descSec = $("panel-description-section"), desc = $("panel-description");
    if (descSec && desc) {
      var s = "";
      if (isTx) {
        var sign = data.direction === "received" ? "+" : data.direction === "sent" ? "−" : "±";
        s = sign + formatBTC(Math.abs(data.net)) + (data.fee != null ? "   ·   fee " + formatBTC(data.fee) : "");
      } else if (data.isRoot && data.stats) {
        s = "Balance " + formatBTC(data.stats.balance) + "   ·   " + data.stats.txCount + " transaction(s)";
      } else if (data.value != null) {
        s = (data.role === "recipient" ? "Received " : "Sent ") + formatBTC(data.value) + " in this transaction";
      }
      desc.textContent = s;
      descSec.classList.remove("empty");
    }

    // Detail rows
    var detSec = $("panel-details-section"), det = $("panel-details");
    if (detSec && det) {
      var rows = [];
      if (isTx) {
        rows.push(row("TXID", mono(data.txid) + copyBtn(data.txid)));
        rows.push(row("Direction", esc(data.direction)));
        if (data.sumIn) rows.push(row("Spent from this address", formatBTC(data.sumIn)));
        if (data.sumOut) rows.push(row("Received by this address", formatBTC(data.sumOut)));
        if (data.fee != null) rows.push(row("Fee", formatBTC(data.fee)));
        rows.push(row("Status", data.confirmed
          ? ("Confirmed" + (data.blockHeight ? " · block " + data.blockHeight : ""))
          : "Pending (in mempool)"));
        if (data.blockTime) rows.push(row("Time", new Date(data.blockTime * 1000).toUTCString()));
        rows.push(pkRow("Public key of spender", data.ownPubkey, "Not revealed in this transaction"));
      } else {
        rows.push(row("Address", mono(data.address) + copyBtn(data.address)));
        if (data.isRoot && data.stats) {
          rows.push(row("Balance", formatBTC(data.stats.balance)));
          rows.push(row("Total received", formatBTC(data.stats.funded)));
          rows.push(row("Total sent", formatBTC(data.stats.spent)));
          rows.push(row("Transactions", esc(String(data.stats.txCount)) +
            (data.loadedTxCount < data.stats.txCount ? " <span class='aa-muted'>(showing newest " + data.loadedTxCount + ")</span>" : "")));
        } else if (data.value != null) {
          rows.push(row(data.role === "recipient" ? "Amount received" : "Amount sent", formatBTC(data.value)));
        }
        rows.push(pkRow("Public key", data.pubkey, "Not revealed yet — appears only once this address spends"));
        if (!data.isRoot && !d._loaded) {
          rows.push(row("", "<span class='aa-muted'>Click this node to load its transactions.</span>"));
        }
      }
      det.innerHTML = rows.join("");
      detSec.classList.remove("empty");
      wireCopyButtons(det);
    }

    // CTA — open on a block explorer
    var ctaSec = $("panel-cta-section"), cta = $("panel-open-tool");
    if (ctaSec && cta) {
      cta.href = isTx
        ? "https://blockstream.info/tx/" + data.txid
        : "https://blockstream.info/address/" + data.address;
      cta.textContent = (isTx ? "View transaction" : "View address") + " on explorer ↗";
      ctaSec.classList.remove("empty");
    }
  }

  function wireCopyButtons(container) {
    container.querySelectorAll(".aa-copy").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var text = btn.getAttribute("data-copy");
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () {
            var old = btn.textContent; btn.textContent = "copied";
            setTimeout(function () { btn.textContent = old; }, 1200);
          }).catch(function () {});
        }
      });
    });
  }

  // ---------- analyse flow ----------
  function hidePlaceholder() { var p = $("aa-placeholder"); if (p) p.classList.add("aa-hidden"); }
  function showSearch() { var s = $("search-container"); if (s) s.classList.remove("aa-hidden"); }

  function analyze(addr) {
    addr = (addr || "").trim();
    if (!isProbablyBtcAddress(addr)) {
      setStatus("That doesn't look like a Bitcoin address. Please check and try again.", "error");
      return;
    }
    var btn = $("analyze-btn");
    if (btn) btn.disabled = true;
    setStatus("Fetching transactions for " + shorten(addr) + " …", "loading");

    Promise.all([getAddressStats(addr), getAddressTxs(addr)])
      .then(function (res) {
        var stats = res[0], txs = res[1] || [];
        txCache[addr] = txs;
        var rootData = buildRoot(addr, stats, txs);
        hidePlaceholder();
        showSearch();
        window.renderGraph(rootData);
        setStatus(txs.length
          ? ("Loaded " + txs.length + " transaction(s)" + (rootData.stats.txCount > txs.length ? " of " + rootData.stats.txCount + " (newest first)" : "") + ". Click a transaction to expand it.")
          : "No transactions found for this address.", "");
        try { history.replaceState(null, "", "?address=" + encodeURIComponent(addr)); } catch (e) {}
      })
      .catch(function () {
        setStatus("Couldn't reach the blockchain API. Check your connection and try again.", "error");
      })
      .then(function () { if (btn) btn.disabled = false; });
  }

  // Keep the tree's node colours in sync with the site's light/dark theme.
  // arf.js bakes each circle/text fill as a *resolved* hex (via getCSSVar) at
  // update() time, so those inline styles do NOT follow a later theme switch on
  // their own. Re-running update(root) makes the engine re-read the current
  // --cgt-* values and recolour every visible node. (Links use a live CSS var,
  // so they already follow the theme.)
  function watchTheme() {
    var html = document.documentElement;
    var last = html.getAttribute("data-bs-theme");
    var obs = new MutationObserver(function () {
      var now = html.getAttribute("data-bs-theme");
      if (now === last) return;
      last = now;
      if (window.root && typeof window.update === "function") window.update(window.root);
    });
    obs.observe(html, { attributes: true, attributeFilter: ["data-bs-theme"] });
  }

  function init() {
    var input = $("address-input"), btn = $("analyze-btn");
    if (btn) btn.addEventListener("click", function () { analyze(input ? input.value : ""); });
    if (input) input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); analyze(input.value); }
    });
    watchTheme();
    // Deep link: ?address=...
    var m = /[?&]address=([^&]+)/.exec(location.search);
    if (m && input) { input.value = decodeURIComponent(m[1]); analyze(input.value); }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  // Expose the hooks arf.js delegates to.
  window.handleNodeClick = handleNodeClick;
  window.renderPanelContent = renderPanelContent;
  window.AddressAnalysis = { analyze: analyze };
})();
