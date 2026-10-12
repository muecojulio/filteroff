import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clahe, dehaze, grayWorld, polishNatural, unsharp } from "./enhance.ts";
import type { Raster } from "./engine.ts";

function gradientRaster(width: number, height: number): Raster {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = (x * 255) / width;
      data[i + 1] = (y * 255) / height;
      data[i + 2] = 128;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

describe("enhance (puerto OpenCV/scikit-image)", () => {
  it("grayWorld aplana el dominante de color", () => {
    const width = 32;
    const height = 32;
    const data = new Uint8ClampedArray(width * height * 4).fill(0);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 200;
      data[i + 1] = 100;
      data[i + 2] = 100;
      data[i + 3] = 255;
    }
    const out = grayWorld({ width, height, data }, 1);
    let rSum = 0;
    let gSum = 0;
    for (let i = 0; i < out.data.length; i += 4) {
      rSum += out.data[i]!;
      gSum += out.data[i + 1]!;
    }
    // El rojo dominante baja; el canal débil sube.
    assert.ok(rSum < 200 * width * height);
    assert.ok(gSum > 100 * width * height);
  });

  it("dehaze no toca una foto limpia con buen contraste", () => {
    const src = gradientRaster(32, 32);
    const out = dehaze(src, 1);
    assert.equal(out.data, src.data);
  });

  it("dehaze levanta una foto con veladura", () => {
    const width = 24;
    const height = 24;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 150 + (i % 7);
      data[i + 1] = 152;
      data[i + 2] = 148;
      data[i + 3] = 255;
    }
    const out = dehaze({ width, height, data }, 1);
    assert.notEqual(out.data, data);
  });

  it("clahe y unsharp conservan tamaño y rango", () => {
    const src = gradientRaster(48, 48);
    for (const out of [clahe(src, 1), unsharp(src, 1)]) {
      assert.equal(out.width, src.width);
      assert.equal(out.height, src.height);
      assert.equal(out.data.length, src.data.length);
      for (let i = 0; i < out.data.length; i++) {
        const value = out.data[i]!;
        assert.ok(value >= 0 && value <= 255);
        assert.ok(Number.isFinite(value));
      }
    }
  });

  it("polishNatural es determinista y estable con fuerza 0", () => {
    const src = gradientRaster(16, 16);
    assert.equal(polishNatural(src, 0), src);
    const a = polishNatural(src, 0.6);
    const b = polishNatural(src, 0.6);
    assert.deepEqual(a.data, b.data);
  });
});
