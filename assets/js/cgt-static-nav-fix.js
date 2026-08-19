/**
 * CGT static-hosting fixes  (localhost / GitHub Pages / Netlify / cPanel)
 * -----------------------------------------------------------------------
 * This file MUST load BEFORE app.obf.js (it is included as a plain, non-defer
 * <script> right above it). It fixes two problems that only appear when the
 * site is served as real ".html" files instead of the production server's
 * pretty-URL routes:
 *
 *  (A) "?key=" is the PAGINATION param (First / Prev / Next / Random / Jump).
 *      The bundled app also treats it as a wallet search and dumps the key into
 *      the search box (and highlights the first row) on load. On
 *      cryptographytube.org that does NOT happen, so we disable that behaviour.
 *
 *  (B) The Search button and a few chain tabs navigate to absolute, extension-
 *      less paths such as "/private-keys/bitcoin?key=...". Those 404 on static
 *      hosts. We rewrite them to a relative "./bitcoin.html?key=..." which
 *      resolves correctly on ANY host and any sub-path (e.g. /<repo>/ on Pages).
 */
(function () {
    'use strict';

    // ---- (A) Never auto-fill the search box from the ?key= pagination param -----
    var _cgt;
    function neutralize(obj) {
        if (obj && typeof obj === 'object' && typeof obj.fillSearchFromUrl === 'function') {
            try { obj.fillSearchFromUrl = function () {}; } catch (e) {}
        }
    }
    try {
        // app.obf.js assigns window.CGT = <app>; intercept that assignment so the
        // fillSearchFromUrl method is a no-op before init() can ever call it.
        Object.defineProperty(window, 'CGT', {
            configurable: true,
            get: function () { return _cgt; },
            set: function (v) { _cgt = v; neutralize(v); }
        });
    } catch (e) {}

    // ---- WIF (base58check) -> 64-hex, so a WIF search lands on the exact key ----
    // The inline engine does BigInt('0x' + key); a raw WIF throws and falls back to
    // page 1. Decoding it here makes Search work for 5.../K.../L... keys too.
    var B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    function base58decode(str) {
        var bytes = [0], i, j, carry, c;
        for (i = 0; i < str.length; i++) {
            c = B58.indexOf(str.charAt(i));
            if (c < 0) return null;
            carry = c;
            for (j = 0; j < bytes.length; j++) { carry += bytes[j] * 58; bytes[j] = carry & 0xff; carry >>= 8; }
            while (carry > 0) { bytes.push(carry & 0xff); carry >>= 8; }
        }
        for (var k = 0; k < str.length && str.charAt(k) === '1'; k++) bytes.push(0);
        return bytes.reverse();
    }
    function wifToHex(wif) {
        if (!/^[5KLT6Q][1-9A-HJ-NP-Za-km-z]{50,51}$/.test(wif)) return null;
        var b = base58decode(wif);
        if (!b || (b.length !== 37 && b.length !== 38)) return null; // 1+32+4 (+1 compressed)
        var hex = '';
        for (var i = 1; i <= 32; i++) hex += ('0' + b[i].toString(16)).slice(-2);
        return hex;
    }
    function decodeKeyParam(query) {
        if (!query || query.charAt(0) !== '?') return query;
        try {
            var qs = new URLSearchParams(query.slice(1));
            var k = qs.get('key');
            if (k) {
                var hex = wifToHex(k);
                if (hex) { qs.set('key', hex); return '?' + qs.toString(); }
            }
        } catch (e) {}
        return query;
    }

    // Relative path to the key-details page from wherever this script runs.
    function keyDetailBase() {
        return location.pathname.indexOf('/private-keys/') !== -1 ? '../key.html' : './key.html';
    }
    // Build "<base>/key.html?k=<hex>" from a /key/<value> segment. key.html expects
    // hex (it does BigInt('0x'+k)), so a WIF value is decoded to hex first.
    function keyDetailHref(value) {
        var v;
        try { v = decodeURIComponent(value); } catch (e) { v = value; }
        var hex;
        if (/^(0x)?[0-9a-fA-F]{1,64}$/.test(v)) hex = v.replace(/^0x/i, '');
        else hex = wifToHex(v) || v;
        return keyDetailBase() + '?k=' + hex;
    }

    // ---- (B) Rewrite absolute app links to relative ".html" ones for static hosts.
    //   /private-keys/<chain>[?..]  ->  ./<chain>.html[?..]   (Search + chain tabs)
    //   /key/<hex-or-wif>           ->  ../key.html?k=<hex>   (row key / WIF links)
    function fixUrl(u) {
        if (typeof u !== 'string' || !u) return u;
        var s = u;
        try {
            // Normalise a same-origin absolute URL down to its path for matching.
            if (/^https?:\/\//i.test(s)) {
                var a = document.createElement('a');
                a.href = s;
                if (a.host !== location.host) return u; // leave external links alone
                s = a.pathname + a.search + a.hash;
            }
        } catch (e) {}
        var m = s.match(/(?:^|\/)private-keys\/([a-z0-9-]+)(\?[^#]*)?(#[\s\S]*)?$/i);
        if (m && m[1].indexOf('.') === -1) {
            return './' + m[1] + '.html' + decodeKeyParam(m[2] || '') + (m[3] || '');
        }
        var mk = s.match(/(?:^|\/)key\/([^/?#]+)/i);
        if (mk) {
            return keyDetailHref(mk[1]);
        }
        return u;
    }

    var LP = Object.getPrototypeOf(location) || Location.prototype;
    ['assign', 'replace'].forEach(function (name) {
        try {
            var orig = LP[name];
            if (typeof orig === 'function') {
                LP[name] = function (url) { return orig.call(this, fixUrl(url)); };
            }
        } catch (e) {}
    });
    try {
        var desc = Object.getOwnPropertyDescriptor(LP, 'href');
        if (desc && desc.set) {
            Object.defineProperty(LP, 'href', {
                configurable: true,
                get: desc.get,
                set: function (v) { desc.set.call(this, fixUrl(v)); }
            });
        }
    } catch (e) {}

    // Rewrite any absolute app links found under `root` to their relative form.
    // app.obf.js re-renders each row's key/WIF links (to "/key/<x>") ASYNCHRONOUSLY
    // after load, so we also watch #keysContainer and re-run on every change.
    function fixLinksIn(root) {
        try {
            var links = (root || document).getElementsByTagName('a');
            for (var i = 0; i < links.length; i++) {
                var h = links[i].getAttribute('href');
                if (!h) continue;
                if (h.indexOf('/private-keys/') === -1 && h.indexOf('/key/') === -1) continue;
                var f = fixUrl(h);
                if (f && f !== h) links[i].setAttribute('href', f);
            }
        } catch (e) {}
    }

    function observeKeys() {
        try {
            var c = document.getElementById('keysContainer');
            if (!c) return;
            fixLinksIn(c);
            new MutationObserver(function () { fixLinksIn(c); })
                .observe(c, { childList: true, subtree: true });
        } catch (e) {}
    }

    // Capturing-click backstop: if an app link was rewritten a beat too late, still
    // send a plain left-click to the correct relative URL (modified clicks fall
    // through to the — by then already rewritten — href).
    document.addEventListener('click', function (e) {
        try {
            if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
            var t = e.target;
            var a = t && t.closest ? t.closest('a[href]') : null;
            if (!a) return;
            var h = a.getAttribute('href');
            if (!h || (h.indexOf('/private-keys/') === -1 && h.indexOf('/key/') === -1)) return;
            var f = fixUrl(h);
            if (f && f !== h) { e.preventDefault(); location.href = f; }
        } catch (err) {}
    }, true);

    // ---- (B2) Robust Search (mechanism-independent) --------------------------------
    // The bundled searchKey() navigates via `window.location.href = <absolute url>`.
    // Our href hook above rewrites that, but if that hook ever fails to install (e.g.
    // a browser that won't let us redefine Location.prototype.href), Search would 404
    // again. So we ALSO intercept the Search button click (and Enter in the box) in
    // the capture phase, read the input exactly like the app (HEX / WIF / brainwallet),
    // and navigate to a relative "./<chain>.html?key=<hex>" URL that works on any host.
    function currentChainFile() {
        var f = (location.pathname.split('/').pop() || '').split('?')[0].split('#')[0];
        if (!f) f = 'bitcoin.html';
        if (!/\.html$/i.test(f)) f += '.html';
        return f;
    }
    function navSearch(hex) {
        if (!hex) return;
        var url = './' + currentChainFile() + '?key=' + hex;
        try {
            var sel = document.getElementById('searchType');
            if (sel && sel.value && sel.options && sel.options.length &&
                sel.value !== sel.options[0].value) {
                url += '&type=' + encodeURIComponent(sel.value);
            }
        } catch (e) {}
        location.href = url; // relative -> fixUrl() passes it through unchanged
    }
    function runSearch() {
        var input = document.getElementById('searchInput');
        if (!input) return;
        var raw = String(input.value == null ? '' : input.value).replace(/^\s+|\s+$/g, '');
        if (!raw) return;
        var val = raw;
        if (/^0x[0-9a-fA-F]{1,64}$/i.test(val)) val = val.slice(2);
        if (/^[0-9a-fA-F]{1,64}$/.test(val)) { navSearch(val.padStart(64, '0')); return; }
        var w = wifToHex(val);
        if (w) { navSearch(w); return; }
        // Brainwallet: SHA-256(passphrase) -> 64-hex (matches the app's fallback).
        try {
            if (window.crypto && crypto.subtle && crypto.subtle.digest && window.TextEncoder) {
                crypto.subtle.digest('SHA-256', new TextEncoder().encode(val)).then(function (buf) {
                    var u8 = new Uint8Array(buf), out = '';
                    for (var i = 0; i < u8.length; i++) out += ('0' + u8[i].toString(16)).slice(-2);
                    navSearch(out);
                })['catch'](function () {});
            }
        } catch (e) {}
    }
    document.addEventListener('click', function (e) {
        try {
            if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
            var t = e.target;
            var btn = t && t.closest ? t.closest('[onclick]') : null;
            if (!btn || (btn.getAttribute('onclick') || '').indexOf('searchKey') === -1) return;
            e.preventDefault();
            e.stopImmediatePropagation(); // stop the inline onclick from also navigating
            runSearch();
        } catch (err) {}
    }, true);
    document.addEventListener('keydown', function (e) {
        try {
            if (e.key !== 'Enter' && e.keyCode !== 13) return;
            var t = e.target;
            if (!t || t.id !== 'searchInput') return;
            e.preventDefault();
            e.stopImmediatePropagation();
            runSearch();
        } catch (err) {}
    }, true);

    // ---- (C) Backstop: clear the box / row highlight if it still got auto-filled ----
    function cleanup() {
        try {
            var el = document.getElementById('searchInput');
            var k = new URLSearchParams(location.search).get('key');
            if (el && k && el.value &&
                el.value.toLowerCase().replace(/^0x/, '') === k.toLowerCase().replace(/^0x/, '')) {
                el.value = '';
            }
            var hl = document.querySelectorAll('.key-row.highlighted, .key-row.pulse, .key-row.flash');
            for (var j = 0; j < hl.length; j++) {
                hl[j].classList.remove('highlighted', 'pulse', 'flash');
            }
        } catch (e) {}
    }

    function onReady() { fixLinksIn(document); observeKeys(); }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', onReady);
    } else {
        onReady();
    }
    window.addEventListener('load', function () { fixLinksIn(document); cleanup(); });
})();
