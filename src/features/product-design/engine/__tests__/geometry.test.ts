// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  applyToPoint,
  IDENTITY,
  invert,
  multiply,
  rotate,
  scale,
  translate,
} from "../geometry/affine";
import { boundsOf, pointInPolygon } from "../geometry/polygon";
import { simplifyRdp } from "../geometry/simplify";
import { effectiveDpi, mmToPt, mmToPx, ptToMm, pxToMm } from "../geometry/units";

describe("geometry primitives", () => {
  it("converts units", () => {
    expect(ptToMm(72)).toBeCloseTo(25.4);
    expect(mmToPt(25.4)).toBeCloseTo(72);
    expect(mmToPx(25.4, 300)).toBeCloseTo(300);
    expect(effectiveDpi(1200, 101.6)).toBeCloseTo(300);
  });

  it("composes, applies and inverts affine matrices", () => {
    const m = multiply(translate(10, 5), rotate(Math.PI / 2));
    expect(applyToPoint(m, { x: 1, y: 0 })).toMatchObject({
      x: expect.closeTo(10),
      y: expect.closeTo(6),
    });
    const back = applyToPoint(invert(m)!, applyToPoint(m, { x: 3, y: -2 }));
    expect(back.x).toBeCloseTo(3);
    expect(back.y).toBeCloseTo(-2);
    expect(invert(scale(0, 1))).toBeNull();
  });

  it("tests polygons and bounds", () => {
    const sq = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(pointInPolygon({ x: 5, y: 5 }, sq)).toBe(true);
    expect(pointInPolygon({ x: 11, y: 5 }, sq)).toBe(false);
    expect(boundsOf(sq)).toEqual({ x: 0, y: 0, width: 10, height: 10 });
  });

  it("simplifies a polyline with RDP and keeps endpoints", () => {
    const line = [
      [0, 0, 1],
      [1, 0.01, 1],
      [2, 0, 1],
      [3, 5, 1],
    ] as const;
    expect(simplifyRdp([...line], 0.1)).toEqual([
      [0, 0, 1],
      [2, 0, 1],
      [3, 5, 1],
    ]);
  });

  it("round-trips px and mm at the same dpi", () => {
    expect(pxToMm(mmToPx(37.5, 300), 300)).toBeCloseTo(37.5);
    expect(pxToMm(300, 300)).toBeCloseTo(25.4);
  });

  it("treats IDENTITY as neutral and inverts non-trivial transforms to it", () => {
    const m = multiply(translate(7, -3), multiply(rotate(0.4), scale(2, 3)));
    expect(multiply(IDENTITY, m)).toEqual(m);
    const roundTrip = multiply(invert(m)!, m);
    roundTrip.forEach((v, i) => expect(v).toBeCloseTo(IDENTITY[i]!));
  });

  it("handles degenerate polygons and bounds", () => {
    expect(pointInPolygon({ x: 0, y: 0 }, [])).toBe(false);
    expect(
      pointInPolygon({ x: 1, y: 1 }, [
        { x: 0, y: 0 },
        { x: 2, y: 2 },
      ]),
    ).toBe(false);
    expect(boundsOf([])).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    expect(
      boundsOf([
        { x: -4, y: 2 },
        { x: 3, y: -6 },
      ]),
    ).toEqual({ x: -4, y: -6, width: 7, height: 8 });
  });

  it("excludes a point inside the notch of a concave polygon", () => {
    const u = [
      { x: 0, y: 0 },
      { x: 9, y: 0 },
      { x: 9, y: 9 },
      { x: 6, y: 9 },
      { x: 6, y: 3 },
      { x: 3, y: 3 },
      { x: 3, y: 9 },
      { x: 0, y: 9 },
    ];
    expect(pointInPolygon({ x: 1, y: 6 }, u)).toBe(true);
    expect(pointInPolygon({ x: 4.5, y: 6 }, u)).toBe(false);
  });

  it("leaves short polylines alone and keeps the far point of a closed loop", () => {
    expect(simplifyRdp([[0, 0]], 1)).toEqual([[0, 0]]);
    expect(
      simplifyRdp(
        [
          [0, 0],
          [5, 5],
          [0, 0],
        ],
        0.1,
      ),
    ).toEqual([
      [0, 0],
      [5, 5],
      [0, 0],
    ]);
  });

  it("simplifies a long zig-zag without exhausting the call stack", () => {
    const zigzag = Array.from({ length: 50_000 }, (_, i): [number, number] => [i, i % 2]);
    expect(simplifyRdp(zigzag, 5)).toEqual([zigzag[0], zigzag[49_999]]);
  });
});
