/* Service worker: lets the installed app open without internet.
   Network first: with internet you always get the newest files; the saved copy is used only offline.
   Accounts (/api/) and live search (/search) are never saved. */
const CACHE = "udyogam-v2";

self.addEventListener("install", e => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then(c => c.addAll(["./", "index.html"]))
      .then(() => self.skipWaiting())
  );
});
self.addEventListener("activate", e => {
  e.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || /\/(api\/|search)/.test(url.pathname))
    return;
  e.respondWith(
    (async () => {
      try {
        const res = await fetch(e.request);
        if (res.ok) (await caches.open(CACHE)).put(e.request, res.clone());
        return res;
      } catch {
        const hit = await caches.match(e.request, { ignoreSearch: url.pathname.endsWith("jobs.json") });
        // app links like /jobs or /my-jobs are all the same page
        return hit || (e.request.mode === "navigate" ? caches.match("index.html") : Response.error());
      }
    })()
  );
});

// An alert sent by the server while the app may be closed (Web Push; functions/api push/run)
self.addEventListener("push", e => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = { body: e.data ? e.data.text() : "" };
  }
  e.waitUntil(
    self.registration.showNotification(d.title || "Udyogam Vetuku", {
      body: d.body || "",
      tag: d.tag || "udyogam",
      icon: "assets/icon-512.png",
      badge: "assets/logo.png",
      data: { url: d.url || "./jobs", push: true },
    })
  );
});

// A clicked system alert: bring the app forward and open that note, or the newest jobs
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const { id: note, url, push } = e.notification.data || {};
  e.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const win = wins.find(w => new URL(w.url).origin === location.origin);
      if (win) {
        await win.focus();
        win.postMessage(note ? { note } : push ? { go: "jobs-new" } : {});
        return;
      }
      await self.clients.openWindow(url || "./jobs");
    })()
  );
});
