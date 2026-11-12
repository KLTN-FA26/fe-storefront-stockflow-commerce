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
import { sectorBounds } from "../geometry/sector";
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

describe("sectorBounds", () => {
  /** Points of the annular sector, densely: 20 001 angles across it, on five radii between its two. */
  const denseBox = (
    centre: { x: number; y: number },
    [r0, r1]: readonly [number, number],
    from: number,
    to: number,
  ) => {
    const points = [];
    for (let i = 0; i <= 20_000; i++) {
      const phi = from + ((to - from) * i) / 20_000;
      for (let j = 0; j <= 4; j++) {
        const r = r0 + ((r1 - r0) * j) / 4;
        points.push({ x: centre.x + r * Math.sin(phi), y: centre.y - r * Math.cos(phi) });
      }
    }
    return boundsOf(points);
  };

  it.each([
    { name: "across the top", centre: { x: 10, y: 300 }, radii: [150, 260], from: -0.6, to: 0.7 },
    { name: "between two axes", centre: { x: 0, y: 0 }, radii: [50, 120], from: 0.2, to: 1.2 },
    { name: "across three axes", centre: { x: -5, y: 8 }, radii: [80, 100], from: -2.5, to: 2.9 },
    { name: "across the bottom", centre: { x: 3, y: -4 }, radii: [30, 40], from: 1, to: 4 },
    { name: "given backwards", centre: { x: 0, y: 200 }, radii: [100, 60], from: 0.9, to: -0.4 },
    { name: "almost a ring", centre: { x: 1, y: 2 }, radii: [20, 25], from: -3.1, to: 3.1 },
  ] as const)(
    "is the box of a dense sampling of the sector ($name)",
    ({ centre, radii, from, to }) => {
      const exact = sectorBounds(centre, radii, from, to);
      const dense = denseBox(centre, radii, from, to);
      for (const side of ["x", "y", "width", "height"] as const) {
        expect(exact[side]).toBeCloseTo(dense[side], 4);
      }
      // Never smaller: every sampled point lies inside it.
      expect(exact.x).toBeLessThanOrEqual(dense.x + 1e-9);
      expect(exact.y).toBeLessThanOrEqual(dense.y + 1e-9);
      expect(exact.x + exact.width).toBeGreaterThanOrEqual(dense.x + dense.width - 1e-9);
      expect(exact.y + exact.height).toBeGreaterThanOrEqual(dense.y + dense.height - 1e-9);
    },
  );
});
