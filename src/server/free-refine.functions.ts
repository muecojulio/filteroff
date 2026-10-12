import { createServerFn } from "@tanstack/react-start";
import { runGradioImageJob } from "@/server/gradio";
import { sniffMedia } from "@/server/safe-url";

/**
 * Refuerzo GRATIS sin key ni registro: apps Gradio públicas (Hugging Face
 * Spaces) que restauran una foto. Se corren en cadena; si una está dormida,
 * llena o sin GPU, se salta a la siguiente y, si todas fallan, el resultado
 * local del teléfono se queda (ya está calculado antes de llamar aquí).
 *
 * Lista sobrescribible con FREE_REFINE_SPACES="host1.hf.space,host2.hf.space".
 */
const DEFAULT_SPACES = [
  { host: "akhaliq-gfpgan.hf.space", label: "GFPGAN" },
  { host: "jingyunliang-swinir.hf.space", label: "SwinIR" },
];

function providerList() {
  const raw = process.env.FREE_REFINE_SPACES?.trim();
  if (!raw) return DEFAULT_SPACES;
  const hosts = raw
    .split(",")
    .map((host) => host.trim())
    .filter((host) => /^[a-z0-9-]+\.hf\.space$/i.test(host))
    .slice(0, 6);
  return hosts.length ? hosts.map((host) => ({ host, label: host.split(".")[0] ?? host })) : DEFAULT_SPACES;
}

type FreeRefineResult =
  | { ok: true; imageBase64: string; provider: string }
  | { ok: false; reason: "off" | "cooldown" | "unavailable" };

let inFlight = false;
let cooldownUntil = 0;

export const freeRefine = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Falta la imagen.");
    const image = (input as { imageBase64?: unknown }).imageBase64;
    if (typeof image !== "string" || image.length < 80 || image.length > 1_800_000) {
      throw new Error("La imagen para el refuerzo es demasiado grande. Se usa el motor local.");
    }
    return { imageBase64: image.replace(/^data:image\/\w+;base64,/, "") };
  })
  .handler(async ({ data }): Promise<FreeRefineResult> => {
    const providers = providerList();
    if (providers.length === 0) return { ok: false, reason: "off" };
    const now = Date.now();
    if (inFlight || now < cooldownUntil) return { ok: false, reason: "cooldown" };
    inFlight = true;
    try {
      const bytes = Buffer.from(data.imageBase64, "base64");
      const blob = new Blob([new Uint8Array(bytes)], { type: "image/jpeg" });
      for (const provider of providers) {
        try {
          const job = await runGradioImageJob({
            root: `https://${provider.host}`,
            kind: "photo",
            image: blob,
            filename: "filteroff.jpg",
            timeoutMs: 70_000,
          });
          const sniffed = sniffMedia(job.bytes, job.mime);
          if (!sniffed || sniffed.kind !== "photo") continue;
          return {
            ok: true,
            imageBase64: Buffer.from(job.bytes).toString("base64"),
            provider: provider.label,
          };
        } catch {
          // Espacio dormido, cola llena o GPU sin cupo: siguiente de la cadena.
        }
      }
      // Nadie respondió: pequeña pausa para no martillar los espacios.
      cooldownUntil = Date.now() + 30_000;
      return { ok: false, reason: "unavailable" };
    } finally {
      inFlight = false;
    }
  });
