// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  polarWarp,
  warpBounds,
  warpToFlat,
  warpToLocal,
  type PolarWarp,
} from "../geometry/polar-warp";
import { remapRaster, type Raster } from "../render/remap";
import { cupSector } from "../surfaces";
import { cup12oz, cupBody, imageEl } from "./fixtures";

const sector = cupSector(cup12oz.model as Parameters<typeof cupSector>[0]);

type Rgba = readonly [number, number, number, number];
const RED: Rgba = [255, 0, 0, 255];
const BLUE: Rgba = [0, 0, 255, 255];
const CLEAR: Rgba = [0, 0, 0, 0];

/** A `width × height` raster whose pixel `(x, y)` is `paint(x, y)`. */
function raster(
  width: number,
  height: number,
  paint: (x: number, y: number) => ArrayLike<number>,
): Raster {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data.set(paint(x, y), (y * width + x) * 4);
  }
  return { data, width, height };
}

/** The RGBA bytes of pixel `(x, y)`. */
const pixel = (r: Raster, x: number, y: number) => {
  const i = (y * r.width + x) * 4;
  return [...r.data.subarray(i, i + 4)];
};

/** `r` mirrored left to right. */
const mirrored = (r: Raster) => raster(r.width, r.height, (x, y) => pixel(r, r.width - 1 - x, y));

/** How many bytes of two same-sized rasters differ (`toEqual` crawls over large typed arrays). */
const differingBytes = (a: Raster, b: Raster) =>
  a.data.reduce((count, byte, i) => (byte === b.data[i] ? count : count + 1), 0);

describe("remapRaster", () => {
  it("an identity toLocal at the source's own resolution copies the raster byte for byte", () => {
    const palette: Rgba[] = [
      RED,
      BLUE,
      CLEAR,
      [12, 200, 90, 255],
      [255, 128, 0, 77],
      [40, 40, 40, 1],
    ];
    const src = raster(7, 5, (x, y) => palette[(x * 3 + y * 5) % palette.length]!);
    const out = remapRaster(src, { x: 0, y: 0, pxPerMm: 1 }, { width: 7, height: 5 }, (px, py) => ({
      x: px,
      y: py,
    }));
    expect(out.width).toBe(7);
    expect(out.height).toBe(5);
    expect(out.data).toEqual(src.data);
  });

  it("interpolates premultiplied: halfway from opaque red to transparent black is half-clear red", () => {
    const src = raster(2, 1, (x) => (x === 0 ? RED : CLEAR));
    const out = remapRaster(src, { x: 0, y: 0, pxPerMm: 1 }, { width: 1, height: 1 }, () => ({
      x: 1,
      y: 0.5,
    }));
    expect(pixel(out, 0, 0)).toEqual([255, 0, 0, 128]);
  });

  it("counts neighbours outside the source as transparent: the edge fades, it is never stretched", () => {
    const src = raster(1, 1, () => RED);
    const at = (x: number) =>
      pixel(
        remapRaster(src, { x: 0, y: 0, pxPerMm: 1 }, { width: 1, height: 1 }, () => ({
          x,
          y: 0.5,
        })),
        0,
        0,
      );
    expect(at(1)).toEqual([255, 0, 0, 128]);
    expect(at(1.5)).toEqual(CLEAR);
    expect(at(-0.5)).toEqual(CLEAR);
  });

  it("leaves no gaps: a solid source warped over a full-height cup image is opaque inside, clear outside", () => {
    const PX_PER_MM = 12;
    const box = { x: -30, y: -48.5, width: 60, height: 97 };
    const el = imageEl("w", {
      wrap: true,
      widthMm: 60,
      heightMm: 97,
      placement: { u: 120, v: sector.outerRadiusMm - sector.midRadiusMm, rotationDeg: 0, scale: 1 },
    });
    const w = polarWarp(el, cupBody, box)!;
    const flat = warpBounds(w);
    const dst = {
      width: Math.ceil(flat.width * PX_PER_MM),
      height: Math.ceil(flat.height * PX_PER_MM),
    };
    const toLocal = (px: number, py: number) =>
      warpToLocal(w, flat.x + px / PX_PER_MM, flat.y + py / PX_PER_MM);
    const src = raster(box.width * PX_PER_MM, box.height * PX_PER_MM, () => BLUE);
    const out = remapRaster(src, { x: box.x, y: box.y, pxPerMm: PX_PER_MM }, dst, toLocal);

    let [inside, outside, holes, spill] = [0, 0, 0, 0];
    for (let py = 0; py < dst.height; py++) {
      for (let px = 0; px < dst.width; px++) {
        const p = toLocal(px + 0.5, py + 0.5);
        const marginPx =
          Math.min(p.x - box.x, box.x + box.width - p.x, p.y - box.y, box.y + box.height - p.y) *
          PX_PER_MM;
        const [r, g, b, a] = pixel(out, px, py);
        if (marginPx >= 1) {
          inside++;
          if (r !== 0 || g !== 0 || b !== 255 || a !== 255) holes++;
        } else if (marginPx <= -1) {
          outside++;
          if (a !== 0) spill++;
        }
      }
    }
    expect(holes).toBe(0);
    expect(spill).toBe(0);
    // The warped box covers 60 × 97 mm² of the sheet; nearly all of it lies ≥ 1 px inside.
    expect(inside).toBeGreaterThan(0.95 * box.width * box.height * PX_PER_MM ** 2);
    expect(outside).toBeGreaterThan(0);
  });

  it("a flipX warp mirrors a two-colour source", () => {
    const PX_PER_MM = 8;
    const box = { x: -30, y: -20, width: 60, height: 40 };
    const R = sector.midRadiusMm;
    const warp = (flipX: boolean): PolarWarp => ({
      apex: { x: 0, y: R },
      radiusMm: R,
      angleRad: 0,
      scale: 1,
      flipX,
      flipY: false,
      box,
    });
    const flat = warpBounds(warp(false));
    // A grid symmetric about the warp's axis (x = 0), so column `c` mirrors column `width − 1 − c`.
    const half = Math.ceil(Math.max(-flat.x, flat.x + flat.width) * PX_PER_MM);
    const dst = { width: 2 * half, height: Math.ceil(flat.height * PX_PER_MM) };
    const remap = (flipX: boolean) =>
      remapRaster(
        raster(box.width * PX_PER_MM, box.height * PX_PER_MM, (x) =>
          x < 30 * PX_PER_MM ? RED : BLUE,
        ),
        { x: box.x, y: box.y, pxPerMm: PX_PER_MM },
        dst,
        (px, py) => warpToLocal(warp(flipX), (px - half) / PX_PER_MM, flat.y + py / PX_PER_MM),
      );
    const plain = remap(false);
    const flipped = remap(true);

    const leftQuarter = warpToFlat(warp(false), -15, 0);
    const [qx, qy] = [
      Math.floor(leftQuarter.x * PX_PER_MM) + half,
      Math.floor((leftQuarter.y - flat.y) * PX_PER_MM),
    ];
    expect(pixel(plain, qx, qy)).toEqual(RED);
    expect(pixel(flipped, qx, qy)).toEqual(BLUE);
    expect(differingBytes(flipped, mirrored(plain))).toBe(0);
  });
});
