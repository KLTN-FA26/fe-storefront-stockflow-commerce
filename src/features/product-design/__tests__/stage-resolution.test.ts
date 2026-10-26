import { describe, expect, it } from "vitest";

import {
  COARSE_STAGE_AREA_PX,
  MAX_STAGE_EDGE_PX,
  STAGE_AREA_PX,
  stagePxPerMm,
} from "../components/studio/stage-resolution";
import { bagFront, cupBody } from "../engine/__tests__/fixtures";

/** The bitmap `renderSurface` allocates for a surface at `pxPerMm` (it rounds each edge up). */
const bitmap = (bounds: { width: number; height: number }, pxPerMm: number) => ({
  width: Math.ceil(bounds.width * pxPerMm),
  height: Math.ceil(bounds.height * pxPerMm),
});
/** iOS Safari refuses a canvas larger than this many pixels. */
const SAFARI_MAX_CANVAS_PX = 16_777_216;

describe("stagePxPerMm", () => {
  const cup = cupBody.flatBounds;

  it("is the CSS scale times the device pixel ratio while the bitmap is small", () => {
    expect(stagePxPerMm({ cssPxPerMm: 2, dpr: 2, bounds: cup, coarsePointer: false })).toBe(4);
  });

  it("keeps a phone's bitmap within the touch budget at deep zoom and DPR 3", () => {
    const pxPerMm = stagePxPerMm({ cssPxPerMm: 2 * 8, dpr: 3, bounds: cup, coarsePointer: true });
    const { width, height } = bitmap(cup, pxPerMm);
    expect(width * height).toBeLessThanOrEqual(SAFARI_MAX_CANVAS_PX);
    expect(cup.width * cup.height * pxPerMm ** 2).toBeCloseTo(COARSE_STAGE_AREA_PX, -3);
  });

  it("keeps a desktop bitmap within the area budget at 8× zoom", () => {
    const pxPerMm = stagePxPerMm({
      cssPxPerMm: 3 * 8,
      dpr: 2,
      bounds: bagFront.flatBounds,
      coarsePointer: false,
    });
    const { width, height } = bitmap(bagFront.flatBounds, pxPerMm);
    expect(width * height).toBeLessThanOrEqual(SAFARI_MAX_CANVAS_PX);
    expect(width * height).toBeLessThanOrEqual(STAGE_AREA_PX * 1.01);
  });

  it("still caps the longest edge of a long, thin surface", () => {
    const strip = { width: 2000, height: 10 };
    const pxPerMm = stagePxPerMm({ cssPxPerMm: 40, dpr: 2, bounds: strip, coarsePointer: false });
    expect(bitmap(strip, pxPerMm).width).toBeLessThanOrEqual(MAX_STAGE_EDGE_PX);
  });
});
