// Service Worker mínimo: precache del shell de la app + cache de Google Fonts
// para que la app abra rápido incluso con conexión floja. Estrategia
// stale-while-revalidate para assets y network-first para HTML.
//
// Versión bump ⇒ invalida el cache en una actualización.

const VERSION = "filteroff-v1";
const APP_SHELL = ["/", "/privacidad", "/qr", "/favicon.svg", "/og.jpg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);
      try {
        await cache.addAll(APP_SHELL);
      } catch (err) {
        // Algunas rutas pueden no responder todavía; seguimos.
        console.warn("[sw] shell precache parcial:", err);
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Solo cachea lo mismo-origen y fonts de Google.
  const isSameOrigin = url.origin === self.location.origin;
  const isGoogleFont = /fonts\.googleapis\.com|fonts\.gstatic\.com/.test(url.hostname);
  if (!isSameOrigin && !isGoogleFont) return;

  if (isGoogleFont) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req));
    return;
  }
  event.respondWith(staleWhileRevalidate(req));
});

async function staleWhileRevalidate(request) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || network;
}

async function networkFirst(request) {
  const cache = await caches.open(VERSION);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}
