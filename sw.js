const CACHE = "organitzam-v2";
const FILES = ["./", "index.html", "style.css", "app.js", "ics.js", "routines.js", "push.js", "google.js", "icon.svg", "manifest.webmanifest"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== CACHE).map((x) => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || /\/(proxy|api\/.*)$/.test(new URL(e.request.url).pathname)) return;
  e.respondWith(fetch(e.request).then((r) => { const c = r.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
});
self.addEventListener("notificationclick", (e) => { e.notification.close(); e.waitUntil(clients.matchAll({ type: "window" }).then((l) => (l[0] ? l[0].focus() : clients.openWindow("./")))); });
self.addEventListener("push", (e) => {
  let d = {}; try { d = e.data.json(); } catch {}
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((l) => {
    if (l.some((c) => c.visibilityState === "visible")) return; // si l'app és a la vista, ja s'avisa a dins
    return self.registration.showNotification(d.title || "Organitza'm", { body: d.body || "", tag: d.tag, icon: "icon.svg", requireInteraction: true, vibrate: [200, 100, 200, 100, 400] });
  }));
});
