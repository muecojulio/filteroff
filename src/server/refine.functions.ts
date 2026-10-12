import { createServerFn } from "@tanstack/react-start";
import { cloudBudgetOpen } from "@/server/stats.functions";

const PROMPT =
  "Remove stickers, emoji, captions, decorative frames and graphic overlays. " +
  "Reduce beauty-filter smoothing and heavy color grading so skin, light and texture look like a natural photograph of the same scene. " +
  "Keep the same people, faces, pose, clothing, background and framing. " +
  "Do not add or remove clothing. Do not add nudity. Do not change identity. Do not invent new objects or turn the photo into a video.";

let lastCall = 0;

type RefineResult =
  | { ok: true; imageBase64: string }
  | { ok: false; reason: "off" | "quota" | "cooldown" | "rejected" };

function extractImage(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const data = (body as { data?: unknown }).data;
  const first = Array.isArray(data) ? data[0] : null;
  if (!first || typeof first !== "object") return null;
  const record = first as { b64_json?: unknown; url?: unknown };
  if (typeof record.b64_json === "string" && record.b64_json.length > 32) return record.b64_json;
  return null;
}

async function editOnce(apiKey: string, dataUri: string, model: string): Promise<Response> {
  return fetch("https://api.x.ai/v1/images/edits", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      prompt: PROMPT,
      image: { url: dataUri, type: "image_url" },
      response_format: "b64_json",
    }),
    signal: AbortSignal.timeout(45_000),
  });
}

export const refinePhoto = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Falta la imagen.");
    const image = (input as { imageBase64?: unknown }).imageBase64;
    if (typeof image !== "string" || image.length < 80 || image.length > 1_800_000) {
      throw new Error("La imagen para el refuerzo es demasiado grande. Se usa el motor local.");
    }
    return { imageBase64: image.replace(/^data:image\/\w+;base64,/, "") };
  })
  .handler(async ({ data }): Promise<RefineResult> => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false, reason: "off" };
    const now = Date.now();
    if (now - lastCall < 20_000) return { ok: false, reason: "cooldown" };
    const open = await cloudBudgetOpen().catch(() => false);
    if (!open) return { ok: false, reason: "quota" };
    lastCall = now;
    const dataUri = `data:image/jpeg;base64,${data.imageBase64}`;
    let response = await editOnce(apiKey, dataUri, "grok-imagine-image");
    if (response.status === 400 || response.status === 404) {
      response = await editOnce(apiKey, dataUri, "grok-imagine-image-2.0");
    }
    if (response.status === 429 || response.status === 402 || response.status === 403) {
      return { ok: false, reason: "quota" };
    }
    if (!response.ok) return { ok: false, reason: "rejected" };
    const payload = (await response.json()) as unknown;
    const image = extractImage(payload);
    if (!image) return { ok: false, reason: "rejected" };
    return { ok: true, imageBase64: image };
  });
