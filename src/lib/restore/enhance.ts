/**
 * Recuperación de textura y color para fotos "nacidas con filtro".
 *
 * Técnicas clásicas portadas de repositorios públicos (BSD/MIT), escritas a
 * mano sobre arreglos tipados para correr en el teléfono sin dependencias:
 *
 *  - balance de grises   → OpenCV xphoto (createGrayworldWB), BSD.
 *  - quitar neblina/glow → "Single Image Haze Removal Using Dark Channel
 *                          Prior" (Kaiming He et al.); implementaciones
 *                          públicas en pypblr/dehaze y mil-tb/dehaze, MIT.
 *  - CLAHE               → ecualización adaptativa limitada, igual que
 *                          cv2.createCLAHE y skimage.exposure.equalize_adapthist.
 *  - máscara de enfoque  → unsharp mask de scikit-image / ImageMagick.
 *
 * La meta no es "belleza": es volver el aspecto a una foto sencilla, sin
 * inventar contenido.
 */

import type { Raster } from "@/lib/restore/engine";

const clamp = (n: number) => (n < 0 ? 0 : n > 255 ? 255 : n);

/** Balance de grises (gray-world): aplana el dominio de un color del filtro. */
export function grayWorld(src: Raster, amount: number): Raster {
  if (amount <= 0.001) return src;
  const data = new Uint8ClampedArray(src.data);
  const n = src.width * src.height;
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  for (let i = 0; i < data.length; i += 4) {
    rSum += data[i]!;
    gSum += data[i + 1]!;
    bSum += data[i + 2]!;
  }
  const gray = (rSum + gSum + bSum) / (3 * n) || 1;
  const gains = [gray / (rSum / n || 1), gray / (gSum / n || 1), gray / (bSum / n || 1)];
  for (let i = 0; i < data.length; i += 4) {
    data[i] = clamp(data[i]! * (1 + (gains[0]! - 1) * amount));
    data[i + 1] = clamp(data[i + 1]! * (1 + (gains[1]! - 1) * amount));
    data[i + 2] = clamp(data[i + 2]! * (1 + (gains[2]! - 1) * amount));
  }
  return { width: src.width, height: src.height, data };
}

/**
 * Dark channel prior simplificado: estima la capa de "neblina" que dejan los
 * filtros con glow/haze y la resta. Solo actúa si la foto realmente trae
 * veladura (canal oscuro alto y poco contraste), para no lavar fotos limpias.
 */
export function dehaze(src: Raster, amount: number): Raster {
  if (amount <= 0.001) return src;
  const w = src.width;
  const h = src.height;
  const n = w * h;
  const data = new Uint8ClampedArray(src.data);
  const dark = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - 2);
    const y1 = Math.min(h - 1, y + 2);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - 2);
      const x1 = Math.min(w - 1, x + 2);
      let min = 255;
      for (let yy = y0; yy <= y1; yy++) {
        for (let xx = x0; xx <= x1; xx++) {
          const i = (yy * w + xx) * 4;
          const m = Math.min(data[i]!, data[i + 1]!, data[i + 2]!);
          if (m < min) min = m;
        }
      }
      dark[y * w + x] = min;
    }
  }
  // Luz atmosférica: percentil 99 del canal oscuro.
  const histogram = new Uint32Array(256);
  for (let p = 0; p < n; p++) histogram[dark[p]!]++;
  let seen = 0;
  let bright = 255;
  const cut = Math.floor(n * 0.99);
  for (let v = 255; v >= 0; v--) {
    seen += histogram[v]!;
    if (seen >= cut) {
      bright = v;
      break;
    }
  }
  let darkMean = 0;
  let lumaMin = 255;
  let lumaMax = 0;
  for (let p = 0; p < n; p++) {
    darkMean += dark[p]!;
    const i = p * 4;
    const luma = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
    if (luma < lumaMin) lumaMin = luma;
    if (luma > lumaMax) lumaMax = luma;
  }
  darkMean /= n;
  // Sin veladura evidente: no tocar.
  if (darkMean < 42 || lumaMax - lumaMin > 210) return src;
  const omega = 0.85 * amount;
  const a = bright * 0.92 + 16;
  for (let p = 0; p < n; p++) {
    const t = Math.max(0.32, 1 - (omega * dark[p]!) / a);
    const o = p * 4;
    data[o] = clamp((data[o]! - a) / t + a);
    data[o + 1] = clamp((data[o + 1]! - a) / t + a);
    data[o + 2] = clamp((data[o + 2]! - a) / t + a);
  }
  return { width: w, height: h, data };
}

/**
 * CLAHE sobre la luminancia: la textura que el filtro suavizó recupera
 * contraste local sin explotar el global (recorte + reparto del exceso,
 * mezcla bilineal entre teselas).
 */
export function clahe(src: Raster, amount: number, grid = 8, bins = 64): Raster {
  if (amount <= 0.001) return src;
  const w = src.width;
  const h = src.height;
  const data = new Uint8ClampedArray(src.data);
  const n = w * h;
  const luma = new Uint8Array(n);
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    luma[p] = Math.min(255, Math.max(0, Math.round(0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!)));
  }
  const gw = Math.min(grid, w);
  const gh = Math.min(grid, h);
  const tileW = Math.max(1, Math.floor(w / gw));
  const tileH = Math.max(1, Math.floor(h / gh));
  const maps: Uint8Array[] = [];
  const clipLimit = 2.2 + (1 - amount) * 2.0;
  for (let ty = 0; ty < gh; ty++) {
    for (let tx = 0; tx < gw; tx++) {
      const x0 = tx * tileW;
      const y0 = ty * tileH;
      const x1 = tx === gw - 1 ? w : x0 + tileW;
      const y1 = ty === gh - 1 ? h : y0 + tileH;
      const hist = new Uint32Array(bins);
      let count = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          hist[Math.min(bins - 1, (luma[y * w + x]! * bins) >> 8)]++;
          count++;
        }
      }
      if (count === 0) {
        maps.push(identityMap(bins));
        continue;
      }
      const limit = Math.max(1, Math.floor((clipLimit * count) / bins));
      let excess = 0;
      for (let b = 0; b < bins; b++) {
        if (hist[b]! > limit) {
          excess += hist[b]! - limit;
          hist[b] = limit;
        }
      }
      const bonus = Math.floor(excess / bins);
      for (let b = 0; b < bins; b++) hist[b] = hist[b]! + bonus;
      const cdf = new Uint32Array(bins);
      let run = 0;
      for (let b = 0; b < bins; b++) {
        run += hist[b]!;
        cdf[b] = run;
      }
      const map = new Uint8Array(bins);
      for (let b = 0; b < bins; b++) {
        map[b] = clamp(Math.round(((cdf[b]! - cdf[0]!) / Math.max(1, count - cdf[0]!)) * 255));
      }
      maps.push(map);
    }
  }
  for (let y = 0; y < h; y++) {
    const gy = Math.min(gh - 1, Math.floor(y / tileH));
    const fy = Math.min(1, (y - gy * tileH) / tileH);
    for (let x = 0; x < w; x++) {
      const gx = Math.min(gw - 1, Math.floor(x / tileW));
      const fx = Math.min(1, (x - gx * tileW) / tileW);
      const p = y * w + x;
      const bin = Math.min(bins - 1, (luma[p]! * bins) >> 8);
      const a = maps[gy * gw + gx]![bin]!;
      const b = maps[gy * gw + Math.min(gw - 1, gx + 1)]![bin]!;
      const c = maps[Math.min(gh - 1, gy + 1) * gw + gx]![bin]!;
      const d = maps[Math.min(gh - 1, gy + 1) * gw + Math.min(gw - 1, gx + 1)]![bin]!;
      const top = a + (b - a) * fx;
      const bottom = c + (d - c) * fx;
      const equalized = top + (bottom - top) * fy;
      const blended = luma[p]! + (equalized - luma[p]!) * (0.5 * amount);
      const delta = blended - luma[p]!;
      const o = p * 4;
      data[o] = clamp(data[o]! + delta);
      data[o + 1] = clamp(data[o + 1]! + delta);
      data[o + 2] = clamp(data[o + 2]! + delta);
    }
  }
  return { width: w, height: h, data };
}

function identityMap(bins: number) {
  const map = new Uint8Array(bins);
  for (let b = 0; b < bins; b++) map[b] = clamp(Math.round((b * 255) / (bins - 1)));
  return map;
}

/** Máscara de enfoque suave (unsharp mask) para devolver microtextura. */
export function unsharp(src: Raster, amount: number): Raster {
  if (amount <= 0.001) return src;
  const w = src.width;
  const h = src.height;
  const data = new Uint8ClampedArray(src.data);
  const stride = w + 1;
  const sat = new Float64Array(stride * (h + 1));
  for (let y = 1; y <= h; y++) {
    let run = 0;
    for (let x = 1; x <= w; x++) {
      const i = ((y - 1) * w + (x - 1)) * 4;
      run += 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
      sat[y * stride + x] = sat[(y - 1) * stride + x]! + run;
    }
  }
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - 1);
    const y1 = Math.min(h, y + 2);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - 1);
      const x1 = Math.min(w, x + 2);
      const area = (x1 - x0) * (y1 - y0);
      const o = (y * w + x) * 4;
      const blur = rectSum(sat, stride, x0, y0, x1, y1) / area;
      const lumaCenter = pSum(data, w, y, x);
      const delta = (lumaCenter - blur) * (0.9 * amount);
      data[o] = clamp(data[o]! + delta);
      data[o + 1] = clamp(data[o + 1]! + delta);
      data[o + 2] = clamp(data[o + 2]! + delta);
    }
  }
  return { width: w, height: h, data };
}

function rectSum(sat: Float64Array, stride: number, x0: number, y0: number, x1: number, y1: number) {
  return sat[y1 * stride + x1]! - sat[y0 * stride + x1]! - sat[y1 * stride + x0]! + sat[y0 * stride + x0]!;
}

function pSum(data: Uint8ClampedArray, w: number, y: number, x: number) {
  const i = (y * w + x) * 4;
  return 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
}

/**
 * Cadena completa para fotos que ya nacieron con el filtro horneado:
 * grises → neblina → CLAHE → enfoque. Determinista, sin IA y sin tokens.
 */
export function polishNatural(src: Raster, strength: number): Raster {
  const s = Math.min(1, Math.max(0, strength));
  if (s <= 0.001) return src;
  let out = grayWorld(src, 0.22 * s);
  out = dehaze(out, 0.55 * s);
  out = clahe(out, 0.7 * s);
  out = unsharp(out, 0.5 * s);
  return out;
}
