/*
 * brainwallet-fix.js
 * -------------------------------------------------------------------------
 * Static-hosting fix for the /brainwallet/<chain> pages (all 18 chains),
 * mirroring what milk-sad-fix.js does for /milk-sad.
 *
 * On the original PHP site the pagination (First/Prev/Random/Next/Last/Jump)
 * and the Bitcoin/Litecoin/BCH "Address Type" selector work by navigating to
 * the SAME url with the choice encoded either as a path segment
 * (/brainwallet/<chain>/<page>) or as a query param (?type=). The PHP backend
 * read those and served the right page.
 *
 * This static export has no backend, so two things break:
 *   (1) app.obf.js's goToBrainwalletPage()/changeBrainwallet*AddressType() OMIT
 *       the chain segment for the default chain (bitcoin): Random builds
 *       "/brainwallet/<N>" (404) and the address-type selector builds bare
 *       "/brainwallet" (the chain-picker landing page). We override those
 *       methods on window.CGT so they ALWAYS emit
 *       /brainwallet/<chain>[/<page>][?type=], which map to real routes.
 *   (2) only pages 1, 2 and the last page (315) are pre-rendered as files for
 *       every NON-bitcoin chain (bitcoin has all 315), so Random / Jump / Next
 *       to any other page 404. serve.py (and _redirects / .htaccess in prod)
 *       resolve an unknown /brainwallet/<chain>/<N> to that chain's 2.html
 *       template; this script then RE-RENDERS it as page N by fetching the
 *       passphrase wordlist, hashing each one (HEX = SHA256(utf-8 passphrase),
 *       exactly like generate_brainwallet.py) and rebuilding the rows.
 *       app.obf.js then derives address + WIF + balance from the baked HEX.
 *
 * Loads as a NON-defer <script> AFTER window.CGT_CONFIG and BEFORE the deferred
 * *.obf.js, so it can (a) patch config before init() reads it and (b) register
 * a DOMContentLoaded handler that runs BEFORE the engine's
 * (document.addEventListener("DOMContentLoaded",()=>CGT.init())) — the engine
 * registers its listener later (deferred), so ours fires first and installs the
 * overrides before init() -> initBrainwallet() -> generateBrainwalletKeys().
 */
(function () {
    'use strict';

    var cfg = window.CGT_CONFIG;
    // Only the per-chain browse pages; skip the chain-picker landing (action:'chains').
    if (!cfg || cfg.module !== 'brainwallet' || cfg.action === 'chains' || !cfg.chain) return;

    var chain = cfg.chain;
    var PER = 60;
    var TOTAL = parseInt(cfg.totalPages, 10) || 315;
    var base = cfg.baseUrl || '';
    var defType = chain === 'bitcoin-cash' ? 'cashaddr' : 'legacy';
    var VALID = ['legacy', 'segwit', 'script', 'taproot', 'cashaddr'];

    // ---------------- (1) PARAM BRIDGE: ?type= -> CGT_CONFIG.type ----------------
    var params = null;
    try { params = new URLSearchParams(window.location.search); } catch (e) { params = null; }
    var qtype = params && params.get('type');
    if (qtype && VALID.indexOf(qtype) >= 0) cfg.type = qtype;

    // ---------------- (2) TARGET PAGE from the URL ----------------
    function targetPage() {
        // /brainwallet/<chain>/<N>  or  /brainwallet/<N> (bitcoin implicit), ± .html
        var m = window.location.pathname.match(/\/brainwallet\/(?:[a-z0-9-]+\/)?(\d+)(?:\.html)?\/?$/i);
        if (m) return parseInt(m[1], 10);
        return parseInt(cfg.page, 10) || 1;
    }
    var N = targetPage();
    if (!(N > 0)) N = 1;
    if (N > TOTAL) N = TOTAL;
    var baked = parseInt(cfg.page, 10) || 1;

    // Re-render only when the requested page differs from the baked one. Bitcoin
    // has every page pre-rendered, so this never fires there; non-bitcoin chains
    // only have 2.html/315.html baked, so any other page is rebuilt here.
    var ready = Promise.resolve();
    if (N !== baked) {
        cfg.page = String(N);
        ready = rebuildPage(N).catch(function (e) {
            try { console.error('[brainwallet-fix] re-render failed', e); } catch (_) {}
        });
    }

    document.addEventListener('DOMContentLoaded', function () {
        patchNav();
        patchGenerate();
        highlightCard(cfg.type);
        syncPageInput(N);
    });

    // ------------------------- nav method overrides -------------------------
    function buildUrl(page, type, dType) {
        var url = base + '/brainwallet/' + chain;
        if (page && String(page) !== '1') url += '/' + page;
        if (type && type !== dType) url += '?type=' + encodeURIComponent(type);
        return url;
    }

    function patchNav() {
        var CGT = window.CGT;
        if (!CGT || CGT.__bwFix) return;
        // Random & Jump both delegate to goToBrainwalletPage, so overriding it
        // (plus the three address-type entry points) is enough.
        CGT.goToBrainwalletPage = function (page) {
            window.location.href = buildUrl(page, cfg.type, defType);
        };
        CGT.changeBrainwalletAddressType = function (t) {
            window.location.href = buildUrl(cfg.page, t, 'legacy');
        };
        CGT.changeBrainwalletBCHAddressType = function (t) {
            window.location.href = buildUrl(cfg.page, t, 'cashaddr');
        };
        CGT.changeBrainwalletLTCAddressType = function (t) {
            window.location.href = buildUrl(cfg.page, t, 'legacy');
        };
        CGT.__bwFix = true;
    }

    // Make the engine's derivation wait for the async re-render to finish.
    function patchGenerate() {
        var CGT = window.CGT;
        if (!CGT) return;
        var orig = CGT.generateBrainwalletKeys;
        if (typeof orig !== 'function' || orig.__bwWrapped) return;
        var wrapped = function () {
            var self = this, args = arguments;
            return Promise.resolve(ready).then(function () { return orig.apply(self, args); });
        };
        wrapped.__bwWrapped = true;
        CGT.generateBrainwalletKeys = wrapped;
    }

    // ------------------------- client-side re-render -------------------------
    function wordlistUrl() {
        return base + '/brainwallet/brainwallet_website_format.txt';
    }

    var _decoder = null;
    function htmlUnescape(s) {
        if (s.indexOf('&') < 0) return s; // fast path: no entities
        if (!_decoder) _decoder = document.createElement('textarea');
        _decoder.innerHTML = s;
        return _decoder.value;
    }

    function toHex(buf) {
        var b = new Uint8Array(buf), h = '';
        for (var i = 0; i < b.length; i++) h += (b[i] < 16 ? '0' : '') + b[i].toString(16);
        return h;
    }

    function sha256Hex(str) {
        var bytes = new TextEncoder().encode(str);
        return crypto.subtle.digest('SHA-256', bytes).then(toHex);
    }

    function rebuildPage(N) {
        var container = document.getElementById('keysContainer');
        if (!container) return Promise.resolve();
        var tpl = container.querySelector('.key-row');
        if (!tpl) return Promise.resolve();
        return fetch(wordlistUrl()).then(function (r) { return r.text(); }).then(function (txt) {
            var lines = txt.split('\n');
            if (lines.length && lines[lines.length - 1] === '') lines.pop();
            var chunk = lines.slice((N - 1) * PER, (N - 1) * PER + PER);
            // Display form = the browser-decoded passphrase (matches the baked
            // rows); hash input is the same string, UTF-8 encoded.
            var reals = chunk.map(htmlUnescape);
            return Promise.all(reals.map(sha256Hex)).then(function (hexes) {
                var frag = document.createDocumentFragment();
                for (var i = 0; i < reals.length; i++) {
                    var row = tpl.cloneNode(true);
                    row.setAttribute('data-index', String(i));
                    row.setAttribute('data-passphrase', reals[i]);
                    row.classList.remove('highlighted', 'pulse', 'flash');
                    var pk = row.querySelector('.private-key');
                    if (pk) pk.textContent = hexes[i];
                    var pt = row.querySelector('.passphrase-text');
                    if (pt) pt.textContent = reals[i];
                    var copies = row.querySelectorAll('.copy-btn');
                    if (copies[0]) copies[0].setAttribute('onclick', "CryptographyTube.copy('" + hexes[i] + "')");
                    if (copies[1]) copies[1].setAttribute('onclick', 'CryptographyTube.copy(' + JSON.stringify(reals[i]) + ')');
                    var ca = row.querySelector('.col-address');
                    if (ca) ca.innerHTML = '<span class="text-muted">Calculating...</span>';
                    var cb = row.querySelector('.col-balance');
                    if (cb) cb.textContent = '-';
                    frag.appendChild(row);
                }
                container.innerHTML = '';
                container.appendChild(frag);
                updateHeader(N);
                updateNavLinks(N);
            });
        });
    }

    // ------------------------- header / nav / controls -------------------------
    function updateHeader(N) {
        var info = document.querySelector('.page-info-text');
        if (info) {
            var strong = info.querySelector('strong'); // first <strong> = current page #
            if (strong) strong.textContent = '#' + N;
        }
        var txt = N === TOTAL ? '100%' : (N / TOTAL * 100).toFixed(2) + '%';
        var bar = document.querySelector('.progress-bar');
        if (bar) {
            bar.style.width = txt;
            var t = bar.querySelector('.progress-text');
            if (t) t.textContent = txt;
        }
    }

    function carryType() {
        var ty = cfg.type;
        return (ty && ty !== defType) ? '?type=' + encodeURIComponent(ty) : '';
    }

    function pageUrl(p) {
        var url = '/brainwallet/' + chain;
        if (p > 1) url += '/' + p;
        return url + carryType();
    }

    function updateNavLinks(N) {
        var q = { first: 1, prev: Math.max(1, N - 1), next: Math.min(TOTAL, N + 1), last: TOTAL };
        var matched = false;
        ['first', 'prev', 'next', 'last'].forEach(function (key) {
            var uses = document.querySelectorAll('.nav-buttons a use[href*="#icon-' + key + '"]');
            Array.prototype.forEach.call(uses, function (use) {
                var a = use.closest ? use.closest('a') : null;
                if (a) { a.setAttribute('href', pageUrl(q[key])); matched = true; }
            });
        });
        if (!matched) {
            // Fallback: each .nav-buttons block is [First, Prev, Next, Last] anchors
            // in order (Random is a <button>, not an <a>).
            var order = ['first', 'prev', 'next', 'last'];
            var blocks = document.querySelectorAll('.nav-buttons');
            Array.prototype.forEach.call(blocks, function (block) {
                var as = block.querySelectorAll('a');
                if (as.length === 4) for (var i = 0; i < 4; i++) as[i].setAttribute('href', pageUrl(q[order[i]]));
            });
        }
    }

    function syncPageInput(N) {
        var inp = document.getElementById('pageInput');
        if (inp) inp.value = String(N);
    }

    function highlightCard(type) {
        var at = type || defType;
        var needle = "('" + at + "')";
        var cards = document.querySelectorAll('.address-type-card');
        Array.prototype.forEach.call(cards, function (card) {
            var oc = card.getAttribute('onclick') || '';
            card.classList.toggle('active', oc.indexOf(needle) !== -1);
        });
    }
})();
