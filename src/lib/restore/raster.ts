import { restoreRaster, type Raster, type RestoreOptions } from "@/lib/restore/engine";

export type { Raster };

function drawRaster(ctx: CanvasRenderingContext2D, raster: Raster) {
  const copy = new Uint8ClampedArray(raster.width * raster.height * 4);
  copy.set(raster.data);
  ctx.putImageData(new ImageData(copy, raster.width, raster.height), 0, 0);
}

export async function blobToRaster(blob: Blob, maxSide = 1280): Promise<Raster> {
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Este navegador no puede leer la imagen.");
    ctx.drawImage(bitmap, 0, 0, width, height);
    const image = ctx.getImageData(0, 0, width, height);
    return { width, height, data: image.data };
  } finally {
    bitmap.close();
  }
}

export function rasterToBlob(raster: Raster, quality = 0.92): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = raster.width;
  canvas.height = raster.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("No se pudo exportar."));
  drawRaster(ctx, raster);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No se pudo exportar."))), "image/jpeg", quality);
  });
}

export async function shrinkJpeg(raster: Raster, maxSide: number, quality: number): Promise<string> {
  const scale = Math.min(1, maxSide / Math.max(raster.width, raster.height));
  const width = Math.max(1, Math.round(raster.width * scale));
  const height = Math.max(1, Math.round(raster.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo preparar el refuerzo.");
  const source = document.createElement("canvas");
  source.width = raster.width;
  source.height = raster.height;
  const sourceCtx = source.getContext("2d");
  if (!sourceCtx) throw new Error("No se pudo preparar el refuerzo.");
  drawRaster(sourceCtx, raster);
  ctx.drawImage(source, 0, 0, width, height);
  const url = canvas.toDataURL("image/jpeg", quality);
  return url.replace(/^data:image\/jpeg;base64,/, "");
}

export function paintMask(mask: Uint8Array, width: number, height: number, x: number, y: number, radius: number) {
  const r2 = radius * radius;
  const x0 = Math.max(0, Math.floor(x - radius));
  const x1 = Math.min(width - 1, Math.ceil(x + radius));
  const y0 = Math.max(0, Math.floor(y - radius));
  const y1 = Math.min(height - 1, Math.ceil(y + radius));
  for (let yy = y0; yy <= y1; yy++) {
    for (let xx = x0; xx <= x1; xx++) {
      const dx = xx - x;
      const dy = yy - y;
      if (dx * dx + dy * dy <= r2) mask[yy * width + xx] = 1;
    }
  }
}

export async function makeSampleBlob(): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 960;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo crear el ejemplo.");
  const sky = ctx.createLinearGradient(0, 0, 0, 960);
  sky.addColorStop(0, "#6f93ab");
  sky.addColorStop(0.42, "#e4d2b8");
  sky.addColorStop(1, "#5d6b55");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 720, 960);
  ctx.fillStyle = "#f4e6cc";
  ctx.beginPath();
  ctx.arc(520, 230, 62, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#314033";
  ctx.beginPath();
  ctx.moveTo(0, 640);
  ctx.quadraticCurveTo(200, 520, 360, 610);
  ctx.quadraticCurveTo(540, 710, 720, 560);
  ctx.lineTo(720, 960);
  ctx.lineTo(0, 960);
  ctx.fill();
  ctx.fillStyle = "#c48962";
  ctx.beginPath();
  ctx.arc(280, 560, 42, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#241f1c";
  ctx.fillRect(246, 604, 68, 150);
  ctx.fillStyle = "#ff2f86";
  star(ctx, 120, 150, 54, 24);
  ctx.fill();
  ctx.fillStyle = "#ffe14a";
  heart(ctx, 560, 760, 46);
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 54px Outfit, sans-serif";
  ctx.fillText("LOL", 70, 860);
  ctx.strokeStyle = "#111111";
  ctx.lineWidth = 6;
  ctx.strokeText("LOL", 70, 860);

  const graded = document.createElement("canvas");
  graded.width = 720;
  graded.height = 960;
  const g = graded.getContext("2d");
  if (!g) throw new Error("No se pudo crear el ejemplo.");
  g.filter = "saturate(1.45) contrast(0.92)";
  g.drawImage(canvas, 0, 0);
  const image = g.getImageData(0, 0, 720, 960);
  for (let i = 0; i < image.data.length; i += 4) {
    image.data[i] = Math.min(255, image.data[i]! * 1.12 + 16);
    image.data[i + 2] = image.data[i + 2]! * 0.84;
  }
  g.putImageData(image, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => graded.toBlob(resolve, "image/jpeg", 0.92));
  if (!blob) throw new Error("No se pudo crear el ejemplo.");
  return blob;
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, outer: number, inner: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function heart(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.35);
  ctx.bezierCurveTo(x, y - s * 0.35, x - s, y - s * 0.25, x - s, y + s * 0.2);
  ctx.bezierCurveTo(x - s, y + s * 0.7, x, y + s * 0.85, x, y + s * 1.15);
  ctx.bezierCurveTo(x, y + s * 0.85, x + s, y + s * 0.7, x + s, y + s * 0.2);
  ctx.bezierCurveTo(x + s, y - s * 0.25, x, y - s * 0.35, x, y + s * 0.35);
  ctx.fill();
}

export async function restoreVideo(
  blob: Blob,
  options: RestoreOptions,
  onProgress: (ratio: number) => void,
): Promise<{ video: Blob; poster: Blob }> {
  const url = URL.createObjectURL(blob);
  try {
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("No se pudo leer el video."));
    });
    const duration = Math.min(video.duration && Number.isFinite(video.duration) ? video.duration : 1, 8);
    const scale = Math.min(1, 640 / Math.max(video.videoWidth || 640, video.videoHeight || 640));
    const width = Math.max(2, Math.round((video.videoWidth || 640) * scale));
    const height = Math.max(2, Math.round((video.videoHeight || 360) * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Este navegador no puede procesar video.");
    if (typeof MediaRecorder === "undefined" || !canvas.captureStream) {
      throw new Error("Este navegador no puede guardar el video limpio. Prueba con una foto.");
    }
    const fps = 8;
    const frames = Math.max(1, Math.round(duration * fps));
    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp8") ? "video/webm;codecs=vp8" : "video/webm";
    const recorder = new MediaRecorder(canvas.captureStream(fps), { mimeType: mime, videoBitsPerSecond: 1_600_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });
    recorder.start();
    for (let frame = 0; frame < frames; frame++) {
      video.currentTime = Math.min(duration - 0.05, frame / fps);
      await new Promise<void>((resolve) => {
        video.onseeked = () => resolve();
      });
      ctx.drawImage(video, 0, 0, width, height);
      const image = ctx.getImageData(0, 0, width, height);
      const restored = await restoreRaster({ width, height, data: image.data }, options);
      drawRaster(ctx, restored.raster);
      await new Promise((resolve) => setTimeout(resolve, 70));
      onProgress((frame + 1) / frames);
    }
    recorder.stop();
    await stopped;
    if (!chunks.length) throw new Error("No se pudo armar el video.");
    const poster = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
    if (!poster) throw new Error("No se pudo armar el video.");
    return { video: new Blob(chunks, { type: "video/webm" }), poster };
  } finally {
    URL.revokeObjectURL(url);
  }
}
