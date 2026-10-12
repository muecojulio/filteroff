import { lookup } from "node:dns/promises";

const MAX_BYTES = 8_000_000;

export class MediaReject extends Error {}

function isPrivateAddress(address: string): boolean {
  const v4 = address.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    const c = Number(v4[3]);
    const d = Number(v4[4]);
    if ([a, b, c, d].some((n) => n > 255)) return true;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 255 && b === 255 && c === 255 && d === 255) return true;
    return false;
  }
  const lower = address.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) return true;
  if (lower.startsWith("::ffff:")) return isPrivateAddress(lower.slice(7));
  return false;
}

export async function assertPublicHttpUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new MediaReject("El enlace no es válido.");
  }
  if (url.protocol !== "https:") throw new MediaReject("Solo se aceptan enlaces https.");
  if (url.username || url.password) throw new MediaReject("El enlace no puede llevar usuario o contraseña.");
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "metadata.google.internal" ||
    host === "metadata.google.com"
  ) {
    throw new MediaReject("Ese destino no está permitido.");
  }
  if (isPrivateAddress(host)) throw new MediaReject("Ese destino no está permitido.");
  let records: { address: string }[];
  try {
    records = await lookup(host, { all: true });
  } catch {
    throw new MediaReject("No se pudo resolver el enlace.");
  }
  if (records.length === 0 || records.some((record) => isPrivateAddress(record.address))) {
    throw new MediaReject("Ese destino no está permitido.");
  }
  return url;
}

export function sniffMedia(bytes: Uint8Array, headerType: string): { mime: string; kind: "photo" | "video" } | null {
  const declared = headerType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (declared === "image/svg+xml" || declared === "text/html") return null;
  const b = bytes;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: "image/jpeg", kind: "photo" };
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { mime: "image/png", kind: "photo" };
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return { mime: "image/gif", kind: "photo" };
  if (
    b.length >= 12 &&
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  ) {
    return { mime: "image/webp", kind: "photo" };
  }
  // AVIF/HEIF comparten caja ftyp con mp4: se distinguen por la marca.
  if (b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const brand = String.fromCharCode(b[8]!, b[9]!, b[10]!, b[11]!);
    if (brand === "avif" || brand === "avis") return { mime: "image/avif", kind: "photo" };
    return { mime: "video/mp4", kind: "video" };
  }
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { mime: "video/webm", kind: "video" };
  return null;
}

/**
 * Si el enlace es una página (no el archivo directo), se extrae el medio
 * publicada en sus metadatos — el truco clásico de los descargadores públicos
 * de GitHub: og:video / og:image / twitter:* y las etiquetas <video> / <img>.
 */
export function findHtmlMediaUrl(html: string, baseUrl: string): string | null {
  const head = html.slice(0, 400_000);
  const metaPattern = /<meta[^>]+>/gi;
  const candidates: { url: string; rank: number }[] = [];
  let meta: RegExpExecArray | null;
  while ((meta = metaPattern.exec(head)) !== null) {
    const tag = meta[0];
    const property = /(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase() ?? "";
    const content = /content\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1] ?? "";
    if (!property || !content || content.startsWith("data:")) continue;
    const rank = ["og:video:secure_url", "og:video:url", "og:video", "twitter:player:stream", "og:image:secure_url", "og:image", "twitter:image"].indexOf(property);
    if (rank >= 0) candidates.push({ url: content, rank });
  }
  const videoTag = /<video[^>]+src\s*=\s*["']([^"']+)["']/i.exec(head)?.[1];
  if (videoTag && !videoTag.startsWith("data:")) candidates.push({ url: videoTag, rank: 0 });
  candidates.sort((a, b) => a.rank - b.rank);
  for (const candidate of candidates) {
    try {
      const resolved = new URL(candidate.url, baseUrl);
      if (resolved.protocol === "https:" || resolved.protocol === "http:") return resolved.toString();
    } catch {
      // URL rota en la página: siguiente candidata.
    }
  }
  const imgTag = /<img[^>]+src\s*=\s*["'](https?:\/\/[^"']+)["']/i.exec(head)?.[1];
  if (imgTag) {
    try {
      return new URL(imgTag, baseUrl).toString();
    } catch {
      return null;
    }
  }
  return null;
}

export async function readCapped(response: Response): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) throw new MediaReject("La respuesta vino vacía.");
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new MediaReject("El archivo pasa de 25 MB. Prueba con uno más corto o ábrelo desde el teléfono.");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export const MEDIA_BYTE_LIMIT = MAX_BYTES;
