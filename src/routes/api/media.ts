import { createFileRoute } from "@tanstack/react-router";
import { MediaReject, assertPublicHttpUrl, readCapped, sniffMedia } from "@/server/safe-url";

async function pull(raw: string): Promise<Response> {
  let current = raw;
  for (let hop = 0; hop < 3; hop++) {
    const url = await assertPublicHttpUrl(current);
    const response = await fetch(url, {
      redirect: "manual",
      headers: {
        Accept: "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm",
        "User-Agent": "Filteroff/1.0",
      },
      signal: AbortSignal.timeout(12_000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new MediaReject("El enlace redirigió a un sitio vacío.");
      current = new URL(location, url).toString();
      continue;
    }
    if (!response.ok) throw new MediaReject("No se pudo descargar ese enlace.");
    const bytes = await readCapped(response);
    const sniffed = sniffMedia(bytes, response.headers.get("content-type") ?? "");
    if (!sniffed) throw new MediaReject("Ese enlace no es una foto JPG, PNG, WebP, GIF ni un video MP4 o WebM.");
    const body = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], {
      type: sniffed.mime,
    });
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": sniffed.mime,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Filteroff-Kind": sniffed.kind,
      },
    });
  }
  throw new MediaReject("Demasiadas redirecciones.");
}

export const Route = createFileRoute("/api/media")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const raw = new URL(request.url).searchParams.get("url")?.trim() ?? "";
        try {
          if (!raw) throw new MediaReject("Falta el enlace.");
          return await pull(raw);
        } catch (error) {
          const message = error instanceof MediaReject ? error.message : "No se pudo traer el archivo.";
          return new Response(message, {
            status: 400,
            headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
          });
        }
      },
    },
  },
});
