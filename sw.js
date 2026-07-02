/* Service worker — офлайн + автообновление (stale-while-revalidate).
   Стратегия: отдаём из кэша мгновенно, в фоне тянем свежую версию с сети
   и обновляем кэш — поэтому правки сами «долетают» до установленных PWA
   (новый контент виден при следующем запуске, без ручного поднятия версии). */
const CACHE = "atc-eng-v8";
const ASSETS = [
  "./",
  "./index.html",
  "./i18n.js",
  "./data.js",
  "./app.js",
  "./manifest.webmanifest",
  "./icon.svg"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  // сторонние ресурсы (Telegram SDK и пр.) — мимо кэша, отдаём браузеру
  if (new URL(e.request.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(e.request);
    const network = fetch(e.request).then(resp => {
      if (resp && resp.status === 200 && resp.type === "basic") {
        cache.put(e.request, resp.clone()).catch(() => {});
      }
      return resp;
    }).catch(() => null);
    // stale-while-revalidate: кэш сразу, сеть обновляет фоном на следующий раз
    return cached || (await network) || cache.match("./index.html");
  })());
});
