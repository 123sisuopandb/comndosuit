/**
 * CGT bitcoin-dormant fix  (assets/js/bitcoin-dormant-fix.js)
 * ------------------------------------------------------------------
 * Restores / extends the shipped UI of the Bitcoin-Dormant tracker so it
 * behaves like the live site — WITHOUT touching the obfuscated engine
 * (bitcoin-dormant.obf.js keeps doing the live balance fetches). This is a
 * pure client-side companion, loaded immediately BEFORE the engine, that:
 *
 *  1. DETAIL PAGES — makes the "Details" button work for EVERY address.
 *     The static export only baked 292 of 543 detail files; the rest 404'd.
 *     One template (/bitcoin-dormant/address.html) now renders ANY address:
 *     this script reads the address from location.pathname, fills the header /
 *     table / links, looks up its metadata (years dormant, BTC moved, awakened)
 *     from /bitcoin-dormant/index.json (all 543) or /addresses.txt (#544+),
 *     and hands the address to the engine (window.DORMANT_ADDRESS) so the LIVE
 *     balance loads exactly as on a pre-rendered page.
 *
 *  2. LIST PAGES — auto-loads extra addresses from /addresses.txt.
 *     Everything after the 543 baked ones (i.e. #544+) is appended as new
 *     paginated pages (12, 13, …). The header count, the "Total Tracked" stat
 *     and the pagination (page links + "Go to page" jump) all extend
 *     automatically. Live balances for these rows use the SAME BalanceChecker
 *     batch call + identical cell markup the engine uses, so they're
 *     indistinguishable from baked rows.
 *
 *  3. Fixes the pre-existing "Go to page" bug (the baked handler built the
 *     broken URL "./bitcoin-dormant/.htmlN") and makes the max page dynamic.
 *
 * If /addresses.txt is absent or empty, NOTHING changes on the list — the page
 * stays exactly as the static export shipped it (zero regression). The only
 * always-on change is that detail links are normalised to the extensionless
 * live form "/bitcoin-dormant/address/<ADDR>" (routing serves the pre-rendered
 * file when it exists, else the template).
 */
(function () {
  'use strict';

  var PER_PAGE     = 50;
  var BAKED_TOTAL  = 543;  // canonical count shown by the export (pages 1..11)
  var BAKED_PAGES  = 11;   // last pre-rendered numbered page
  var VER          = 'cgtdormant1';

  // ---- tiny helpers ---------------------------------------------------------
  function $(sel, root)    { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  // Loose BTC address check (P2PKH / P2SH base58 + bech32). Good enough to
  // reject junk lines in addresses.txt without pulling in a full validator.
  function isBtcAddress(a) {
    return typeof a === 'string' &&
      /^(bc1[ac-hj-np-z02-9]{6,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,39})$/.test(a);
  }

  // URL for list page N (page 1 = the tool root, matches the live pretty URLs).
  function pageHref(n) { return n <= 1 ? '/bitcoin-dormant' : '/bitcoin-dormant/' + n; }
  // URL for an address detail page (extensionless, like the live site).
  function detailHref(addr) { return '/bitcoin-dormant/address/' + addr; }

  // Which list page are we on? /bitcoin-dormant(.html) => 1 ; /bitcoin-dormant/N => N
  function currentListPage() {
    var p = location.pathname.replace(/\/+$/, '');
    if (/\/bitcoin-dormant(\.html)?$/.test(p)) return 1;
    var m = p.match(/\/bitcoin-dormant\/(\d+)(?:\.html)?$/);
    return m ? parseInt(m[1], 10) : 1;
  }

  // ---- addresses.txt --------------------------------------------------------
  // One entry per line. Blank lines and lines starting with '#' are ignored.
  // Fields are separated by a comma, a pipe, a tab, or 2+ spaces:
  //   <address>[ , <dormant> , <btc moved> , <awakened> , <block height> ]
  // Only <address> is required; missing fields render as "-" (balance is always
  // fetched live). Duplicate addresses are dropped.
  function parseTxt(text) {
    var out = [], seen = {};
    var lines = String(text || '').split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line || line.charAt(0) === '#') continue;
      var parts = line.split(/\s*[,|\t]\s*|\s{2,}/);
      var addr = (parts[0] || '').trim();
      if (!isBtcAddress(addr) || seen[addr]) continue;
      seen[addr] = 1;
      out.push({
        address:  addr,
        dormant:  (parts[1] || '').trim(),
        moved:    (parts[2] || '').trim(),
        awakened: (parts[3] || '').trim(),
        block:    (parts[4] || '').trim()
      });
    }
    return out;
  }

  var _txt = null;
  function loadTxt() {
    if (_txt) return _txt;
    _txt = fetch('/addresses.txt?v=' + VER, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.text() : ''; })
      .then(parseTxt)
      .catch(function () { return []; });
    return _txt;
  }

  // Metadata index for the 543 baked addresses (built from the list pages).
  // Shape: { "<addr>": { d:"12y", m:"23.06", a:"2026-07-20 21:07:11" }, ... }
  var _index = null;
  function loadIndex() {
    if (_index) return _index;
    _index = fetch('/bitcoin-dormant/index.json?v=' + VER, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .catch(function () { return {}; });
    return _index;
  }

  // ---- balances (reuse the engine's exact batch call + cell markup) ---------
  function balanceCellHtml(entry) {
    if (entry && parseFloat(entry.balanceStr) > 0) {
      return '<span class="text-success fw-bold">' + entry.balanceStr +
             '</span> <small class="fw-normal">BTC</small>';
    }
    if (entry) {
      return '<span class="text-muted">0</span> <small class="text-muted">BTC</small>';
    }
    return '<span class="text-muted">-</span>';
  }

  function fillBalances(addrs) {
    if (!addrs.length) return;
    if (typeof BalanceChecker === 'undefined' ||
        typeof BalanceChecker.fetchBitcoinBalancesBatch !== 'function') {
      $all('#dormant-table .key-row').forEach(function (row) {
        if (addrs.indexOf(row.dataset.address) === -1) return;
        var cell = $('.balance-cell', row);
        if (cell) cell.innerHTML = '<span class="text-muted">-</span>';
      });
      return;
    }
    BalanceChecker.fetchBitcoinBalancesBatch(addrs).then(function (map) {
      $all('#dormant-table .key-row').forEach(function (row) {
        var addr = row.dataset.address;
        if (addrs.indexOf(addr) === -1) return;
        var cell = $('.balance-cell', row);
        if (!cell) return;
        cell.innerHTML = balanceCellHtml(map && map.has(addr) ? map.get(addr) : null);
      });
    }).catch(function () {
      $all('#dormant-table .key-row').forEach(function (row) {
        if (addrs.indexOf(row.dataset.address) === -1) return;
        var cell = $('.balance-cell', row);
        if (cell) cell.innerHTML = '<span class="text-muted">-</span>';
      });
    });
  }

  // ---- row rendering --------------------------------------------------------
  function rowHtml(e) {
    var a = e.address;
    var dormant  = e.dormant  ? '<span class="badge bg-danger">' + e.dormant + '</span>'
                              : '<span class="badge bg-secondary">-</span>';
    var moved    = e.moved    ? '<span class="text-warning fw-bold">' + e.moved + '</span>'
                              : '<span class="text-muted">-</span>';
    var awakened = e.awakened ? '<small class="text-muted" title="' + e.awakened + '">' + e.awakened + '</small>'
                              : '<small class="text-muted">-</small>';
    return '' +
      '<div class="key-row" data-address="' + a + '">' +
        '<div class="col-address">' +
          '<a href="' + detailHref(a) + '" class="address-link font-monospace">' + a + '</a>' +
          '<button class="copy-btn" onclick="CryptographyTube.copy(\'' + a + '\')" title="Copy">' +
            '<img src="/assets/svgs/regular/copy.svg" class="fa-icon " width="12" height="12" alt="">' +
          '</button>' +
        '</div>' +
        '<div class="col-dormant">' + dormant + '</div>' +
        '<div class="col-moved">' + moved + '</div>' +
        '<div class="col-balance balance-cell">' +
          '<span class="balance-loading"><img src="/assets/svgs/solid/spinner.svg" class="fa-icon fa-spin" width="14" height="14" alt=""></span>' +
        '</div>' +
        '<div class="col-awakened">' + awakened + '</div>' +
        '<div class="col-action">' +
          '<a href="' + detailHref(a) + '" class="detail-link" title="View Details">' +
            '<img src="/assets/svgs/solid/circle-info.svg" class="fa-icon " width="12" height="12" alt=""> <span class="detail-text">Details</span>' +
          '</a>' +
        '</div>' +
      '</div>';
  }

  // ---- pagination -----------------------------------------------------------
  function pageWindow(current, total) {
    // 1 … (c-1) c (c+1) … total  — de-duplicated, ordered, with 0 = ellipsis
    var s = {};
    s[1] = 1; s[total] = total;
    for (var d = -1; d <= 1; d++) { var n = current + d; if (n >= 1 && n <= total) s[n] = n; }
    var nums = Object.keys(s).map(Number).sort(function (a, b) { return a - b; });
    var out = [];
    for (var i = 0; i < nums.length; i++) {
      if (i && nums[i] - nums[i - 1] > 1) out.push(0); // ellipsis marker
      out.push(nums[i]);
    }
    return out;
  }

  var IC = {
    first: '/assets/svgs/solid/angles-left.svg',
    prev:  '/assets/svgs/solid/angle-left.svg',
    next:  '/assets/svgs/solid/angle-right.svg',
    last:  '/assets/svgs/solid/angles-right.svg',
    go:    '/assets/svgs/solid/arrow-right.svg'
  };
  function icon(src) { return '<img src="' + src + '" class="fa-icon " width="12" height="12" alt="">'; }

  function buildPagination(current, total) {
    var nav = document.getElementById('dormantPagination');
    if (!nav) return;

    function navBtn(target, ic, title, enabled) {
      return enabled
        ? '<a href="' + pageHref(target) + '" class="btn btn-sm btn-outline-secondary" title="' + title + '">' + icon(ic) + '</a>'
        : '<button class="btn btn-sm btn-outline-secondary" disabled>' + icon(ic) + '</button>';
    }

    var pages = pageWindow(current, total).map(function (n) {
      if (n === 0) return '<span class="btn btn-sm btn-outline-secondary disabled">...</span>';
      if (n === current) return '<span class="btn btn-sm btn-primary">' + n + '</span>';
      return '<a href="' + pageHref(n) + '" class="btn btn-sm btn-outline-secondary">' + n + '</a>';
    }).join('');

    nav.innerHTML = '' +
      '<div class="d-flex flex-wrap align-items-center justify-content-center gap-2">' +
        '<div class="pagination-nav">' +
          navBtn(1, IC.first, 'First', current > 1) +
          navBtn(current - 1, IC.prev, 'Previous', current > 1) +
        '</div>' +
        '<div class="pagination-pages d-none d-sm-flex gap-1">' + pages + '</div>' +
        '<div class="pagination-info d-sm-none">' +
          '<span class="btn btn-sm btn-outline-secondary disabled">' + current + ' / ' + total + '</span>' +
        '</div>' +
        '<div class="pagination-nav">' +
          navBtn(current + 1, IC.next, 'Next', current < total) +
          navBtn(total, IC.last, 'Last', current < total) +
        '</div>' +
      '</div>' +
      '<div class="d-flex align-items-center justify-content-center gap-2 mt-2">' +
        '<span class="text-muted small">Go to page:</span>' +
        '<input type="number" class="form-control form-control-sm" id="dormantPaginationInput" ' +
               'min="1" max="' + total + '" style="width: 80px;" value="' + current + '">' +
        '<button class="btn btn-sm btn-primary" id="dormantPaginationGo">' + icon(IC.go) + ' Go</button>' +
        '<span class="text-muted small ms-2">of ' + total + ' pages</span>' +
      '</div>';

    var input = document.getElementById('dormantPaginationInput');
    var go = document.getElementById('dormantPaginationGo');
    function jump() {
      var v = parseInt(input.value, 10) || 1;
      v = Math.max(1, Math.min(total, v));
      if (v !== current) location.href = pageHref(v);
    }
    if (go) go.addEventListener('click', jump);
    if (input) input.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') jump(); });
  }

  // ---- LIST page ------------------------------------------------------------
  function normaliseDetailLinks() {
    // Point every baked row's address + Details links at the extensionless live
    // URL, so routing serves the pre-rendered file when it exists, else the
    // dynamic template. (Fixes the "Details 404" for the 251 un-baked pages.)
    $all('#dormant-table .key-row').forEach(function (row) {
      var addr = row.dataset.address;
      if (!addr) return;
      $all('a.address-link, a.detail-link', row).forEach(function (a) {
        a.setAttribute('href', detailHref(addr));
      });
    });
  }

  function updateCounts(total) {
    var badge = document.querySelector('header .badge.bg-primary');
    if (badge && /addresses/i.test(badge.textContent)) badge.textContent = total + ' addresses';
    var stat = document.querySelector('.card .fs-4.fw-bold.text-primary');
    if (stat) stat.textContent = String(total);
  }

  function initList() {
    normaliseDetailLinks();
    var page = currentListPage();

    loadTxt().then(function (txt) {
      var extra = txt.length;
      var totalItems = BAKED_TOTAL + extra;
      var totalPages = BAKED_PAGES + (extra > 0 ? Math.ceil(extra / PER_PAGE) : 0);

      updateCounts(totalItems);
      buildPagination(page, totalPages);

      if (page <= BAKED_PAGES) return; // baked pages render themselves + engine fills balances

      // Virtual page (12+): the template is cloned from page 12, so correct the
      // SEO head for this page number, then show this page's addresses.txt slice.
      document.title = 'Bitcoin Dormant Wallets - Page ' + page + ' | CryptographyTube';
      var can = document.querySelector('link[rel="canonical"]');
      if (can) can.setAttribute('href', location.origin + pageHref(page));

      var table = document.getElementById('dormant-table');
      if (!table) return;
      $all('.key-row', table).forEach(function (r) { r.parentNode.removeChild(r); });

      var start = (page - BAKED_PAGES - 1) * PER_PAGE;
      var slice = txt.slice(start, start + PER_PAGE);
      if (!slice.length) {
        table.insertAdjacentHTML('beforeend',
          '<div class="p-4 text-center text-muted">No addresses on this page.</div>');
        return;
      }
      table.insertAdjacentHTML('beforeend', slice.map(rowHtml).join(''));
      fillBalances(slice.map(function (e) { return e.address; }));
    });
  }

  // ---- DETAIL template ------------------------------------------------------
  function initDetail() {
    var raw = location.pathname.replace(/\/+$/, '').split('/address/')[1] || '';
    var addr = decodeURIComponent(raw).replace(/\.html$/, '');
    var valid = isBtcAddress(addr);

    if (valid) {
      window.DORMANT_ADDRESS = addr;               // engine loads the live balance
      document.title = 'Dormant Address ' + addr + ' - CryptographyTube';
    }

    function setText(id, v) { var el = document.getElementById(id); if (el && v != null) el.textContent = v; }
    function setHtml(id, v) { var el = document.getElementById(id); if (el && v != null) el.innerHTML = v; }

    // address-bearing spots
    $all('.detail-address').forEach(function (el) { el.textContent = valid ? addr : (addr || 'Invalid address'); });
    setText('d-address-full', valid ? addr : (addr || '(none)'));
    setText('d-crumb', addr.length > 12 ? addr.slice(0, 8) + '…' : (addr || '—'));

    var copyBtn = document.querySelector('.detail-header-actions .btn-outline-primary');
    if (copyBtn && valid) copyBtn.setAttribute('onclick', "CryptographyTube.copy('" + addr + "')");
    var expl = document.querySelector('.detail-header-actions a.btn-primary');
    if (expl && valid) expl.href = 'https://blockchain.com/btc/address/' + addr;

    if (!valid) return;

    // metadata: prefer the baked index (all 543), fall back to addresses.txt (#544+)
    Promise.all([loadIndex(), loadTxt()]).then(function (res) {
      var idx = res[0] || {}, txt = res[1] || [];
      var m = idx[addr];
      var meta = m ? { dormant: m.d, moved: m.m, awakened: m.a, block: m.b } : null;
      if (!meta) {
        for (var i = 0; i < txt.length; i++) if (txt[i].address === addr) { meta = txt[i]; break; }
      }
      if (!meta) return;
      if (meta.dormant)  setText('d-years', /y|year/i.test(meta.dormant)
                                   ? meta.dormant.replace(/y$/, ' years')
                                   : meta.dormant + ' years');
      if (meta.moved)    setText('d-moved', meta.moved);
      if (meta.awakened) { setText('d-awakened', meta.awakened); setText('d-tracked', meta.awakened); }
      if (meta.block) {
        var br = document.getElementById('d-block-row');
        if (br) br.style.display = '';
        setHtml('d-block', '<a href="https://blockchain.com/btc/block/' + meta.block +
                           '" target="_blank">#' + meta.block + '</a>');
      }
    });
  }

  // ---- dispatch -------------------------------------------------------------
  function boot() {
    if (document.getElementById('current-balance') && document.querySelector('.dormant-detail')) {
      initDetail();
    } else if (document.getElementById('dormant-table')) {
      initList();
    }
  }

  // `defer` scripts run after the DOM is parsed, so the DOM is ready here; but
  // guard just in case this is ever loaded without defer.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
