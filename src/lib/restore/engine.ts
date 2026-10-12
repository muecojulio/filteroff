export type Raster = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

export type RestoreOptions = {
  stickers: boolean;
  natural: boolean;
  /** 0..1, how far to pull color and texture back toward a plain photograph. */
  strength: number;
  /** 0..1, how willing the detector is to mark a graphic overlay. */
  sensitivity: number;
  brush: Uint8Array | null;
};

export type RestoreResult = {
  raster: Raster;
  covered: number;
};

const clamp = (n: number) => (n < 0 ? 0 : n > 255 ? 255 : n);

function yieldThread(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function downscale(src: Raster, maxSide: number): Raster {
  const scale = Math.min(1, maxSide / Math.max(src.width, src.height));
  if (scale >= 0.999) return src;
  const w = Math.max(1, Math.round(src.width * scale));
  const h = Math.max(1, Math.round(src.height * scale));
  const data = new Uint8ClampedArray(w * h * 4);
  const xScale = src.width / w;
  const yScale = src.height / h;
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * yScale);
    const y1 = Math.min(src.height, Math.max(y0 + 1, Math.ceil((y + 1) * yScale)));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * xScale);
      const x1 = Math.min(src.width, Math.max(x0 + 1, Math.ceil((x + 1) * xScale)));
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * src.width + xx) * 4;
          r += src.data[i]!;
          g += src.data[i + 1]!;
          b += src.data[i + 2]!;
          n++;
        }
      }
      const o = (y * w + x) * 4;
      data[o] = r / n;
      data[o + 1] = g / n;
      data[o + 2] = b / n;
      data[o + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}

function integral(src: Raster) {
  const w = src.width;
  const h = src.height;
  const stride = w + 1;
  const r = new Float64Array(stride * (h + 1));
  const g = new Float64Array(stride * (h + 1));
  const b = new Float64Array(stride * (h + 1));
  for (let y = 1; y <= h; y++) {
    let rr = 0;
    let gg = 0;
    let bb = 0;
    for (let x = 1; x <= w; x++) {
      const i = ((y - 1) * w + (x - 1)) * 4;
      rr += src.data[i]!;
      gg += src.data[i + 1]!;
      bb += src.data[i + 2]!;
      const o = y * stride + x;
      const up = (y - 1) * stride + x;
      r[o] = r[up]! + rr;
      g[o] = g[up]! + gg;
      b[o] = b[up]! + bb;
    }
  }
  return { r, g, b, stride };
}

function rectSum(sat: Float64Array, stride: number, x0: number, y0: number, x1: number, y1: number) {
  return sat[y1 * stride + x1]! - sat[y0 * stride + x1]! - sat[y1 * stride + x0]! + sat[y0 * stride + x0]!;
}

function blurRaster(src: Raster, radius: number): Raster {
  const { r, g, b, stride } = integral(src);
  const w = src.width;
  const h = src.height;
  const data = new Uint8ClampedArray(src.data.length);
  const rad = Math.max(1, radius);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - rad);
    const y1 = Math.min(h, y + rad + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - rad);
      const x1 = Math.min(w, x + rad + 1);
      const area = (x1 - x0) * (y1 - y0);
      const o = (y * w + x) * 4;
      data[o] = rectSum(r, stride, x0, y0, x1, y1) / area;
      data[o + 1] = rectSum(g, stride, x0, y0, x1, y1) / area;
      data[o + 2] = rectSum(b, stride, x0, y0, x1, y1) / area;
      data[o + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}

function upscaleMask(mask: Uint8Array, sw: number, sh: number, dw: number, dh: number) {
  const out = new Uint8Array(dw * dh);
  for (let y = 0; y < dh; y++) {
    const sy = Math.min(sh - 1, Math.floor((y * sh) / dh));
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(sw - 1, Math.floor((x * sw) / dw));
      out[y * dw + x] = mask[sy * sw + sx]!;
    }
  }
  return out;
}

function dilate(mask: Uint8Array, w: number, h: number, rad: number) {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let on = 0;
      for (let dy = -rad; dy <= rad && !on; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -rad; dx <= rad; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          if (mask[ny * w + nx]) {
            on = 1;
            break;
          }
        }
      }
      out[y * w + x] = on;
    }
  }
  return out;
}

type Comp = { area: number; pixels: number[]; minX: number; minY: number; maxX: number; maxY: number };

function componentsOf(mask: Uint8Array, w: number, h: number): Comp[] {
  const seen = new Uint8Array(mask.length);
  const comps: Comp[] = [];
  const stackX: number[] = [];
  const stackY: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const start = y * w + x;
      if (!mask[start] || seen[start]) continue;
      stackX.push(x);
      stackY.push(y);
      seen[start] = 1;
      const pixels: number[] = [];
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      while (stackX.length) {
        const cx = stackX.pop()!;
        const cy = stackY.pop()!;
        const ci = cy * w + cx;
        pixels.push(ci);
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const ni = ny * w + nx;
            if (!mask[ni] || seen[ni]) continue;
            seen[ni] = 1;
            stackX.push(nx);
            stackY.push(ny);
          }
        }
      }
      comps.push({ area: pixels.length, pixels, minX, minY, maxX, maxY });
    }
  }
  return comps;
}

/** Graphic overlays: small regions that disagree with a wide blur of the photograph. */
export function detectStickerMask(src: Raster, sensitivity: number): Uint8Array {
  const small = downscale(src, 420);
  const w = small.width;
  const h = small.height;
  const radius = Math.max(8, Math.round(Math.min(w, h) * 0.08));
  const blurred = blurRaster(small, radius);
  const sens = Math.min(1, Math.max(0, sensitivity));
  const distCut = 78 - sens * 36;
  const dist2Cut = distCut * distCut;
  const satCut = 100 - sens * 46;
  const raw = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    const r = small.data[o]!;
    const g = small.data[o + 1]!;
    const b = small.data[o + 2]!;
    const br = blurred.data[o]!;
    const bg = blurred.data[o + 1]!;
    const bb = blurred.data[o + 2]!;
    const dr = r - br;
    const dg = g - bg;
    const db = b - bb;
    const dist2 = dr * dr + dg * dg + db * db;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max - min;
    const graphic = sat >= satCut || max >= 242 || min <= 14;
    if (dist2 >= dist2Cut && graphic) raw[i] = 1;
  }
  const total = w * h;
  const kept = new Uint8Array(total);
  const comps = componentsOf(raw, w, h);
  const ranked = comps
    .filter((c) => c.area >= 10 && c.area / total <= 0.12)
    .sort((a, b) => a.area - b.area);
  let used = 0;
  const budget = Math.floor(total * 0.18);
  for (const comp of ranked) {
    if (used + comp.area > budget) continue;
    const bw = comp.maxX - comp.minX + 1;
    const bh = comp.maxY - comp.minY + 1;
    if (bw > w * 0.72 && bh > h * 0.72) continue;
    for (const p of comp.pixels) kept[p] = 1;
    used += comp.area;
  }
  fillHoles(kept, w, h);
  markFrame(small, kept);
  return dilate(kept, w, h, 2);
}

function fillHoles(mask: Uint8Array, w: number, h: number) {
  const seen = new Uint8Array(mask.length);
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x;
    if (seen[i] || mask[i]) return;
    seen[i] = 1;
    stack.push(i);
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    const y = (i - x) / w;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] && !seen[i]) mask[i] = 1;
  }
}

function markFrame(src: Raster, mask: Uint8Array) {
  const w = src.width;
  const h = src.height;
  const band = Math.max(2, Math.round(Math.min(w, h) * 0.04));
  let br = 0;
  let bg = 0;
  let bb = 0;
  let bn = 0;
  let cr = 0;
  let cg = 0;
  let cb = 0;
  let cn = 0;
  const border: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const edge = x < band || y < band || x >= w - band || y >= h - band;
      const i = (y * w + x) * 4;
      if (edge) {
        br += src.data[i]!;
        bg += src.data[i + 1]!;
        bb += src.data[i + 2]!;
        bn++;
        border.push(y * w + x);
      } else if (x > w * 0.3 && x < w * 0.7 && y > h * 0.3 && y < h * 0.7) {
        cr += src.data[i]!;
        cg += src.data[i + 1]!;
        cb += src.data[i + 2]!;
        cn++;
      }
    }
  }
  if (!bn || !cn) return;
  br /= bn;
  bg /= bn;
  bb /= bn;
  cr /= cn;
  cg /= cn;
  cb /= cn;
  let varSum = 0;
  for (const p of border) {
    const i = p * 4;
    const dr = src.data[i]! - br;
    const dg = src.data[i + 1]! - bg;
    const db = src.data[i + 2]! - bb;
    varSum += dr * dr + dg * dg + db * db;
  }
  const std = Math.sqrt(varSum / bn);
  const mean = (br + bg + bb) / 3;
  const sat = Math.max(br, bg, bb) - Math.min(br, bg, bb);
  const dist = Math.hypot(br - cr, bg - cg, bb - cb);
  const graphic = (mean > 232 && std < 14) || (mean < 20 && std < 14) || (sat > 70 && std < 24);
  if (!graphic || dist < 36) return;
  for (const p of border) mask[p] = 1;
}

export function inpaint(src: Raster, mask: Uint8Array): Raster {
  const w = src.width;
  const h = src.height;
  const data = new Uint8ClampedArray(src.data);
  const known = new Uint8Array(w * h);
  let masked = 0;
  for (let i = 0; i < known.length; i++) {
    if (mask[i]) masked++;
    else known[i] = 1;
  }
  if (masked === 0) return { width: w, height: h, data };
  const qx = new Int32Array(w * h);
  const qy = new Int32Array(w * h);
  const queued = new Uint8Array(w * h);
  let qe = 0;
  let qs = 0;
  const push = (x: number, y: number) => {
    const i = y * w + x;
    if (known[i] || queued[i]) return;
    queued[i] = 1;
    qx[qe] = x;
    qy[qe] = y;
    qe++;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (known[y * w + x]) continue;
      let boundary = false;
      for (let dy = -1; dy <= 1 && !boundary; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          if (known[ny * w + nx]) {
            boundary = true;
            break;
          }
        }
      }
      if (boundary) push(x, y);
    }
  }
  let guard = w * h * 4;
  while (qs < qe && guard-- > 0) {
    const x = qx[qs]!;
    const y = qy[qs]!;
    qs++;
    const idx = y * w + x;
    if (known[idx]) continue;
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (!known[ny * w + nx]) continue;
        const weight = dx === 0 || dy === 0 ? 3 : 1;
        const i = (ny * w + nx) * 4;
        r += data[i]! * weight;
        g += data[i + 1]! * weight;
        b += data[i + 2]! * weight;
        n += weight;
      }
    }
    if (n === 0) continue;
    const o = idx * 4;
    data[o] = r / n;
    data[o + 1] = g / n;
    data[o + 2] = b / n;
    data[o + 3] = src.data[o + 3]!;
    known[idx] = 1;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (!known[ny * w + nx]) push(nx, ny);
      }
    }
  }
  return { width: w, height: h, data: softenMask(data, mask, w, h) };
}

function softenMask(data: Uint8ClampedArray, mask: Uint8Array, w: number, h: number) {
  const out = new Uint8ClampedArray(data);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      if (!mask[idx]) continue;
      let r = 0;
      let g = 0;
      let b = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const i = ((y + dy) * w + (x + dx)) * 4;
          r += data[i]!;
          g += data[i + 1]!;
          b += data[i + 2]!;
        }
      }
      const o = idx * 4;
      out[o] = data[o]! * 0.55 + (r / 9) * 0.45;
      out[o + 1] = data[o + 1]! * 0.55 + (g / 9) * 0.45;
      out[o + 2] = data[o + 2]! * 0.55 + (b / 9) * 0.45;
    }
  }
  return out;
}

export function naturalize(src: Raster, strength: number): Raster {
  const s = Math.min(1, Math.max(0, strength));
  const w = src.width;
  const h = src.height;
  const n = w * h;
  const data = new Uint8ClampedArray(src.data);
  if (s <= 0.001) return { width: w, height: h, data };
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  for (let i = 0; i < data.length; i += 4) {
    rSum += data[i]!;
    gSum += data[i + 1]!;
    bSum += data[i + 2]!;
  }
  const rMean = rSum / n || 1;
  const gMean = gSum / n || 1;
  const bMean = bSum / n || 1;
  const gray = (rMean + gMean + bMean) / 3;
  const cast = 0.42 * s;
  const kr = 1 + (gray / rMean - 1) * cast;
  const kg = 1 + (gray / gMean - 1) * cast;
  const kb = 1 + (gray / bMean - 1) * cast;
  const satPull = 0.26 * s;
  const luma = new Float32Array(n);
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const r = clamp(data[i]! * kr);
    const g = clamp(data[i + 1]! * kg);
    const b = clamp(data[i + 2]! * kb);
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    luma[p] = y;
    data[i] = clamp(y + (r - y) * (1 - satPull));
    data[i + 1] = clamp(y + (g - y) * (1 - satPull));
    data[i + 2] = clamp(y + (b - y) * (1 - satPull));
  }
  const radius = 1;
  const stride = w + 1;
  const sat = new Float64Array(stride * (h + 1));
  for (let y = 1; y <= h; y++) {
    let run = 0;
    for (let x = 1; x <= w; x++) {
      run += luma[(y - 1) * w + (x - 1)]!;
      sat[y * stride + x] = sat[(y - 1) * stride + x]! + run;
    }
  }
  const detail = 0.72 * s;
  const toe = 0.16 * s;
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(h, y + radius + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(w, x + radius + 1);
      const area = (x1 - x0) * (y1 - y0);
      const blur = rectSum(sat, stride, x0, y0, x1, y1) / area;
      const p = y * w + x;
      const yv = luma[p]!;
      let boost = (yv - blur) * detail;
      if (yv < 48) boost -= (48 - yv) * toe * 0.15;
      const o = p * 4;
      data[o] = clamp(data[o]! + boost);
      data[o + 1] = clamp(data[o + 1]! + boost);
      data[o + 2] = clamp(data[o + 2]! + boost);
    }
  }
  return { width: w, height: h, data };
}

export async function restoreRaster(
  src: Raster,
  options: RestoreOptions,
  onProgress?: (ratio: number) => void,
): Promise<RestoreResult> {
  onProgress?.(0.08);
  await yieldThread();
  let mask = new Uint8Array(src.width * src.height);
  let any = false;
  if (options.stickers) {
    const small = detectStickerMask(src, options.sensitivity);
    const analysis = downscale(src, 420);
    mask = upscaleMask(small, analysis.width, analysis.height, src.width, src.height);
    any = true;
  }
  if (options.brush && options.brush.length === mask.length) {
    for (let i = 0; i < mask.length; i++) {
      if (options.brush[i]) {
        mask[i] = 1;
        any = true;
      }
    }
  }
  onProgress?.(0.28);
  await yieldThread();
  let covered = 0;
  let current: Raster = { width: src.width, height: src.height, data: new Uint8ClampedArray(src.data) };
  if (any) {
    let count = 0;
    for (let i = 0; i < mask.length; i++) if (mask[i]) count++;
    covered = count / mask.length;
    if (count > 0) current = inpaint(current, mask);
  }
  onProgress?.(0.72);
  await yieldThread();
  if (options.natural) current = naturalize(current, options.strength);
  onProgress?.(1);
  return { raster: current, covered };
}
