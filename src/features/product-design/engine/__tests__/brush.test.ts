// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { Stroke } from "../document/schema";
import { boundsOf } from "../geometry/polygon";
import { strokePolygon } from "../render/brush";
import { drawingEl, sizer } from "./fixtures";

const SIZES_MM = [0.5, 1, 2, 4];

const stroke = (sizeMm: number, points: [number, number, number][]): Stroke => ({
  mode: "draw",
  color: "#000000",
  sizeMm,
  points,
});

/** The extent of the outline along each axis. */
function extent(polygon: [number, number][]) {
  const { width, height } = boundsOf(polygon.map(([x, y]) => ({ x, y })));
  return { width, height };
}

/** Every outline vertex lies inside the box the drawing is sized to (`createSizer`). */
function expectInsideBox(brush: Stroke) {
  const box = sizer(drawingEl("d", { strokes: [brush] }));
  for (const [x, y] of strokePolygon(brush)) {
    expect(x).toBeGreaterThanOrEqual(box.x);
    expect(x).toBeLessThanOrEqual(box.x + box.width);
    expect(y).toBeGreaterThanOrEqual(box.y);
    expect(y).toBeLessThanOrEqual(box.y + box.height);
  }
}

describe("a tap", () => {
  it.each(SIZES_MM)("is a dot about the brush's size at %s mm", (sizeMm) => {
    const brush = stroke(sizeMm, [[5, 5, 0.5]]);
    const { width, height } = extent(strokePolygon(brush));
    // A round dab of the brush: its diameter is the size, never a blob towards the tap's +1 offset.
    expect(width).toBeGreaterThan(0.4 * sizeMm);
    expect(width).toBeLessThanOrEqual(1.5 * sizeMm + 0.2);
    expect(height).toBeLessThanOrEqual(1.5 * sizeMm + 0.2);
    expectInsideBox(brush);
  });
});

describe("a short stroke", () => {
  /** A flick of `lengthMm` along x, sampled every 0.25 mm, in pen pressure or none. */
  const flick = (sizeMm: number, lengthMm: number, pressure: (i: number) => number) =>
    stroke(
      sizeMm,
      Array.from({ length: Math.round(lengthMm / 0.25) + 1 }, (_, i) => [i * 0.25, 0, pressure(i)]),
    );

  it.each(SIZES_MM.flatMap((sizeMm) => [0.3, 0.75, 1.5, 2.9].map((len) => [sizeMm, len] as const)))(
    "of a %s mm brush over %s mm stays inside the drawing's box",
    (sizeMm, lengthMm) => {
      expectInsideBox(flick(sizeMm, lengthMm, () => 0.5));
      expectInsideBox(flick(sizeMm, lengthMm, (i) => Math.min(1, 0.3 + i * 0.1)));
    },
  );

  it.each(SIZES_MM)("is as wide as the brush, not as long as the stroke, at %s mm", (sizeMm) => {
    const brush = flick(sizeMm, 0.5, () => 0.5);
    const { width, height } = extent(strokePolygon(brush));
    // The length (0.5 mm) plus a round cap each end; a half-disc towards a far point would be much wider.
    expect(width).toBeLessThanOrEqual(0.5 + 1.5 * sizeMm + 0.05);
    expect(height).toBeLessThanOrEqual(1.5 * sizeMm + 0.05);
  });
});
