/**
 * Cliente HTTP mínimo para apps Gradio públicas (Hugging Face Spaces), sin
 * cuenta, sin token y sin registro.
 *
 * Protocolo portado del cliente oficial MIT `gradio-app/gradio`
 * (client/js/src: constants.ts, upload.ts, utils/submit.ts, utils/stream.ts,
 * helpers/api_info.ts), con estos pasos:
 *
 *   1. GET  {root}/config                      → api_prefix, dependencies, components
 *   2. POST {root}{prefix}/upload  (multipart) → rutas de archivo en el servidor
 *   3. POST {root}{prefix}/queue/join          → { event_id }  (payload: data, fn_index, session_hash)
 *   4. GET  {root}{prefix}/queue/data?session_hash=… (SSE) → msg: process_completed
 *   5. GET  {root}{prefix}/file={path}         → bytes del resultado
 *
 * Apps viejas (Gradio 3) exponen lo mismo sin el prefijo `/gradio_api`; se
 * prueban los dos prefijos.
 */

export type GradioFileData = {
  path?: string;
  url?: string;
  orig_name?: string;
  meta?: { _type?: string };
};

export type GradioDependency = {
  id?: number;
  api_name?: string | null;
  trigger?: string;
  inputs?: number[];
  outputs?: number[];
};

export type GradioComponent = {
  id: number;
  type?: string;
  props?: Record<string, unknown>;
};

export type GradioConfig = {
  api_prefix?: string;
  dependencies?: GradioDependency[];
  components?: GradioComponent[];
};

export type PickedEndpoint = {
  fnIndex: number;
  apiPrefix: string;
  inputTypes: string[];
};

/** Extrae los payloads JSON de un fragmento SSE (`data: {…}` por línea). */
export function parseSsePayloads(raw: string): unknown[] {
  const out: unknown[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const body = trimmed.slice(5).trim();
    if (!body || body === "[DONE]") continue;
    try {
      out.push(JSON.parse(body) as unknown);
    } catch {
      // Latido u otro texto no JSON: se ignora.
    }
  }
  return out;
}

export function isFileData(value: unknown): value is GradioFileData {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as GradioFileData;
  const marked = typeof row.meta?._type === "string" && row.meta._type.includes("FileData");
  return marked || (typeof row.path === "string" && (typeof row.url === "string" || row.url === undefined));
}

/** Busca el primer archivo de imagen en la salida de `process_completed`. */
export function extractResultFileData(payloads: unknown[]): GradioFileData | null {
  const find = (value: unknown, depth: number): GradioFileData | null => {
    if (depth > 6) return null;
    if (isFileData(value)) {
      if (typeof value.path === "string" && value.path.length > 0) return value;
      if (typeof value.url === "string" && value.url.startsWith("http")) return value;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        const hit = find(item, depth + 1);
        if (hit) return hit;
      }
      return null;
    }
    if (value && typeof value === "object") {
      for (const item of Object.values(value as Record<string, unknown>)) {
        const hit = find(item, depth + 1);
        if (hit) return hit;
      }
    }
    return null;
  };
  for (const payload of payloads) {
    if (!payload || typeof payload !== "object") continue;
    const row = payload as { msg?: string; output?: { data?: unknown[] }; success?: boolean };
    if (row.msg !== "process_completed") continue;
    if (row.success === false) return null;
    const hit = find(row.output?.data, 0);
    if (hit) return hit;
  }
  return null;
}

/** URL pública para bajar el resultado (el cliente usa `url` o `/file=`). */
export function gradioFileUrl(root: string, apiPrefix: string, file: GradioFileData): string | null {
  if (typeof file.url === "string" && file.url.startsWith("http")) return file.url;
  if (typeof file.path === "string" && file.path.length > 0) {
    return `${root.replace(/\/+$/, "")}${apiPrefix}/file=${file.path.replace(/^\/+/, "/")}`;
  }
  return null;
}

const IMAGE_INPUT_TYPES = new Set(["image", "video", "imageeditor"]);

/**
 * Elige el endpoint de restauración: la dependencia disparada por un botón que
 * reciba una imagen (o video) entre sus entradas. Igual que el cliente oficial
 * usa la config pública del app.
 */
export function pickImageEndpoint(
  config: GradioConfig,
  kind: "photo" | "video",
): PickedEndpoint | null {
  const components = new Map<number, GradioComponent>();
  for (const comp of config.components ?? []) components.set(comp.id, comp);
  const want = kind === "video" ? new Set(["video", "image"]) : IMAGE_INPUT_TYPES;
  const deps = config.dependencies ?? [];
  let fallback: PickedEndpoint | null = null;
  deps.forEach((dep, position) => {
    if (dep.trigger && dep.trigger !== "click") return;
    const fnIndex = typeof dep.id === "number" ? dep.id : position;
    const inputTypes = (dep.inputs ?? []).map((id) => components.get(id)?.type ?? "unknown");
    if (!inputTypes.some((type) => want.has(type))) return;
    const picked: PickedEndpoint = {
      fnIndex,
      apiPrefix: config.api_prefix ?? "",
      inputTypes,
    };
    if (!fallback) fallback = picked;
  });
  return fallback;
}

/** Arma las entradas del join: la imagen subida + valores por defecto. */
export function buildJoinInputs(
  inputTypes: string[],
  uploadedPath: string,
  filename: string,
  components: GradioComponent[],
  inputIds: number[],
): unknown[] {
  return inputTypes.map((type, index) => {
    const props = components.find((comp) => comp.id === inputIds[index])?.props ?? {};
    if (index === 0 && IMAGE_INPUT_TYPES.has(type)) {
      return { path: uploadedPath, orig_name: filename, meta: { _type: "gradio.FileData" } };
    }
    switch (type) {
      case "image":
      case "video":
      case "audio":
      case "file":
        return null;
      case "radio":
      case "dropdown": {
        const choices = props.choices as { value?: unknown }[] | undefined;
        return props.value ?? choices?.[0]?.value ?? null;
      }
      case "number":
      case "slider":
        return typeof props.value === "number" ? props.value : 1;
      case "checkbox":
        return typeof props.value === "boolean" ? props.value : false;
      case "text":
        return typeof props.value === "string" ? props.value : "";
      default:
        return props.value ?? null;
    }
  });
}

export type GradioJobOptions = {
  root: string;
  kind: "photo" | "video";
  image: Blob;
  filename: string;
  /** Presupuesto total del trabajo, incluidos upload, cola y descarga. */
  timeoutMs?: number;
};

export type GradioJobResult = { bytes: Uint8Array; mime: string };

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

/** Trabajo completo contra una app Gradio: config → upload → join → SSE → descarga. */
export async function runGradioImageJob(options: GradioJobOptions): Promise<GradioJobResult> {
  const budget = options.timeoutMs ?? 75_000;
  const deadline = Date.now() + budget;
  const left = () => Math.max(1_000, deadline - Date.now());
  const root = options.root.replace(/\/+$/, "");

  // 1. Config pública (con y sin el prefijo nuevo).
  let config: GradioConfig | null = null;
  let apiPrefix = "";
  for (const prefix of ["/gradio_api", ""]) {
    try {
      const response = await fetchWithTimeout(`${root}${prefix}/config`, {}, Math.min(9_000, left()));
      if (!response.ok) continue;
      const parsed = (await response.json()) as GradioConfig;
      if (!parsed || typeof parsed !== "object") continue;
      config = parsed;
      apiPrefix = typeof parsed.api_prefix === "string" ? parsed.api_prefix : prefix;
      break;
    } catch {
      // App dormida o inalcanzable: se prueba el otro prefijo.
    }
  }
  if (!config) throw new Error("config");
  const endpoint = pickImageEndpoint(config, options.kind);
  if (!endpoint) throw new Error("endpoint");

  // 2. Subida del archivo (multipart `files`, igual que upload_files()).
  const form = new FormData();
  form.append("files", options.image, options.filename);
  const uploadResponse = await fetchWithTimeout(
    `${root}${apiPrefix}/upload`,
    { method: "POST", body: form },
    Math.min(15_000, left()),
  );
  if (!uploadResponse.ok) throw new Error("upload");
  const uploaded = (await uploadResponse.json()) as unknown;
  const uploadedPath = Array.isArray(uploaded) && typeof uploaded[0] === "string" ? uploaded[0] : null;
  if (!uploadedPath) throw new Error("upload");

  // 3. Join de la cola.
  const sessionHash = Math.random().toString(36).slice(2);
  const componentById = config.components ?? [];
  const data = buildJoinInputs(
    endpoint.inputTypes,
    uploadedPath,
    options.filename,
    componentById,
    (config.dependencies ?? []).find((dep) => (typeof dep.id === "number" ? dep.id : -1) === endpoint.fnIndex)
      ?.inputs ?? [],
  );
  const joinResponse = await fetchWithTimeout(
    `${root}${apiPrefix}/queue/join`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data, fn_index: endpoint.fnIndex, trigger_id: null, session_hash: sessionHash }),
    },
    Math.min(12_000, left()),
  );
  if (!joinResponse.ok) throw new Error(`join-${joinResponse.status}`);

  // 4. Stream de eventos (SSE) hasta process_completed o close_stream.
  const streamSignal = AbortSignal.timeout(left());
  const streamResponse = await fetch(
    `${root}${apiPrefix}/queue/data?session_hash=${encodeURIComponent(sessionHash)}`,
    { signal: streamSignal },
  );
  if (!streamResponse.ok || !streamResponse.body) throw new Error("stream");
  const payloads: unknown[] = [];
  let closed = false;
  const reader = streamResponse.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (!closed) {
      const chunkWait = Promise.race([
        reader.read(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), left())),
      ]);
      const chunk = (await chunkWait) as { done?: boolean; value?: Uint8Array } | null;
      if (!chunk) break; // Se acabó el presupuesto.
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const events = parseSsePayloads(buffer);
      for (const payload of events) payloads.push(payload);
      const lastLine = buffer.lastIndexOf("\n");
      if (lastLine >= 0) buffer = buffer.slice(lastLine + 1);
      for (const payload of events) {
        if ((payload as { msg?: string }).msg === "close_stream") closed = true;
      }
      if (extractResultFileData(payloads)) break;
      if (Date.now() >= deadline) break;
    }
  } finally {
    reader.cancel().catch(() => undefined);
    reader.releaseLock?.();
  }

  // 5. Descarga del resultado.
  const file = extractResultFileData(payloads);
  if (!file) throw new Error("result");
  const resultUrl = gradioFileUrl(root, apiPrefix, file);
  if (!resultUrl) throw new Error("result");
  const download = await fetchWithTimeout(resultUrl, {}, Math.min(20_000, left()));
  if (!download.ok) throw new Error("download");
  const bytes = new Uint8Array(await download.arrayBuffer());
  if (bytes.length < 64) throw new Error("download");
  return { bytes, mime: download.headers.get("content-type")?.split(";")[0] ?? "image/png" };
}
