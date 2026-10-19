/* Service worker: lets the installed app open without internet.
   Network first: with internet you always get the newest files; the saved copy is used only offline.
   Accounts (/api/) and live search (/search) are never saved. */
const CACHE = "udyogam-v2";

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(["./", "index.html"])).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || /\/(api\/|search)/.test(url.pathname)) return;
  e.respondWith((async () => {
    try {
      const res = await fetch(e.request);
      if (res.ok) (await caches.open(CACHE)).put(e.request, res.clone());
      return res;
    } catch {
      const hit = await caches.match(e.request, { ignoreSearch: url.pathname.endsWith("jobs.json") });
      // app links like /jobs or /my-jobs are all the same page
      return hit || (e.request.mode === "navigate" ? caches.match("index.html") : Response.error());
    }
  })());
});

// A clicked system alert (from js/services/notifications.js): bring the app forward and open that note
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const note = e.notification.data?.id;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const win = wins.find(w => new URL(w.url).origin === location.origin);
    if (win) { await win.focus(); if (note) win.postMessage({ note }); return; }
    await self.clients.openWindow("./jobs");
  })());
});
