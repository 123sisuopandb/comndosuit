/**
 * CGT coop socket fallback  (assets/js/coop-fallback.js)
 * ------------------------------------------------------------------
 * Keeps the Bitcoin-puzzle "Team / Community Hunt" (coop) mode resilient so the
 * page NEVER hangs or breaks — even if the primary coop backend goes offline.
 *
 * How coop connects (unchanged): app.obf.js -> FoundWallets.connectSocket() does
 *     this.socket = io(CGT_CONFIG.apiSocketUrl, { path:'/ws', transports:[...],
 *                                                 reconnection:true, ... });
 * where CGT_CONFIG.apiSocketUrl is the PRIMARY backend (https://privatekeyfinder.io).
 * socket.io itself is loaded lazily from https://cdn.socket.io/4.7.4/socket.io.min.js
 * (independent of the primary), which assigns the global `io`.
 *
 * What this file does: it transparently wraps that global `io`. When the socket
 * targets a CROSS-ORIGIN primary and that primary fails to connect (host down,
 * refused, or timeout), the coop socket is AUTOMATICALLY re-pointed at the
 * site's OWN origin (location.origin) and reconnected — reusing the very same
 * socket object the engine holds, with every listener it registered re-applied.
 * The engine never notices; the page stays usable.
 *
 * PRIMARY STAYS PRIMARY: while privatekeyfinder.io is reachable, nothing changes
 * (no timeout fires, no repoint) — zero regression. The move to your own domain
 * happens ONLY when the primary is actually unreachable.
 *
 * IMPORTANT (honest caveat): for coop to actually POPULATE from your own domain,
 * that domain must run its own socket.io "/ws" backend. Until you host one, the
 * failover simply prevents a hang and coop stays idle on your origin. The two
 * Solo modes (Solo Random / Solo Seq) are 100% client-side and always work,
 * regardless of any backend — so the page is always "perfect".
 *
 * No obfuscated engine code is touched; this is a pure, transparent io() shim.
 */
(function () {
  'use strict';

  var FALLBACK        = location.origin; // your OWN domain, whatever it is deployed as
  var CONNECT_TIMEOUT = 7000;            // ms to wait for the primary before failing over
  var ERROR_THRESHOLD = 3;               // primary connect_error count that triggers early failover

  function trimSlash(s) { return String(s || '').replace(/\/+$/, ''); }

  // Only fail over for a genuine CROSS-ORIGIN primary (never for our own origin).
  function isCrossOriginPrimary(uri) {
    if (typeof uri !== 'string' || !/^https?:\/\//i.test(uri)) return false;
    return trimSlash(uri) !== trimSlash(FALLBACK);
  }

  /**
   * Build a transparent facade over a socket.io Socket whose *underlying* socket
   * we can swap on failover, re-applying every listener the engine registered.
   * Version-independent: uses only the public Socket API (on/off/emit/connected).
   */
  function makeResilientSocket(realIo, primaryUri, opts) {
    var listeners = [];                        // [{event, handler}] seen via .on/.once
    var current   = realIo(primaryUri, opts);  // start on the primary
    var switched  = false;

    function reapply(sock) {
      for (var i = 0; i < listeners.length; i++) {
        try { sock.on(listeners[i].event, listeners[i].handler); } catch (e) {}
      }
    }

    function failover(why) {
      if (switched) return;
      if (current && current.connected) return;   // primary actually made it — do nothing
      switched = true;
      try { current && current.close(); } catch (e) {}
      try {
        console.warn('[CGT coop] primary backend unreachable (' + why +
                     '); switching coop to own domain: ' + FALLBACK);
      } catch (e) {}
      var next = realIo(FALLBACK, opts);           // same options, our own origin
      current = next;
      reapply(next);                               // restore engine's connect/disconnect/summary/... handlers
      try { next.connect(); } catch (e) {}
    }

    // Watchdog — armed on the PRIMARY only. Cleared the instant it connects.
    var errCount = 0;
    var timer = setTimeout(function () {
      if (!current.connected) failover('timeout');
    }, CONNECT_TIMEOUT);
    try {
      current.on('connect', function () { try { clearTimeout(timer); } catch (e) {} });
      current.on('connect_error', function () {
        if (current.connected) return;
        if (++errCount >= ERROR_THRESHOLD) {
          try { clearTimeout(timer); } catch (e) {}
          failover('connect_error');
        }
      });
    } catch (e) {}

    // Transparent proxy: forward everything to the CURRENT underlying socket, but
    // record listener (de)registration so we can re-apply on a swap.
    return new Proxy({}, {
      get: function (_t, prop) {
        if (prop === 'on' || prop === 'once' || prop === 'addListener') {
          return function (ev, h) { listeners.push({ event: ev, handler: h }); return current[prop](ev, h); };
        }
        if (prop === 'off' || prop === 'removeListener') {
          return function (ev, h) {
            listeners = listeners.filter(function (l) {
              return !(l.event === ev && (h === undefined || l.handler === h));
            });
            return current[prop](ev, h);
          };
        }
        var v = current[prop];
        return typeof v === 'function' ? v.bind(current) : v;
      },
      set: function (_t, prop, val) { try { current[prop] = val; } catch (e) {} return true; },
      has: function (_t, prop) { return prop in current; }
    });
  }

  // Wrap the real io factory. Cross-origin primary -> resilient facade;
  // anything already same-origin (or undefined) -> passed through untouched.
  function wrapIo(realIo) {
    if (typeof realIo !== 'function' || realIo.__cgtWrapped) return realIo;
    function wrapped(uri, opts) {
      if (uri && typeof uri === 'object') { opts = uri; uri = undefined; }
      if (isCrossOriginPrimary(uri)) {
        try { return makeResilientSocket(realIo, uri, opts); }
        catch (e) { return realIo(uri, opts); }    // never break the page
      }
      return realIo(uri, opts);
    }
    for (var k in realIo) { try { wrapped[k] = realIo[k]; } catch (e) {} } // io.connect/Manager/Socket/protocol
    try { wrapped.connect = wrapped; } catch (e) {}
    wrapped.__cgtWrapped = true;
    return wrapped;
  }

  // Install BEFORE the CDN assigns window.io (socket.io is fetched lazily at
  // coop-connect, long after this runs). Intercept the assignment so we wrap it
  // the moment socket.io loads.
  var _real;
  try {
    Object.defineProperty(window, 'io', {
      configurable: true,
      enumerable: true,
      get: function () { return _real; },
      set: function (v) { _real = wrapIo(v); }
    });
  } catch (e) {
    // Fallback: poll until io appears, then wrap it in place.
    var iv = setInterval(function () {
      if (window.io && !window.io.__cgtWrapped) {
        try { window.io = wrapIo(window.io); } catch (e2) {}
        clearInterval(iv);
      }
    }, 25);
  }
})();
