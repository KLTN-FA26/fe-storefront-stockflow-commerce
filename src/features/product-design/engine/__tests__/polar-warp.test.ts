// @vitest-environment node
import { describe, expect, it } from "vitest";

import { applyToPoint } from "../geometry/affine";
import { elementOutline, wrapColumnMatrix } from "../geometry/element";
import {
  outlineRadii,
  polarWarp,
  warpBounds,
  warpStretch,
  warpToFlat,
  warpToLocal,
} from "../geometry/polar-warp";
import { cupSector } from "../surfaces";
import { bagFront, cup12oz, cupBody, drawingEl, imageEl } from "./fixtures";

const sector = cupSector(cup12oz.model as Parameters<typeof cupSector>[0]);
const BOX = { x: -30, y: -20, width: 60, height: 40 };

const wrappedImage = (
  placement: { u?: number; v?: number; scale?: number } = {},
  overrides: Parameters<typeof imageEl>[1] = {},
) =>
  imageEl("w", {
    wrap: true,
    placement: { u: 120, v: 40, rotationDeg: 0, scale: 1, ...placement },
    ...overrides,
  });

const FLIPS = [
  { x: false, y: false },
  { x: true, y: false },
  { x: false, y: true },
];

describe("outlineRadii", () => {
  it("spans the radii of a sector region about the apex: its arcs and its corners", () => {
    const apex = cupBody.apexMm!;
    const bleed = outlineRadii(cupBody.outline("bleed"), apex);
    expect(bleed[0]).toBeCloseTo(sector.trimInnerMm - cupBody.bleedMm, 9);
    expect(bleed[1]).toBeCloseTo(sector.trimOuterMm + cupBody.bleedMm, 9);
    const trim = outlineRadii(cupBody.outline("trim"), apex);
    expect(trim[0]).toBeCloseTo(sector.trimInnerMm, 9);
    expect(trim[1]).toBeCloseTo(sector.trimOuterMm, 9);
  });

  it("bounds an arc about another centre by its nearest and farthest possible points", () => {
    const radii = outlineRadii([{ c: "A", cx: 3, cy: 4, r: 2, start: 0, end: 1, ccw: false }], {
      x: 0,
      y: 0,
    });
    expect(radii).toEqual([3, 7]);
  });
});

describe("polarWarp", () => {
  it("is undefined for a drawing, an unwrapped element and a rect surface", () => {
    expect(polarWarp(drawingEl("d", { wrap: true }), cupBody, BOX)).toBeUndefined();
    expect(polarWarp(imageEl("i"), cupBody, BOX)).toBeUndefined();
    expect(polarWarp(wrappedImage(), bagFront, BOX)).toBeUndefined();
    expect(polarWarp(wrappedImage(), cupBody, BOX)).toBeDefined();
  });

  it.each(FLIPS)("agrees with wrapColumnMatrix at every column centre (flip %o)", (flip) => {
    const el = wrappedImage({ scale: 1.5 }, { flipX: flip.x, flipY: flip.y });
    const w = polarWarp(el, cupBody, BOX)!;
    for (let i = 0; i < 9; i++) {
      const xc = BOX.x + (BOX.width * i) / 8;
      for (const y of [BOX.y, 0, BOX.y + BOX.height]) {
        const viaColumn = applyToPoint(wrapColumnMatrix(el.placement, cupBody, xc, flip), {
          x: xc,
          y,
        });
        const viaWarp = warpToFlat(w, xc, y);
        expect(viaWarp.x).toBeCloseTo(viaColumn.x, 9);
        expect(viaWarp.y).toBeCloseTo(viaColumn.y, 9);
      }
    }
  });

  it.each(FLIPS)("warpToLocal inverts warpToFlat (flip %o)", (flip) => {
    const w = polarWarp(
      wrappedImage({ scale: 0.8 }, { flipX: flip.x, flipY: flip.y }),
      cupBody,
      BOX,
    )!;
    for (const [x, y] of [
      [-30, -20],
      [0, 0],
      [17.5, 11],
      [30, 20],
    ] as const) {
      const p = warpToFlat(w, x, y);
      const back = warpToLocal(w, p.x, p.y);
      expect(back.x).toBeCloseTo(x, 9);
      expect(back.y).toBeCloseTo(y, 9);
    }
  });

  it("warpBounds contains every point of the element outline", () => {
    for (const flip of FLIPS) {
      const el = wrappedImage({ u: 60, scale: 1.2 }, { flipX: flip.x, flipY: flip.y });
      const w = polarWarp(el, cupBody, BOX)!;
      const b = warpBounds(w);
      for (const p of elementOutline(el, cupBody, BOX)) {
        expect(p.x).toBeGreaterThanOrEqual(b.x - 1e-9);
        expect(p.x).toBeLessThanOrEqual(b.x + b.width + 1e-9);
        expect(p.y).toBeGreaterThanOrEqual(b.y - 1e-9);
        expect(p.y).toBeLessThanOrEqual(b.y + b.height + 1e-9);
      }
    }
  });

  it("warpStretch of a full-height 97 mm image at mid radius is (R_el + 48.5) / R_el", () => {
    const v = sector.outerRadiusMm - sector.midRadiusMm;
    const el = wrappedImage({ v }, { heightMm: 97, widthMm: 60 });
    const box = { x: -30, y: -48.5, width: 60, height: 97 };
    const w = polarWarp(el, cupBody, box)!;
    expect(warpStretch(w)).toBeCloseTo((sector.midRadiusMm + 48.5) / sector.midRadiusMm, 9);
  });
});
