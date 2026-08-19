/**
 * CGT Domain Lock Bypass v5 — MINIMAL & SAFE
 *
 * 1. Blocks about:blank redirects (safety net)
 * 2. Fixes GitHub Pages base-path: /private-keys/bitcoin/3
 *                               → /digdigdub/private-keys/bitcoin/3.html
 *
 * Direct .obf.js patches handle domain check bypass.
 */
(function () {
    'use strict';

    function isAbout(url) {
        if (!url || typeof url !== 'string') return false;
        return url.trim().toLowerCase().indexOf('about:') === 0;
    }

    // ── Base path fixer for GitHub Pages ─────────────────────────────────
    // On GitHub Pages the site lives at /digdigdub/
    // but app.obf.js navigates using absolute paths like /private-keys/bitcoin/3
    var IS_GITHUB_PAGES = window.location.hostname.indexOf('github.io') !== -1;
    var BASE = '/digdigdub';
    // All top-level paths used by this site
    var SITE_PATHS = [
        '/private-keys/', '/tools/', '/mnemonic', '/paper-wallet',
        '/wallet-viewer', '/richest', '/halving', '/milk-sad',
        '/keystore', '/vanity', '/defi', '/bitcoin-puzzle', '/key-details',
        '/crypto-calculator'
    ];

    function fixPath(url) {
        if (!IS_GITHUB_PAGES) return url;
        if (!url || typeof url !== 'string') return url;
        // Only fix absolute paths starting with /, not http:// or /digdigdub/
        if (url.charAt(0) !== '/') return url;
        if (url.indexOf(BASE + '/') === 0) return url; // already has base
        // Check if it's one of our site paths
        for (var i = 0; i < SITE_PATHS.length; i++) {
            if (url.indexOf(SITE_PATHS[i]) === 0 || url === SITE_PATHS[i].replace(/\/$/, '')) {
                var fixed = BASE + url;
                // Add .html if no extension and no query hash
                var qIdx = fixed.indexOf('?');
                var hIdx = fixed.indexOf('#');
                var end = fixed;
                if (qIdx > -1) end = fixed.substring(0, qIdx);
                if (hIdx > -1) end = fixed.substring(0, hIdx);
                if (end.indexOf('.') === -1 || end.lastIndexOf('.') < end.lastIndexOf('/')) {
                    fixed = fixed + '.html';
                }
                console.log('[CGT] Path fixed:', url, '→', fixed);
                return fixed;
            }
        }
        return url;
    }

    // ── 1. Block Location.prototype href SETTER only (not getter!) ────────
    var LP = (typeof Location !== 'undefined') ? Location.prototype
                : Object.getPrototypeOf(window.location);
    var hd = Object.getOwnPropertyDescriptor(LP, 'href') || {};
    var hs = hd.set;
    if (hs) {
        Object.defineProperty(LP, 'href', {
            get: hd.get,
            set: function(v) {
                if (isAbout(v)) { console.warn('[CGT] Blocked href =', v); return; }
                hs.call(this, fixPath(v));
            },
            configurable: true
        });
    }

    // ── 2. Block location.assign / replace ───────────────────────────────
    ['assign', 'replace'].forEach(function(m) {
        try {
            var o = LP[m];
            LP[m] = function(url) {
                if (isAbout(url)) { console.warn('[CGT] Blocked location.' + m, url); return; }
                return o.call(this, fixPath(url));
            };
        } catch(e) {}
    });

    // ── 3. Block document.location = 'about:blank' (MAIN redirect!) ──────
    try {
        var dld = Object.getOwnPropertyDescriptor(Document.prototype, 'location');
        if (dld && dld.set) {
            Object.defineProperty(Document.prototype, 'location', {
                get: dld.get,
                set: function(val) {
                    if (isAbout(val)) { console.warn('[CGT] Blocked document.location =', val); return; }
                    dld.set.call(this, val);
                },
                configurable: true
            });
        }
    } catch(e) {}

    // ── 4. Block window.open('about:blank') ──────────────────────────────
    var _open = window.open;
    window.open = function(u) {
        if (isAbout(u)) return null;
        return _open.apply(this, arguments);
    };

    // ── 5. Block document.write with about:blank ──────────────────────────
    var _dw = document.write;
    document.write = function(h) {
        if (h && h.indexOf('about:blank') >= 0) return;
        return _dw.apply(document, arguments);
    };

    // ── 6. Block history API ──────────────────────────────────────────────
    ['pushState', 'replaceState'].forEach(function(m) {
        try {
            var o = history[m];
            history[m] = function(s, t, u) {
                if (u && isAbout(String(u))) return;
                return o.call(this, s, t, u);
            };
        } catch(e) {}
    });

    // ── 7. MutationObserver — kill meta-refresh to about: ─────────────────
    new MutationObserver(function(ms) {
        ms.forEach(function(m) {
            (m.addedNodes || []).forEach(function(n) {
                if (n && n.nodeName === 'META'
                    && (n.httpEquiv || '').toLowerCase() === 'refresh'
                    && (n.content || '').toLowerCase().indexOf('about:') >= 0) {
                    try { n.parentNode.removeChild(n); } catch(e) {}
                }
            });
        });
    }).observe(document.documentElement, { childList: true, subtree: true });

    // ── 8. Brand alias: window.CryptographyTube resolves to window.CGT ───
    try {
        Object.defineProperty(window, 'CryptographyTube', {
            configurable: true,
            get: function () { return window.CGT; }
        });
    } catch (e) {}

    console.log('[CGT v5] Active — about:blank blocked, navigation intact');
})();
