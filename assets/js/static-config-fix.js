/*
 * static-config-fix.js
 * -------------------------------------------------------------------------
 * On the original site the address-type / derivation-path / word-count
 * selectors work by navigating to the same page with query params
 * (?type=segwit&preset=bip84&bits=256) which the PHP backend reads and bakes
 * into window.MNEMONIC_SEEDS_CONFIG before the page is served.
 *
 * This static export has no backend, so the reloaded page always carries the
 * hardcoded defaults (addressType:'legacy', path:'', bits:128) and the user's
 * selection is silently ignored. This script restores that behaviour purely
 * client-side: it reads the URL query params and applies them to
 * MNEMONIC_SEEDS_CONFIG *before* the (deferred) app init runs, then syncs the
 * visible controls so the UI reflects the active selection.
 *
 * Must be loaded as a normal (non-defer) script placed AFTER the inline
 * MNEMONIC_SEEDS_CONFIG / MNEMONIC_SEEDS_PRESETS definitions and BEFORE the
 * deferred *.obf.js scripts.
 */
(function () {
    'use strict';
    var cfg = window.MNEMONIC_SEEDS_CONFIG;
    if (!cfg) return; // not a mnemonic-seeds page

    var params;
    try {
        params = new URLSearchParams(window.location.search);
    } catch (e) {
        return;
    }

    var presets = (window.MNEMONIC_SEEDS_PRESETS || {})[cfg.chain] || [];

    // --- Address type (?type=legacy|segwit|script|taproot|...) ---
    var type = params.get('type');
    if (type) cfg.addressType = type;

    // --- Word count / entropy bits (?bits=128|192|256) ---
    var bits = parseInt(params.get('bits'), 10);
    if (bits === 128 || bits === 192 || bits === 256) cfg.bits = bits;

    // --- Derivation path: ?preset=<id> (preferred) or ?path=<raw path> ---
    var presetId = params.get('preset');
    var rawPath = params.get('path');
    if (presetId) {
        var byId = presets.filter(function (p) { return p.id === presetId; })[0];
        if (byId) {
            cfg.path = byId.path;
            cfg.preset = byId.id;
        }
    } else if (rawPath) {
        cfg.path = rawPath;
        var byPath = presets.filter(function (p) { return p.path === rawPath; })[0];
        cfg.preset = byPath ? byPath.id : '';
    }

    // --- Sync visible controls so the UI matches the applied config ---
    function sync() {
        try {
            var bitsSelect = document.getElementById('bitsSelect');
            if (bitsSelect) bitsSelect.value = String(cfg.bits);

            var pathInput = document.getElementById('pathInput');
            if (pathInput && cfg.path) pathInput.value = cfg.path;

            if (cfg.addressType) {
                var needle = "('" + cfg.addressType + "')";
                var cards = document.querySelectorAll('.address-type-card');
                Array.prototype.forEach.call(cards, function (card) {
                    var onclick = card.getAttribute('onclick') || '';
                    card.classList.toggle('active', onclick.indexOf(needle) !== -1);
                });
            }
        } catch (e) { /* cosmetic only */ }
    }

    // The controls are already parsed above this script, but guard anyway.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', sync);
    } else {
        sync();
    }
})();
