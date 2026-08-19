/*
 * milk-sad-fix.js
 * -------------------------------------------------------------------------
 * Static-hosting fix for the /milk-sad/<chain> pages, mirroring what
 * static-config-fix.js + the nav fixes do for /mnemonic-seeds.
 *
 * On the original PHP site the "Bitcoin Address Type" / entropy / BIP-32 path
 * selectors and the pagination (First/Prev/Next/Last/Random/Go) work by
 * navigating to the SAME url with the choice encoded either as a path segment
 * (/milk-sad/<chain>/<page>) or as query params (?type=&bits=&preset=|path=&bip39=1).
 * The PHP backend read those and baked them into window.MILK_SAD_CONFIG before
 * serving the page.
 *
 * This static export has no backend, so:
 *   (1) the reloaded page always carries the hardcoded config defaults
 *       (addressType:'legacy', bits:192, path:'') and the selection is ignored, and
 *   (2) only pages 1, 2 and the last page are pre-rendered as real .html files;
 *       every other page (Random, Go-to-seed, Next past page 2) 404s.
 *
 * This script restores both behaviours purely client-side. It MUST load as a
 * normal (non-defer) <script> placed AFTER the inline MILK_SAD_CONFIG /
 * MILK_SAD_PRESETS definitions and BEFORE the deferred *.obf.js scripts, so the
 * config is patched before milk-sad.obf.js's init()/generateAllKeys() read it.
 *
 * Server side: serve.py (and _redirects / .htaccess in production) resolve an
 * unknown /milk-sad/<chain>/<N> to that chain's 1.html, whose absolute /assets/
 * paths keep loading; this script then re-renders it as page N.
 */
(function () {
    'use strict';

    var cfg = window.MILK_SAD_CONFIG;
    if (!cfg) return; // not a milk-sad page

    var chain = cfg.chain || 'bitcoin';
    // Mirrors the obf's per-chain default address type (omitted from the URL).
    var DEFAULT_TYPE = { 'bitcoin': 'legacy', 'bitcoin-cash': 'cashaddr', 'litecoin': 'legacy' };

    var params = null;
    try { params = new URLSearchParams(window.location.search); } catch (e) { params = null; }

    // ---------------- (1) PARAM BRIDGE: URL query -> MILK_SAD_CONFIG ----------------
    if (params) {
        var type = params.get('type');
        if (type) cfg.addressType = type;

        var bits = parseInt(params.get('bits'), 10);
        if (bits === 128 || bits === 192 || bits === 256) cfg.bits = bits;

        var presets = (window.MILK_SAD_PRESETS || {})[chain] || [];
        var presetId = params.get('preset');
        var rawPath = params.get('path');
        if (presetId) {
            var byId = presets.filter(function (p) { return p.id === presetId; })[0];
            if (byId) { cfg.path = byId.path; cfg.preset = byId.id; }
            else { cfg.preset = presetId; }
        } else if (rawPath) {
            cfg.path = rawPath;
            var byPath = presets.filter(function (p) { return p.path === rawPath; })[0];
            cfg.preset = byPath ? byPath.id : '';
        }
        if (params.get('bip39') === '1') cfg.useBip39 = true;
    }

    // ---------------- (2) PAGE RESOLUTION from the URL ----------------
    var seedsPerPage = cfg.seedsPerPage || 60;
    var totalPages = cfg.totalPages || 1;
    var totalSeeds = cfg.totalSeeds || (totalPages * seedsPerPage);

    function targetPage() {
        var p = params ? parseInt(params.get('page'), 10) : NaN;
        if (p && p > 0) return p;
        // /milk-sad/<chain>/<N>  (optionally .html)
        var m = window.location.pathname.match(/\/milk-sad\/[a-z0-9-]+\/(\d+)(?:\.html)?\/?$/i);
        if (m) return parseInt(m[1], 10);
        return 1;
    }

    var N = targetPage();
    if (!(N > 0)) N = 1;
    if (N > totalPages) N = totalPages;

    if (N !== (cfg.page || 1)) {
        var start = (N - 1) * seedsPerPage;
        var end = Math.min(start + seedsPerPage, totalSeeds);
        var seeds = [];
        for (var s = start; s < end; s++) seeds.push(s);
        cfg.page = N;
        cfg.startSeed = start;
        cfg.seeds = seeds;
        // The obf's generateAllKeys() only fills PRE-EXISTING .key-row[data-seed]
        // rows (it never creates them), so we must lay out the rows for page N
        // ourselves before the deferred init runs.
        try { rebuildRows(seeds); } catch (e) {}
        try { updateHeader(N); } catch (e) {}
        try { updateNav(N); } catch (e) {}
    }

    syncControls();

    // ------------------------------- helpers -------------------------------
    function rebuildRows(seeds) {
        var container = document.getElementById('keysContainer');
        if (!container) return;
        var tpl = container.querySelector('.key-row');
        if (!tpl) return;
        var frag = document.createDocumentFragment();
        for (var i = 0; i < seeds.length; i++) {
            var seed = seeds[i];
            var row = tpl.cloneNode(true);
            row.setAttribute('data-seed', String(seed));
            row.classList.remove('highlighted', 'pulse', 'flash');
            var lbl = row.querySelector('.col-key .key-label');
            if (lbl) lbl.textContent = 'Seed #' + seed;
            var pk = row.querySelector('.private-key');
            if (pk) { pk.textContent = 'Loading...'; pk.setAttribute('href', '#'); }
            var addr = row.querySelector('.address');
            if (addr) { addr.textContent = 'Calculating...'; addr.setAttribute('href', '#'); }
            var addru = row.querySelector('.address-u');
            if (addru) { addru.textContent = ''; addru.setAttribute('href', '#'); addru.style.display = 'none'; }
            var bal = row.querySelector('.col-balance');
            if (bal) bal.textContent = '-';
            var mn = row.querySelector('.mnemonic-text');
            if (mn) { mn.textContent = ''; mn.removeAttribute('title'); }
            frag.appendChild(row);
        }
        container.innerHTML = '';
        container.appendChild(frag);
    }

    function updateHeader(N) {
        var info = document.querySelector('.page-info-text');
        if (info) {
            var strong = info.querySelector('strong'); // first <strong> = current page #
            if (strong) strong.textContent = '#' + N.toLocaleString('en-US');
        }
        var pct = totalPages ? (N / totalPages) * 100 : 0;
        var bar = document.querySelector('.progress-bar');
        if (bar) {
            bar.style.width = pct + '%';
            var t = bar.querySelector('.progress-text');
            if (t) t.textContent = pct.toFixed(6) + '%';
        }
    }

    function carry() {
        if (!params) return '';
        var keep = new URLSearchParams();
        ['type', 'bits', 'preset', 'path', 'bip39'].forEach(function (k) {
            var v = params.get(k);
            if (v) keep.set(k, v);
        });
        var q = keep.toString();
        return q ? '?' + q : '';
    }

    function updateNav(N) {
        var q = carry();
        var targets = {
            first: 1,
            prev: Math.max(1, N - 1),
            next: Math.min(totalPages, N + 1),
            last: totalPages
        };
        // There are two nav bars (top + bottom); update every matching anchor in both.
        var matchedAny = false;
        ['first', 'prev', 'next', 'last'].forEach(function (key) {
            var uses = document.querySelectorAll('.nav-buttons a use[href$="#icon-' + key + '"]');
            Array.prototype.forEach.call(uses, function (use) {
                var a = use.closest ? use.closest('a') : null;
                if (a) { a.setAttribute('href', '/milk-sad/' + chain + '/' + targets[key] + q); matchedAny = true; }
            });
        });
        // Fallback: each .nav-buttons block holds [First, Prev, Next, Last] anchors in
        // order (Random is a <button>, not an <a>).
        if (!matchedAny) {
            var order = ['first', 'prev', 'next', 'last'];
            var blocks = document.querySelectorAll('.nav-buttons');
            Array.prototype.forEach.call(blocks, function (block) {
                var as = block.querySelectorAll('a');
                if (as.length === 4) {
                    for (var i = 0; i < 4; i++) {
                        as[i].setAttribute('href', '/milk-sad/' + chain + '/' + targets[order[i]] + q);
                    }
                }
            });
        }
    }

    function syncControls() {
        try {
            var bitsSelect = document.getElementById('bitsSelect');
            if (bitsSelect) bitsSelect.value = String(cfg.bits);

            var pathInput = document.getElementById('pathInput');
            if (pathInput && cfg.path) pathInput.value = cfg.path;

            var bip = document.getElementById('bip39Toggle');
            if (bip) bip.checked = !!cfg.useBip39;

            var at = cfg.addressType || DEFAULT_TYPE[chain] || 'legacy';
            var needle = "('" + at + "')";
            var cards = document.querySelectorAll('.address-type-card');
            Array.prototype.forEach.call(cards, function (card) {
                var oc = card.getAttribute('onclick') || '';
                card.classList.toggle('active', oc.indexOf(needle) !== -1);
            });
        } catch (e) { /* cosmetic only */ }
    }
})();
