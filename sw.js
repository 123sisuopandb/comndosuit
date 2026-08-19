/**
 * CGT Service Worker v3 — SELF-DESTRUCT / NO-OP
 *
 * The previous versions (v1/v2) intercepted every *.obf.js and prepended a
 * hostname-spoof "domain-lock bypass". That is no longer needed: the domain
 * lock is now neutralised at the source in the .obf.js engines themselves
 * (the self-defending flag is initialised inert). The old interceptor was in
 * fact HARMFUL — its inject referenced Document.prototype, which does not exist
 * in a module Worker scope, so it threw inside puzzle-bitcoin.worker.obf.js and
 * killed the puzzle "Start" button.
 *
 * This version does the opposite of installing itself: on activation it
 * unregisters this service worker, deletes every cache it created, and reloads
 * any open pages so they load again with NO service worker in the path.
 * Because a browser re-checks /sw.js on the next navigation to an in-scope page,
 * a user who still has the old worker registered will silently pick this up and
 * be cleaned automatically — no DevTools needed. It intercepts nothing.
 */

self.addEventListener('install', function () {
    // Take over immediately so we can tear ourselves down without waiting.
    self.skipWaiting();
});

self.addEventListener('activate', function (event) {
    event.waitUntil((async function () {
        // 1) Drop every cache this origin's SW ever created.
        try {
            var keys = await caches.keys();
            await Promise.all(keys.map(function (k) { return caches.delete(k); }));
        } catch (e) { /* caches may be unavailable; ignore */ }

        // 2) Control existing clients so we can navigate (reload) them.
        try { await self.clients.claim(); } catch (e) {}

        // 3) Unregister this service worker.
        try { await self.registration.unregister(); } catch (e) {}

        // 4) Reload every open page so it re-fetches with no SW controlling it.
        try {
            var clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
            await Promise.all(clients.map(function (c) {
                try { return c.navigate(c.url); } catch (e) { return null; }
            }));
        } catch (e) {}
    })());
});

// Deliberately NO 'fetch' handler: this worker must not intercept anything.
