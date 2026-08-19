/*
 * Bitcoin Address Analysis — data controller.
 *
 * Loads AFTER arf.js (the vendored OSINT-Framework d3 tree engine) and shares
 * its global scope. It never touches the tree/zoom/search mechanics — it only:
 *   1. fetches a Bitcoin address's transactions from the blockchain.info API,
 *   2. turns them into a {name, children[]} hierarchy the engine can render,
 *   3. drives clicks (open detail box + lazy-expand a node's own txs),
 *   4. populates the detail box with blockchain fields.
 *
 * DATA SOURCE: blockchain.info PRIMARY, blockstream.info (Esplora) FALLBACK.
 * No mempool.space, no blockchair. blockchain.info's `/address/{addr}?format=json`
 * endpoint (the caller's proven approach) returns address stats AND transactions
 * in one CORS-enabled call (`&cors=true`, 100 txs/page via `&offset=`). If it is
 * unreachable or rate-limiting, we transparently fall back to blockstream.info's
 * Esplora API and normalise its response into the same tx shape, so the tree
 * builder never has to know which explorer served the data.
 *
 * Public keys are shown only when revealed on-chain (an address reveals its
 * pubkey the first time it *spends*); otherwise we say "not revealed yet".
 */
(function () {
  "use strict";

  // PRIMARY: blockchain.info. `&cors=true` makes it send
  // `Access-Control-Allow-Origin: *`, so it is callable straight from the
  // browser. FALLBACK: blockstream.info Esplora (also CORS `*`).
  var API_BCI = "https://blockchain.info";
  var API_ESPLORA = "https://blockstream.info/api";
  var TX_LIMIT = 25;             // newest txs kept per address for the tree
  var MAX_COUNTERPARTIES = 40;   // cap counterparty children per transaction
  var txCache = {};              // address -> normalised txs array (avoid refetch)
  var lastSource = "";           // which explorer served the most recent fetch

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

  // ---------- data fetch: blockchain.info primary, blockstream fallback ----------
  // Both paths resolve to ONE normalised shape (blockchain.info's native shape):
  //   { address, n_tx, total_received, total_sent, final_balance,
  //     txs:[ { hash, result?, fee, time, block_height,
  //             inputs:[{prev_out:{addr,value,script}, script, witnessItems?}],
  //             out:[{addr,value}] } ], source }
  // `result` (net sats for the queried address) is provided by blockchain.info;
  // for Esplora we omit it and buildTxChildren computes net = sumOut - sumIn.
  function okJson(r) {
    if (r.status === 429) throw new Error("rate-limited");
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }

  // PRIMARY — the caller's proven approach: /address/{addr}?format=json&offset=N
  // (100 txs/page, same tx shape as /rawaddr). We take the newest page and keep
  // the freshest `limit` txs for the tree.
  function fetchBci(addr, limit) {
    var url = API_BCI + "/address/" + encodeURIComponent(addr) +
              "?format=json&offset=0&cors=true";
    return fetch(url, { headers: { "Accept": "application/json" } })
      .then(okJson)
      .then(function (d) {
        return {
          address: d.address || addr,
          n_tx: d.n_tx || (d.txs || []).length,
          total_received: d.total_received || 0,
          total_sent: d.total_sent || 0,
          final_balance: d.final_balance || 0,
          txs: (d.txs || []).slice(0, limit || TX_LIMIT),
          source: "blockchain.info"
        };
      });
  }

  // Normalise one Esplora tx into the blockchain.info tx shape.
  function esploraTxToBci(t) {
    var st = t.status || {};
    return {
      hash: t.txid,
      // result omitted on purpose -> buildTxChildren computes the net effect.
      fee: t.fee,
      size: t.size,
      time: st.block_time || null,
      block_height: st.confirmed ? st.block_height : null,
      inputs: (t.vin || []).map(function (v) {
        var po = v.prevout || {};
        return {
          prev_out: {
            addr: po.scriptpubkey_address || null,
            value: po.value || 0,
            script: po.scriptpubkey || null
          },
          script: v.scriptsig || "",
          // Esplora already delivers the witness as an array of hex items.
          witnessItems: Array.isArray(v.witness) ? v.witness : null
        };
      }),
      out: (t.vout || []).map(function (o) {
        return { addr: o.scriptpubkey_address || null, value: o.value || 0 };
      })
    };
  }

  // FALLBACK — blockstream.info Esplora: /address/{addr} for stats +
  // /address/{addr}/txs for the newest txs, normalised to the shape above.
  function fetchEsplora(addr, limit) {
    var base = API_ESPLORA + "/address/" + encodeURIComponent(addr);
    return Promise.all([
      fetch(base).then(okJson),
      fetch(base + "/txs").then(okJson)
    ]).then(function (res) {
      var stats = res[0] || {}, rawTxs = res[1] || [];
      var cs = stats.chain_stats || {}, ms = stats.mempool_stats || {};
      var funded = (cs.funded_txo_sum || 0) + (ms.funded_txo_sum || 0);
      var spent = (cs.spent_txo_sum || 0) + (ms.spent_txo_sum || 0);
      return {
        address: addr,
        n_tx: ((cs.tx_count || 0) + (ms.tx_count || 0)) || rawTxs.length,
        total_received: funded,
        total_sent: spent,
        final_balance: funded - spent,
        txs: rawTxs.slice(0, limit || TX_LIMIT).map(esploraTxToBci),
        source: "blockstream.info"
      };
    });
  }

  // Try blockchain.info first; on ANY problem fall back to blockstream.info.
  function fetchAddr(addr, limit) {
    return fetchBci(addr, limit)
      .then(function (d) { lastSource = d.source; return d; })
      .catch(function (e1) {
        return fetchEsplora(addr, limit)
          .then(function (d) { lastSource = d.source; return d; })
          .catch(function (e2) {
            // Both explorers failed — surface a rate-limit hint if either threw one.
            if (/rate/.test((e1 && e1.message) || "") ||
                /rate/.test((e2 && e2.message) || "")) throw new Error("rate-limited");
            throw e1;
          });
      });
  }

  // ---------- public-key extraction (blockchain.info formats) ----------
  function looksLikePubkey(hex) {
    return /^(02|03)[0-9a-fA-F]{64}$/.test(hex) || /^04[0-9a-fA-F]{128}$/.test(hex);
  }
  function pubkeyKind(hex) { return /^04/i.test(hex) ? "uncompressed" : "compressed"; }

  // Legacy P2PKH: scriptsig hex ends with a push of the pubkey (0x21<33B> or 0x41<65B>).
  function pubkeyFromScriptHex(scriptHex) {
    if (!scriptHex) return null;
    var m = /21((?:02|03)[0-9a-fA-F]{64})$/.exec(scriptHex) ||
            /41(04[0-9a-fA-F]{128})$/.exec(scriptHex);
    return m ? { key: m[1], kind: pubkeyKind(m[1]) } : null;
  }

  // blockchain.info serialises a segwit witness as one hex string:
  //   [compactsize item-count][ (compactsize len)(data) ]...
  function parseWitnessItems(witnessHex) {
    if (!witnessHex || typeof witnessHex !== "string") return [];
    var buf = witnessHex.toLowerCase(), pos = 0;
    function byte() { var b = parseInt(buf.substr(pos, 2), 16); pos += 2; return b; }
    function varint() {
      var f = byte();
      if (isNaN(f)) return -1;
      if (f < 0xfd) return f;
      if (f === 0xfd) { var a = byte(), b = byte(); return a + b * 256; }
      return -1; // 0xfe/0xff — unreasonably large, bail
    }
    var count = varint();
    if (count < 0 || count > 100) return [];
    var items = [];
    for (var i = 0; i < count; i++) {
      var len = varint();
      if (len < 0 || pos + len * 2 > buf.length) return items;
      items.push(buf.substr(pos, len * 2));
      pos += len * 2;
    }
    return items;
  }

  // Return { key, kind } if this input reveals a public key, else null.
  function extractPubkey(input) {
    if (!input) return null;
    // P2PKH: pubkey pushed at the tail of the scriptsig.
    var fromScript = pubkeyFromScriptHex(input.script);
    if (fromScript) return fromScript;
    // P2WPKH / nested: witness stack's last item is the compressed pubkey.
    // Esplora gives the witness as an array (witnessItems); blockchain.info gives
    // it as one serialised hex string that we parse into items.
    var items = input.witnessItems || parseWitnessItems(input.witness);
    for (var i = items.length - 1; i >= 0; i--) {
      if (looksLikePubkey(items[i])) return { key: items[i], kind: pubkeyKind(items[i]) };
    }
    // Taproot key-path: x-only key lives in the prevout script (5120<32B>).
    var po = input.prev_out;
    if (po && po.script && /^5120[0-9a-fA-F]{64}$/.test(po.script)) {
      return { key: po.script.slice(4), kind: "x-only (taproot)" };
    }
    return null;
  }

  // ---------- hierarchy building ----------
  // Build the transaction child-nodes for a given "context" address.
  function buildTxChildren(addr, txs) {
    return txs.map(function (tx) {
      var inputs = tx.inputs || [], outs = tx.out || [];
      var sumIn = 0, sumOut = 0;
      inputs.forEach(function (v) {
        if (v.prev_out && v.prev_out.addr === addr) sumIn += v.prev_out.value || 0;
      });
      outs.forEach(function (o) {
        if (o.addr === addr) sumOut += o.value || 0;
      });
      // blockchain.info gives the net effect on the queried address directly.
      var net = (typeof tx.result === "number") ? tx.result : (sumOut - sumIn);
      var direction = net > 0 ? "received" : (net < 0 ? "sent" : "self");

      // The context address's own pubkey is revealed here iff it is a spender.
      var ownPubkey = null;
      if (sumIn > 0) {
        inputs.some(function (v) {
          if (v.prev_out && v.prev_out.addr === addr) {
            var pk = extractPubkey(v);
            if (pk) { ownPubkey = pk; return true; }
          }
          return false;
        });
      }

      // Counterparties: recipients (if we sent) or senders (if we received).
      var cps = [], seen = {}, hidden = 0;
      if (direction === "sent") {
        outs.forEach(function (o) {
          var a = o.addr;
          if (!a || a === addr) return;               // skip self / change / unparsable
          if (seen[a]) { seen[a].value += o.value || 0; return; }
          var n = makeAddressNode(a, o.value || 0, "recipient", null);
          seen[a] = n; cps.push(n);
        });
      } else {
        inputs.forEach(function (v) {
          if (!v.prev_out) return;
          var a = v.prev_out.addr;
          if (!a || a === addr) return;
          var pk = extractPubkey(v);
          if (seen[a]) {
            seen[a].value += v.prev_out.value || 0;
            if (pk && !seen[a].pubkey) seen[a].pubkey = pk;
            return;
          }
          var n = makeAddressNode(a, v.prev_out.value || 0, "sender", pk);
          seen[a] = n; cps.push(n);
        });
      }
      if (cps.length > MAX_COUNTERPARTIES) { hidden = cps.length - MAX_COUNTERPARTIES; cps = cps.slice(0, MAX_COUNTERPARTIES); }

      var confirmed = (tx.block_height != null && tx.block_height > 0);
      var sign = direction === "received" ? "+" : direction === "sent" ? "−" : "±";
      var amt = formatBTC(Math.abs(net) || sumIn || sumOut);
      return {
        name: tx.hash + "   " + sign + amt,
        description: "Transaction " + tx.hash + " — " + direction + " " + sign + amt,
        free: true,
        kind: "tx",
        txid: tx.hash,
        direction: direction,
        net: net, sumIn: sumIn, sumOut: sumOut,
        fee: tx.fee,
        size: tx.size,
        confirmed: confirmed,
        blockHeight: confirmed ? tx.block_height : null,
        blockTime: tx.time,
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
      name: addr + "   " + sign + formatBTC(value),
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

  function buildRoot(addr, data) {
    var txs = data.txs || [];
    // Own pubkey across the loaded txs (revealed when this address is a spender).
    var ownPubkey = null;
    txs.some(function (tx) {
      return (tx.inputs || []).some(function (v) {
        if (v.prev_out && v.prev_out.addr === addr) {
          var pk = extractPubkey(v);
          if (pk) { ownPubkey = pk; return true; }
        }
        return false;
      });
    });
    return {
      name: addr,
      description: addr,
      free: true,
      kind: "address",
      address: addr,
      isRoot: true,
      pubkey: ownPubkey,
      stats: {
        funded: data.total_received || 0,
        spent: data.total_sent || 0,
        balance: data.final_balance || 0,
        txCount: data.n_tx || txs.length
      },
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

  // Bring the in-page detail card into view when a node is clicked (it sits
  // below the tree, so on smaller screens it can be off-screen).
  function scrollToDetail() {
    var box = $("tool-panel");
    if (box && box.classList.contains("open") && box.scrollIntoView) {
      box.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  // ---------- click behaviour ----------
  function handleNodeClick(d) {
    openPanel(d);                                  // always show details
    scrollToDetail();
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
    fetchAddr(addr, TX_LIMIT)
      .then(function (data) { var txs = (data && data.txs) || []; txCache[addr] = txs; graft(txs); })
      .catch(function (e) {
        d._loading = false;
        setStatus(/rate/.test(e && e.message) ? "Both explorers are rate-limiting — wait a few seconds and click again." : "Couldn't load transactions for that address.", "error");
      });
  }

  // ---------- detail-box content ----------
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

    // CTA — open on the blockchain.info explorer
    var ctaSec = $("panel-cta-section"), cta = $("panel-open-tool");
    if (ctaSec && cta) {
      cta.href = isTx
        ? "https://www.blockchain.com/explorer/transactions/btc/" + data.txid
        : "https://www.blockchain.com/explorer/addresses/btc/" + data.address;
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

    fetchAddr(addr, TX_LIMIT)
      .then(function (data) {
        var txs = (data && data.txs) || [];
        txCache[addr] = txs;
        var rootData = buildRoot(addr, data);
        hidePlaceholder();
        showSearch();
        window.renderGraph(rootData);
        setStatus(txs.length
          ? ("Loaded " + txs.length + " transaction(s)" + (rootData.stats.txCount > txs.length ? " of " + rootData.stats.txCount + " (newest first)" : "") + " · via " + lastSource + ". Click a transaction to expand it.")
          : "No transactions found for this address.", "");
        try { history.replaceState(null, "", "?address=" + encodeURIComponent(addr)); } catch (e) {}
      })
      .catch(function (e) {
        setStatus(/rate/.test(e && e.message)
          ? "Both explorers are rate-limiting — wait a few seconds and press Analyze again."
          : "Couldn't reach blockchain.info or blockstream.info. Check your connection and try again.", "error");
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

  // ---------- chain selector ----------
  // All coins are shown, but only Bitcoin is analysable in this phase. Clicking
  // another coin explains that it's coming soon rather than doing nothing.
  function wireChainTabs() {
    var tabs = document.querySelectorAll("#aa-chain-tabs .chain-tab");
    if (!tabs.length) return;
    tabs.forEach(function (tab) {
      var chain = tab.getAttribute("data-chain");
      if (chain !== "bitcoin") tab.classList.add("aa-soon");
      tab.addEventListener("click", function (e) {
        e.preventDefault();
        if (chain === "bitcoin") { var inp = $("address-input"); if (inp) inp.focus(); return; }
        var name = tab.getAttribute("data-name") || "This chain";
        setStatus(name + " support is coming soon — Bitcoin address analysis is available now.", "");
      });
    });
  }

  function init() {
    var input = $("address-input"), btn = $("analyze-btn");
    if (btn) btn.addEventListener("click", function () { analyze(input ? input.value : ""); });
    if (input) input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); analyze(input.value); }
    });
    wireChainTabs();
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
