import { createServerFn } from "@tanstack/react-start";

/**
 * Devuelve los datos del QR (origen + svg) sin tocar el DOM. La imagen se
 * inyecta con un `<img src="data:image/svg+xml;base64,…">` en el cliente,
 * así se elimina la única `dangerouslySetInnerHTML` que tenía la UI y
 * con ella cualquier vector XSS a través del QR.
 */
export const installCode = createServerFn({ method: "GET" }).handler(async () => {
  const { getRequest } = await import("@tanstack/react-start/server");
  const QRCode = (await import("qrcode")).default;
  const request = getRequest();
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "")
    .split(",")[0]
    ?.trim() ?? "";
  const proto = (request.headers.get("x-forwarded-proto") ?? "https").split(",")[0]?.trim() || "https";
  const origin = host ? `${proto}://${host}` : "";
  if (!origin) return { origin: "", svg: "" };
  // Solo dominios https públicos generan QR; loopback cae al fallback.
  if (!/^https:\/\//i.test(origin)) return { origin: "", svg: "" };
  if (/localhost|127\.0\.0\.1/i.test(new URL(origin).hostname)) {
    return { origin, svg: "" };
  }
  const svg = await QRCode.toString(origin, {
    type: "svg",
    margin: 1,
    width: 240,
    color: { dark: "#12110f", light: "#f3efe6" },
  });
  return { origin, svg: String(svg) };
});

/**
 * Codifica un string en base64 compatible con data-URI en el navegador.
 * Funciona tanto en Node (server) como en el browser.
 */
export function toBase64(input: string): string {
  if (typeof btoa === "function") return btoa(unescape(encodeURIComponent(input)));
  return Buffer.from(input, "utf-8").toString("base64");
}
