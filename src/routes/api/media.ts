import { createFileRoute } from "@tanstack/react-router";
import { MediaReject, assertPublicHttpUrl, findHtmlMediaUrl, readCapped, sniffMedia } from "@/server/safe-url";

async function pull(raw: string): Promise<Response> {
  let current = raw;
  for (let hop = 0; hop < 5; hop++) {
    const url = await assertPublicHttpUrl(current);
    const response = await fetch(url, {
      redirect: "manual",
      headers: {
        Accept: "image/avif,image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,text/html;q=0.8,*/*;q=0.4",
        "User-Agent": "Mozilla/5.0 (compatible; Filteroff/1.0; +media fetcher)",
      },
      signal: AbortSignal.timeout(25_000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new MediaReject("El enlace redirigió a un sitio vacío.");
      current = new URL(location, url).toString();
      continue;
    }
    if (!response.ok) throw new MediaReject("No se pudo descargar ese enlace.");
    const contentType = response.headers.get("content-type") ?? "";
    const declaredHtml = contentType.split(";")[0]?.trim().toLowerCase() === "text/html";
    if (declaredHtml || hop < 4) {
      // Puede ser una página publicadora: se mira y se extrae el medio.
      const bytes = await readCapped(response);
      const sniffed = sniffMedia(bytes, contentType);
      if (sniffed) return mediaResponse(bytes, sniffed);
      const html = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, 300_000));
      const extracted = findHtmlMediaUrl(html, url.toString());
      if (!extracted) throw new MediaReject("Esa página no trae una foto ni un video claro. Pega el enlace directo del archivo.");
      current = extracted;
      continue;
    }
    const bytes = await readCapped(response);
    const sniffed = sniffMedia(bytes, contentType);
    if (!sniffed) throw new MediaReject("Ese enlace no es una foto JPG, PNG, WebP, AVIF, GIF ni un video MP4 o WebM.");
    return mediaResponse(bytes, sniffed);
  }
  throw new MediaReject("Demasiadas redirecciones.");
}

function mediaResponse(bytes: Uint8Array, sniffed: { mime: string; kind: "photo" | "video" }): Response {
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
