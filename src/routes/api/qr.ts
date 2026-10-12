import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Endpoint `/api/qr` — sirve el QR como SVG cacheado. La cache HTTP de 1 h
 * evita recalcularlo en cada carga de la pantalla "Instalar". El cliente
 * siempre lo carga con un `<img src="/api/qr">` (sin inline ni `innerHTML`).
 */
const querySchema = z.object({ origin: z.string().url().optional() });

export const Route = createFileRoute("/api/qr")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { getRequest } = await import("@tanstack/react-start/server");
        const QRCode = (await import("qrcode")).default;
        const url = new URL(request.url);
        const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
        if (!parsed.success) return new Response("Bad Request", { status: 400 });

        const req2 = getRequest();
        const host = (req2.headers.get("x-forwarded-host") ?? req2.headers.get("host") ?? "")
          .split(",")[0]
          ?.trim() ?? "";
        const proto = (req2.headers.get("x-forwarded-proto") ?? "https").split(",")[0]?.trim() || "https";
        const origin = parsed.data.origin ?? (host ? `${proto}://${host}` : "");
        if (!origin || !/^https:\/\//i.test(origin)) {
          return new Response("No origin", { status: 400 });
        }
        if (/localhost|127\.0\.0\.1/i.test(new URL(origin).hostname)) {
          return new Response("Localhost not served", { status: 400 });
        }
        const svg = await QRCode.toString(origin, {
          type: "svg",
          margin: 1,
          width: 240,
          color: { dark: "#12110f", light: "#f3efe6" },
        });
        return new Response(svg, {
          status: 200,
          headers: {
            "Content-Type": "image/svg+xml; charset=utf-8",
            "Cache-Control": "public, max-age=3600, must-revalidate",
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "no-referrer",
          },
        });
      },
    },
  },
});
