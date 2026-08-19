(function() {
    'use strict';
    var _ready = false;

    var B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    function encodeBase58(bytes) {
        var digits = [0];
        for (var i = 0; i < bytes.length; i++) {
            var carry = bytes[i];
            for (var j = 0; j < digits.length; j++) {
                carry += digits[j] << 8;
                digits[j] = carry % 58;
                carry = (carry / 58) | 0;
            }
            while (carry > 0) { digits.push(carry % 58); carry = (carry / 58) | 0; }
        }
        var r = '';
        for (var i = 0; bytes[i] === 0 && i < bytes.length - 1; i++) r += '1';
        for (var i = digits.length - 1; i >= 0; i--) r += B58[digits[i]];
        return r;
    }
    function base58check(versionBytes, payload) {
        var sha256 = window.NobleHashes.sha256Module.sha256;
        var verArray = Array.isArray(versionBytes) ? versionBytes : [versionBytes];
        var data = new Uint8Array(verArray.concat(Array.from(payload)));
        var h1 = sha256(data), h2 = sha256(h1);
        var full = new Uint8Array(data.length + 4);
        full.set(data); full.set(h2.slice(0, 4), data.length);
        return encodeBase58(full);
    }

    var BC = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
    var BG = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
    function bpoly(v) {
        var c = 1;
        for (var i = 0; i < v.length; i++) {
            var b = c >> 25; c = ((c & 0x1ffffff) << 5) ^ v[i];
            for (var j = 0; j < 5; j++) if ((b >> j) & 1) c ^= BG[j];
        }
        return c;
    }
    function bhrp(s) {
        var r = [];
        for (var i = 0; i < s.length; i++) r.push(s.charCodeAt(i) >> 5);
        r.push(0);
        for (var i = 0; i < s.length; i++) r.push(s.charCodeAt(i) & 31);
        return r;
    }
    function conv58(data, from, to, pad) {
        var acc = 0, bits = 0, r = [], maxv = (1 << to) - 1;
        for (var i = 0; i < data.length; i++) {
            acc = (acc << from) | data[i]; bits += from;
            while (bits >= to) { bits -= to; r.push((acc >> bits) & maxv); }
        }
        if (pad && bits > 0) r.push((acc << (to - bits)) & maxv);
        return r;
    }
    function bech32Addr(hrp, ver, prog, m) {
        var data = [ver].concat(conv58(Array.from(prog), 8, 5, true));
        var vals = bhrp(hrp).concat(data).concat([0,0,0,0,0,0]);
        var chk = bpoly(vals) ^ (m ? 0x2bc830a3 : 1);
        var r = hrp + '1';
        for (var i = 0; i < data.length; i++) r += BC[data[i]];
        for (var i = 0; i < 6; i++) r += BC[(chk >> (5 * (5-i))) & 31];
        return r;
    }

    function h160(b) { 
        return window.NobleHashes.ripemd160Module.ripemd160(window.NobleHashes.sha256Module.sha256(b)); 
    }

    function processRows() {
        var rows = document.querySelectorAll('#keysContainer .key-row');
        if (!rows.length) return;
        var chain = window.CGT_CONFIG ? window.CGT_CONFIG.chain : 'bitcoin';

        var prefixes = {
            'bitcoin': { p2pkh: [0x00], wif: [0x80], p2sh: [0x05], bech32: 'bc' },
            'litecoin': { p2pkh: [0x30], wif: [0xb0], p2sh: [0x32], bech32: 'ltc' },
            'dogecoin': { p2pkh: [0x1e], wif: [0x9e], p2sh: [0x16], bech32: null },
            'bitcoin-cash': { p2pkh: [0x00], wif: [0x80], p2sh: [0x05], bech32: null }, 
            'zcash': { p2pkh: [0x1c, 0xb8], wif: [0x80], p2sh: [0x1c, 0xbd], bech32: null }
        };

        Array.from(rows).forEach(function(row, i) {
            var keyEl = row.querySelector('.private-key');
            var colKey = row.querySelector('.col-key');
            var addrEl = row.querySelector('.col-address');
            if (!keyEl || !addrEl || !colKey) return;
            var hex = keyEl.textContent.trim();
            
            setTimeout(function() {
                try {
                    var isEVM = ['ethereum', 'bnb', 'polygon', 'arbitrum', 'optimism', 'base', 'avalanche', 'zksync'].indexOf(chain) !== -1;
                    if (isEVM && window.ethers) {
                        var addr = new ethers.Wallet("0x" + hex).address;
                        addrEl.innerHTML = '<a href="../key/' + hex + '.html" rel="nofollow" class="address-link" style="font-family:monospace;word-break:break-all;">' + addr + '</a>';
                        return;
                    }
                    if (chain === 'solana' && window.NobleCurves) {
                        var ed25519 = window.NobleCurves.ed25519Module.ed25519;
                        var addr = encodeBase58(ed25519.getPublicKey(hex));
                        addrEl.innerHTML = '<a href="../key/' + hex + '.html" rel="nofollow" class="address-link" style="font-family:monospace;word-break:break-all;">' + addr + '</a>';
                        return;
                    }
                    if (chain === 'tron' && window.ethers) {
                        var ethAddr = new ethers.Wallet("0x" + hex).address.substring(2);
                        var payload = new Uint8Array(ethAddr.match(/.{1,2}/g).map(function(x){ return parseInt(x, 16); }));
                        var addr = base58check([0x41], payload);
                        addrEl.innerHTML = '<a href="../key/' + hex + '.html" rel="nofollow" class="address-link" style="font-family:monospace;word-break:break-all;">' + addr + '</a>';
                        return;
                    }

                    if (!prefixes[chain]) {
                        addrEl.innerHTML = '<span class="text-muted" style="font-size:0.8em;">Unsupported by engine</span>';
                        return;
                    }

                    // Bitcoin clones
                    var pfx = prefixes[chain];
                    var type = (window.CGT_CONFIG && window.CGT_CONFIG.type) ? window.CGT_CONFIG.type : (window._currentType || 'legacy');
                    
                    if (!colKey.querySelector('.wif-group')) {
                        var hexBytes = new Uint8Array(hex.match(/.{1,2}/g).map(function(x){ return parseInt(x, 16); }));
                        var compPayload = new Uint8Array(33);
                        compPayload.set(hexBytes);
                        compPayload[32] = 0x01;
                        var wifC = base58check(pfx.wif, compPayload);
                        var wifU = base58check(pfx.wif, hexBytes);
                        
                        var wifHtml = '<div class="wif-group" style="margin-top:5px;font-size:0.8em;">';
                        wifHtml += '<div class="wif-row" style="margin-bottom:2px;"><span class="text-muted">(c)</span> <span style="font-family:monospace;word-break:break-all;">' + wifC + '</span></div>';
                        wifHtml += '<div class="wif-row"><span class="text-muted">(u)</span> <span style="font-family:monospace;word-break:break-all;">' + wifU + '</span></div>';
                        wifHtml += '</div>';
                        colKey.innerHTML += wifHtml;
                    }

                    var secp = window.NobleCurves.secp256k1Module.secp256k1;
                    var privInt = BigInt('0x' + hex);
                    var pubC = secp.getPublicKey(privInt, true);
                    var pubU = secp.getPublicKey(privInt, false);
                    var h160C = h160(pubC);
                    var h160U = h160(pubU);
                    var addrs = [];
                    
                    if (type === 'legacy') {
                        addrs.push(base58check(pfx.p2pkh, h160C));
                        addrs.push(base58check(pfx.p2pkh, h160U));
                    } else if (type === 'segwit' && pfx.bech32) {
                        addrs.push(bech32Addr(pfx.bech32, 0, h160C, false));
                    } else if (type === 'script') {
                        var rs = new Uint8Array([0x00, 0x14].concat(Array.from(h160C)));
                        addrs.push(base58check(pfx.p2sh, h160(rs)));
                    } else if (type === 'taproot' && pfx.bech32 === 'bc') {
                        var xOnly = pubC.slice(1);
                        var tag = new TextEncoder().encode('TapTweak');
                        var tagH = window.NobleHashes.sha256Module.sha256(tag);
                        var msg = new Uint8Array(96);
                        msg.set(tagH, 0); msg.set(tagH, 32); msg.set(xOnly, 64);
                        var t = window.NobleHashes.sha256Module.sha256(msg);
                        var N = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');
                        var tInt = BigInt('0x' + Array.from(t).map(function(b){ return b.toString(16).padStart(2,'0'); }).join(''));
                        var isOdd = (pubC[0] === 0x03);
                        var adj = isOdd ? ((N - privInt) % N) : privInt;
                        var tweaked = (adj + tInt) % N;
                        var tPub = secp.getPublicKey(tweaked, true);
                        addrs.push(bech32Addr(pfx.bech32, 1, tPub.slice(1), true));
                    }
                    
                    var aHtml = '';
                    addrs.forEach(function(a, i) {
                        var label = '';
                        if (addrs.length > 1) {
                            label = '(' + (i === 0 ? 'c' : 'u') + ') ';
                        }
                        aHtml += '<div style="margin-bottom:2px;"><span class="address-item">' + label + '<a href="../key/' + hex + '.html" rel="nofollow" class="address-link" style="font-family:monospace;word-break:break-all;">' + a + '</a></span></div>';
                    });
                    if (addrs.length === 0) aHtml = '<span class="text-muted" style="font-size:0.8em;">-</span>';
                    addrEl.innerHTML = aHtml;
                } catch(e) {
                    addrEl.innerHTML = '<span class="text-muted" style="font-size:0.8em;">-</span>';
                }
            }, i * 3);
        });
    }

    function onReady() {
        if (!window.NobleHashes || (!window.NobleCurves && !window.ethers)) return;
        _ready = true;
        window._cgtEngineReady = true;
        window._cgtProcessRows = processRows;
        processRows();
    }
    window.addEventListener('noble-loaded', onReady);
    [500, 1500, 3000].forEach(function(d) { setTimeout(onReady, d); });
    
    if (window.MutationObserver) {
        var obs = new MutationObserver(function() {
            if (_ready) processRows();
        });
        function attachObs() {
            var c = document.getElementById('keysContainer');
            if (c) obs.observe(c, { childList: true });
        }
        attachObs();
        document.addEventListener('DOMContentLoaded', attachObs);
    }
})();
