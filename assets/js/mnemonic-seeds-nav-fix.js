/**
 * CGT Mnemonic Seeds Local Nav Fix  (top-level chain pages only)
 *
 * MnemonicSeeds.navigateToPage() (used by random/jump/apply-options/
 * address-type tabs) generates extensionless URLs like:
 *     /mnemonic-seeds/bitcoin/<N>
 * The obfuscated app navigates by assigning window.location via a
 * dynamically-resolved property, so it BYPASSES the Location.prototype.href
 * setter wrapped below -- the raw extensionless URL reaches the server and
 * 404s, because only a handful of numbered pages are pre-rendered as files.
 *
 * The reliable fix is therefore at the API level: we trap window.MnemonicSeeds
 * (exactly as mnemonic-seeds-static-nav.js does on the subdir index) and
 * REPLACE navigateToPage so real pagination (page != 1) is routed to the
 * chain's single-page index /mnemonic-seeds/<chain>/?page=N, which regenerates
 * ANY page client-side. Page 1 is the top-level page itself, so we delegate to
 * the original navigateToPage there -- that keeps the working address-type /
 * word-count / derivation-path reload behaviour (?type/?bits/?preset/?path)
 * completely untouched. The href-wrap below is kept as a harmless safety net.
 *
 * NOTE: this file is included ONLY on the top-level mnemonic-seeds/<chain>.html
 * pages. The subdir pages already have mnemonic-seeds-static-nav.js, which
 * installs its own MnemonicSeeds trap -- do not add this script there.
 */
(function () {
    'use strict';

    // --- API-level navigation override -----------------------------------
    // Route Random / Jump / arbitrary pagination to the client-side renderer.
    function overrideNavigate(ms) {
        if (!ms || typeof ms !== 'object' || ms.__cgtNavPatched) return ms;
        var orig = ms.navigateToPage;
        try {
            ms.navigateToPage = function (page) {
                var digits = String(page == null ? '' : page).replace(/[^0-9]/g, '');
                if (!digits) digits = '1';

                // Page 1 == this very (top-level) page. Keep the original
                // behaviour so address-type/word-count/derivation reloads,
                // which call navigateToPage with the current page (== '1'),
                // work exactly as before.
                if (digits === '1' && typeof orig === 'function') {
                    return orig.apply(this, arguments);
                }

                var cfg = window.MNEMONIC_SEEDS_CONFIG || {};
                var chain = cfg.chain || 'bitcoin';

                // Carry the active selection forward. It already lives in the
                // current URL (static-config-fix.js reads it from there), so a
                // straight copy is faithful to what the user picked.
                var carried = [];
                try {
                    var cur = new URLSearchParams(window.location.search);
                    ['type', 'bits', 'preset', 'path'].forEach(function (k) {
                        var v = cur.get(k);
                        if (v) carried.push(k + '=' + encodeURIComponent(v));
                    });
                } catch (e) { /* ignore */ }

                var url = '/mnemonic-seeds/' + chain + '/?page=' + digits +
                          (carried.length ? '&' + carried.join('&') : '');
                window.location.href = url;
            };
            ms.__cgtNavPatched = true;
        } catch (e) { /* leave original in place on any failure */ }
        return ms;
    }

    // Install the trap before the deferred *.obf.js assigns window.MnemonicSeeds.
    try {
        var _ms = window.MnemonicSeeds;
        if (_ms) overrideNavigate(_ms); // in case it somehow already exists
        Object.defineProperty(window, 'MnemonicSeeds', {
            configurable: true,
            enumerable: true,
            get: function () { return _ms; },
            set: function (value) { _ms = overrideNavigate(value); }
        });
    } catch (e) { /* if the property can't be trapped, fall back to href-wrap */ }

    function fixMnemonicPath(url) {
        if (typeof url !== 'string') return url;
        if (url.indexOf('://') !== -1) return url;

        // /mnemonic-seeds/<chain>/<page>[?query]
        var m = url.match(/^([^?#]*\/mnemonic-seeds\/[^\/?#]+\/[^\/?#]+)([?#].*)?$/);
        if (m) {
            var slash = m[1].lastIndexOf('/');
            var lastSeg = m[1].substring(slash + 1);
            // Numbered sub-pages (Random / Jump / arbitrary pagination) are NOT
            // pre-rendered as files except a handful, so /mnemonic-seeds/<chain>/<N>
            // 404s for almost every N. Route them to the chain's single-page index
            // (…/<chain>/?page=N) instead, which regenerates ANY page client-side
            // via mnemonic-seeds-static-nav.js. Existing query (type/bits/path) is
            // carried forward so the derivation/address-type selection survives.
            if (/^[0-9]+$/.test(lastSeg)) {
                var chainBase = m[1].substring(0, slash);   // …/mnemonic-seeds/<chain>
                var tail = m[2] || '', frag = '', query = '';
                var h = tail.indexOf('#');
                if (h !== -1) { frag = tail.substring(h); tail = tail.substring(0, h); }
                if (tail.charAt(0) === '?') query = tail.substring(1);
                return chainBase + '/?page=' + lastSeg + (query ? '&' + query : '') + frag;
            }
            if (lastSeg.indexOf('.') === -1) {
                return m[1] + '.html' + (m[2] || '');
            }
            return url;
        }

        // /mnemonic-seeds/<chain>[?query]
        var m2 = url.match(/^([^?#]*\/mnemonic-seeds\/[^\/?#]+)([?#].*)?$/);
        if (m2) {
            var seg = m2[1].substring(m2[1].lastIndexOf('/') + 1);
            if (seg.indexOf('.') === -1) {
                return m2[1] + '.html' + (m2[2] || '');
            }
        }
        return url;
    }

    var LP = (typeof Location !== 'undefined') ? Location.prototype
                : Object.getPrototypeOf(window.location);
    var hd = Object.getOwnPropertyDescriptor(LP, 'href') || {};
    if (hd.set) {
        var origSet = hd.set;
        Object.defineProperty(LP, 'href', {
            get: hd.get,
            set: function (v) {
                origSet.call(this, fixMnemonicPath(v));
            },
            configurable: true
        });
    }
})();
