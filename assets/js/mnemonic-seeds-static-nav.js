/*
 * Mnemonic-Seeds static single-page navigation.
 *
 * One file (index.html) serves EVERY page of a chain's mnemonic-seeds directory.
 * The page number lives in the URL query string (?page=N) so it works on any
 * static host (local serve.py, Netlify _redirects, Apache) with no routing rules
 * -- unlike the old /mnemonic-seeds/<chain>/N links, which 404 without a server.
 *
 * This runs as the FIRST deferred script, i.e. after the inline
 * MNEMONIC_SEEDS_CONFIG / CGT_CONFIG blocks and after the DOM is parsed, but
 * before the app modules (ui/app/mnemonic-seeds) execute. It:
 *   1. reads ?page and clamps it to the valid range,
 *   2. rewrites MNEMONIC_SEEDS_CONFIG (page / startEntropy / count) so the
 *      engine derives the correct seeds,
 *   3. rebuilds the #keysContainer rows for exactly this page,
 *   4. updates the header, progress bar and Page-jump input,
 *   5. points First / Previous / Next / Last at ?page= URLs, and
 *   6. wraps MnemonicSeeds.navigateToPage so Random / Jump stay on this file.
 *
 * Chain-agnostic: every value it needs comes from the page's own config, so the
 * identical file is reused by all chains.
 */
(function () {
    'use strict';

    // Same for every chain: 2^128 total mnemonics, 60 per page.
    var PER_PAGE = 60n;
    var TOTAL_MNEMONICS = 340282366920938463463374607431768211456n; // 2^128
    var TOTAL_PAGES = 5671372782015641057722910123862803525n;       // ceil(2^128 / 60)
    var TOTAL_PAGES_DISPLAY = '#5.67E+36';                           // short form shown in header

    // ---- 1. Which page? -----------------------------------------------------
    function readPage() {
        var raw = '';
        try {
            raw = (new URLSearchParams(window.location.search).get('page') || '');
        } catch (e) { raw = ''; }
        raw = String(raw).replace(/[^0-9]/g, '');
        if (!raw) return 1n;
        var n;
        try { n = BigInt(raw); } catch (e) { return 1n; }
        if (n < 1n) n = 1n;
        if (n > TOTAL_PAGES) n = TOTAL_PAGES;
        return n;
    }

    var page = readPage();
    var startEntropy = (page - 1n) * PER_PAGE;
    var remaining = TOTAL_MNEMONICS - startEntropy;           // seeds left from here
    var count = remaining < PER_PAGE ? Number(remaining) : 60; // last page has < 60

    // href for a given page number: page 1 is the clean directory URL.
    function pageHref(n) {
        return (n <= 1n) ? './' : ('?page=' + n.toString());
    }

    // ---- 2. Feed the engine the right config --------------------------------
    try {
        if (window.MNEMONIC_SEEDS_CONFIG) {
            window.MNEMONIC_SEEDS_CONFIG.page = page.toString();
            window.MNEMONIC_SEEDS_CONFIG.startEntropy = startEntropy.toString();
            window.MNEMONIC_SEEDS_CONFIG.count = count;
        }
    } catch (e) {}
    try {
        if (window.CGT_CONFIG) window.CGT_CONFIG.page = page.toString();
    } catch (e) {}

    // ---- 3. Build this page's seed rows -------------------------------------
    // Placeholder markup identical to the pre-rendered static pages; the engine
    // fills in each row (key, address, mnemonic) from its data-entropy value.
    function rowHtml(entropy) {
        return '' +
            '<div class="key-row" data-entropy="' + entropy + '">' +
                '<div class="col-key">' +
                    '<div class="key-hex">' +
                        '<span class="key-label">Seed #' + entropy + '</span>' +
                        '<a href="#" class="private-key">Loading...</a>' +
                        '<button class="copy-btn copy-key" title="Copy Private Key">' +
                            '<img src="/assets/svgs/regular/copy.svg" class="fa-icon " width="12" height="12" alt=""></button>' +
                    '</div>' +
                '</div>' +
                '<div class="col-address">' +
                    '<a href="#" class="address" target="_blank" rel="noopener">Calculating...</a>' +
                    '<a href="#" class="address-u" target="_blank" rel="noopener" style="display: none;"></a>' +
                '</div>' +
                '<div class="col-balance">-</div>' +
                '<div class="col-mnemonic">' +
                    '<span class="key-label">Mnemonic</span>' +
                    '<span class="mnemonic-text"><img src="/assets/svgs/solid/spinner.svg" class="fa-icon fa-spin" width="12" height="12" alt=""></span>' +
                    '<button class="copy-btn copy-mnemonic" title="Copy Mnemonic">' +
                        '<img src="/assets/svgs/regular/copy.svg" class="fa-icon " width="12" height="12" alt=""></button>' +
                '</div>' +
            '</div>';
    }

    var container = document.getElementById('keysContainer');
    if (container) {
        var rows = '';
        for (var i = 0; i < count; i++) {
            rows += rowHtml((startEntropy + BigInt(i)).toString());
        }
        container.innerHTML = rows;
    }

    // ---- 4. Header, progress bar, jump input --------------------------------
    var pageStr = page.toString();
    // percentage with 4 decimals, computed in BigInt to survive the huge totals
    var pct = Number((page * 1000000n) / TOTAL_PAGES) / 10000;
    var pctStr = pct.toFixed(4) + '%';

    var chainName = 'Bitcoin';
    try {
        if (window.CGT_CONFIG && window.CGT_CONFIG.chainInfo && window.CGT_CONFIG.chainInfo.name) {
            chainName = window.CGT_CONFIG.chainInfo.name;
        }
    } catch (e) {}

    var infoSpan = document.querySelector('.page-info-text span');
    if (infoSpan) {
        infoSpan.innerHTML =
            chainName + ' mnemonic seeds page <strong>#' + pageStr + '</strong> ' +
            'out of <strong>' + TOTAL_PAGES_DISPLAY + '</strong> (' + pctStr + ')';
    }

    var bar = document.querySelector('.progress-bar');
    if (bar) bar.style.width = pct + '%';
    var barText = document.querySelector('.progress-bar .progress-text');
    if (barText) barText.textContent = pctStr;

    var jumpInput = document.getElementById('pageInput');
    if (jumpInput) jumpInput.value = pageStr;

    // ---- 5. First / Previous / Next / Last links ----------------------------
    var prev = page > 1n ? page - 1n : 1n;
    var next = page < TOTAL_PAGES ? page + 1n : TOTAL_PAGES;
    var targets = [1n, prev, next, TOTAL_PAGES]; // order matches the anchors below
    var navBars = document.querySelectorAll('.nav-buttons');
    for (var b = 0; b < navBars.length; b++) {
        // Anchors in order: First, Previous, Next, Last (Random is a <button>).
        var links = navBars[b].querySelectorAll('a.btn');
        for (var k = 0; k < links.length && k < targets.length; k++) {
            links[k].setAttribute('href', pageHref(targets[k]));
        }
    }

    // ---- 6. Keep EVERY selector/navigation action on this single file -------
    // Random/Jump funnel through navigateToPage(); the address-type cards call
    // changeAddressType(); Word-Count + Derivation-Path apply via applyOptions().
    // The latter two build their OWN /mnemonic-seeds/<chain>/<page>?... URL and
    // assign window.location.href -- and on any page reached via Random/Jump that
    // <page> is a huge number with no pre-rendered file, so it 404s. location.href
    // can't be reliably wrapped (the module assigns it through a computed property
    // that bypasses a prototype setter), so we replace the three navigating methods
    // at the API level the instant the module publishes window.MnemonicSeeds, and
    // re-route each to THIS renderer's ?page=N form. Param construction is delegated
    // to the module's own buildParams()/findPresetByPath()/state, so the selection
    // stays 1:1 with the original -- no derivation/type/bits values are hard-coded.

    // Clamp any page value (string|number|bigint) into [1, TOTAL_PAGES].
    function clampPage(v) {
        var digits = String(v == null ? '' : v).replace(/[^0-9]/g, '');
        var n;
        try { n = BigInt(digits || '1'); } catch (e) { n = 1n; }
        if (n < 1n) n = 1n;
        if (n > TOTAL_PAGES) n = TOTAL_PAGES;
        return n;
    }

    // Navigate to page N on THIS file, carrying a selection query string.
    function goToPage(pageValue, paramStr) {
        var href = pageHref(clampPage(pageValue));        // './'  or  '?page=N'
        if (paramStr) href += (href.indexOf('?') === -1 ? '?' : '&') + paramStr;
        window.location.href = href;
    }

    function patchNav(ms) {
        if (!ms || typeof ms !== 'object' || ms.__cgtStaticNavPatched) return;

        // Random / Jump -> stay here, CARRYING the current selection forward
        // (buildParams reads it from the URL; the previous trap dropped it,
        // which is why a random page used to reset the address type).
        if (typeof ms.navigateToPage === 'function') {
            ms.navigateToPage = function (p) {
                var params = '';
                try { if (this.buildParams) params = this.buildParams({ defaultType: '' }); } catch (e) {}
                goToPage(p, params);
            };
        }

        // Address-type cards -> keep the current page, swap the type.
        if (typeof ms.changeAddressType === 'function') {
            ms.changeAddressType = function (type) {
                var params;
                try { params = this.buildParams ? this.buildParams({ typeOverride: type, defaultType: '' }) : null; }
                catch (e) { params = null; }
                if (params == null) params = 'type=' + encodeURIComponent(type);
                goToPage((this.config && this.config.page) || '1', params);
            };
        }

        // "Apply" (Word Count + Derivation Path) -> mirror applyOptions() but
        // land on this renderer instead of a bare /<chain>/<page> file.
        if (typeof ms.applyOptions === 'function') {
            ms.applyOptions = function () {
                var cfg = this.config || {};
                var bitsEl = document.getElementById('bitsSelect');
                var pathEl = document.getElementById('pathInput');
                var bits = bitsEl ? bitsEl.value : cfg.bits;
                var path = pathEl ? String(pathEl.value || '').trim() : '';
                var out = new URLSearchParams();

                if (this.currentAddressType) out.set('type', this.currentAddressType);
                if (String(bits) !== '128') out.set('bits', bits);

                var preset = this.selectedPreset ||
                             (this.findPresetByPath ? this.findPresetByPath(path) : '');
                if (preset) out.set('preset', preset);
                else if (path) out.set('path', path);

                // Changing the word count moves to a different entropy space, so
                // reset to page 1 -- exactly like the original applyOptions().
                var page = (String(bits) !== String(cfg.bits)) ? '1' : (cfg.page || '1');
                goToPage(page, out.toString());
            };
        }

        ms.__cgtStaticNavPatched = true;
    }

    var _ms = window.MnemonicSeeds;   // capture if it somehow already exists
    try {
        Object.defineProperty(window, 'MnemonicSeeds', {
            configurable: true,
            enumerable: true,
            get: function () { return _ms; },
            set: function (value) { _ms = value; try { patchNav(value); } catch (e) {} }
        });
        if (_ms) patchNav(_ms);
    } catch (e) {}
})();
