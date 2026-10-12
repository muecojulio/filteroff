/**
 * Registra el service worker de la app shell. Solo en producción — en
 * desarrollo puede haber caching agresivo que rompe el HMR.
 */
export function registerServiceWorker(): void {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  // No activar en localhost de dev (vite ya tiene HMR, sw puede interferir).
  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") return;
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((err) => {
        console.warn("[sw] registro falló:", err);
      });
  });
}
