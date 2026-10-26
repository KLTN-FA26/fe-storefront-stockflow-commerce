// @vitest-environment node
import { describe, expect, it } from "vitest";

import { createSurfaces, cupSector } from "../surfaces";
import { customizationTemplateSchema, type CupModel } from "../template/schema";
import { bagM, cup12oz } from "./fixtures";

describe("print surfaces", () => {
  it("derives the 12oz cup sector", () => {
    const s = cupSector(cup12oz.model as CupModel);
    expect(s.slantMm).toBeCloseTo(111.02, 2);
    expect(s.sweepRad * s.outerRadiusMm).toBeCloseTo(Math.PI * 90, 6); // rim circumference
    expect(s.sweepRad * s.innerRadiusMm).toBeCloseTo(Math.PI * 60, 6); // base circumference
    expect(s.trimOuterMm).toBeCloseTo(327.05, 2);
    expect(s.trimInnerMm).toBeCloseTo(230.04, 2);
    expect(s.seamRad).toBeCloseTo(0.03478, 4);
  });

  it("keeps an element upright and round-trips surface coordinates", () => {
    const cup = createSurfaces(cup12oz).byCode.BODY!;
    const s = cupSector(cup12oz.model as CupModel);
    expect(cup.toFlat((s.sweepRad * s.midRadiusMm) / 2, 50).uprightRad).toBeCloseTo(0);
    expect(cup.toFlat(0, 50).uprightRad).toBeCloseTo(-s.sweepRad / 2);
    for (const u of [0, 40, 140, 260])
      for (const v of [6, 50, 100]) {
        const f = cup.toFlat(u, v);
        const back = cup.fromFlat(f.x, f.y);
        expect(back.u).toBeCloseTo(u, 9);
        expect(back.v).toBeCloseTo(v, 9);
      }
  });

  it("classifies regions and the seam", () => {
    const cup = createSurfaces(cup12oz).byCode.BODY!;
    const front = (v: number) => {
      const f = cup.toFlat(cup.uRange[1] / 2 - 4, v);
      return { x: f.x, y: f.y };
    };
    expect(cup.contains(front(50), "safe")).toBe(true);
    expect(cup.contains(front(5), "trim")).toBe(false);
    expect(cup.contains(front(5), "bleed")).toBe(true);
    const flap = cup.toFlat(cup.uRange[1] - 2, 50);
    expect(cup.inSeam({ x: flap.x, y: flap.y })).toBe(true);
    expect(cup.inSeam(front(50))).toBe(false);
    const b = cup.flatBounds;
    const uv = [cup.uvOf(b.x, b.y), cup.uvOf(b.x + b.width, b.y + b.height)];
    expect(uv.flat().every((n) => n >= 0 && n <= 1)).toBe(true);
  });

  it("builds bag faces with bleed, safe and crease", () => {
    const set = createSurfaces(bagM);
    expect(set.order).toEqual(["FRONT", "BACK", "LEFT", "RIGHT"]);
    expect(set.byCode.FRONT!.flatBounds).toEqual({ x: 0, y: 0, width: 266, height: 286 });
    expect(set.byCode.FRONT!.toFlat(0, 0)).toEqual({ x: 3, y: 3, uprightRad: 0 });
    expect(set.byCode.FRONT!.contains({ x: 7, y: 50 }, "safe")).toBe(false);
    expect(set.byCode.LEFT!.guides().some((g) => g.kind === "crease")).toBe(true);
  });

  it("rejects a cup template whose print area does not match the geometry", () => {
    const bad = structuredClone(cup12oz);
    (bad.printAreas[0]!.shape as { sweepRad: number }).sweepRad = 0.9;
    expect(customizationTemplateSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts the shared fixtures", () => {
    expect(customizationTemplateSchema.parse(cup12oz)).toEqual(cup12oz);
    expect(customizationTemplateSchema.parse(bagM)).toEqual(bagM);
  });

  it("reports the mismatching print area on its shape", () => {
    const badCup = structuredClone(cup12oz);
    (badCup.printAreas[0]!.shape as { innerRadiusMm: number }).innerRadiusMm = 230.2;
    expect(customizationTemplateSchema.safeParse(badCup).error?.issues).toEqual([
      expect.objectContaining({
        path: ["printAreas", 0, "shape"],
        message: "Print area BODY does not match the cup geometry",
      }),
    ]);

    const badBag = structuredClone(bagM);
    badBag.printAreas[2]!.shape = cup12oz.printAreas[0]!.shape;
    expect(customizationTemplateSchema.safeParse(badBag).error?.issues).toEqual([
      expect.objectContaining({ path: ["printAreas", 2, "shape"] }),
    ]);
  });

  it("outlines the cup trim band between the corners of its surface range", () => {
    const cup = createSurfaces(cup12oz).byCode.BODY!;
    const s = cupSector(cup12oz.model as CupModel);
    const trim = cup.outline("trim");
    expect(trim.map((cmd) => cmd.c)).toEqual(["M", "A", "L", "A", "Z"]);
    const topLeft = cup.toFlat(cup.uRange[0], cup.vRange[0]);
    const bottomRight = cup.toFlat(cup.uRange[1], cup.vRange[1]);
    expect(trim[0]).toMatchObject({
      x: expect.closeTo(topLeft.x, 9),
      y: expect.closeTo(topLeft.y, 9),
    });
    expect(trim[1]).toMatchObject({ r: expect.closeTo(s.trimOuterMm, 9), ccw: false });
    expect(trim[2]).toMatchObject({
      x: expect.closeTo(bottomRight.x, 9),
      y: expect.closeTo(bottomRight.y, 9),
    });
    expect(trim[3]).toMatchObject({ r: expect.closeTo(s.trimInnerMm, 9), ccw: true });
    expect(cup.guides().map((g) => g.kind)).toEqual(["bleed", "trim", "safe", "seam"]);
  });

  it("keeps the cup's seam flap out of the safe area", () => {
    const cup = createSurfaces(cup12oz).byCode.BODY!;
    const s = cupSector(cup12oz.model as CupModel);
    // Mid-flap: about 4.9 mm from either flap edge, so only the seam rule keeps it out of safe.
    const flap = cup.toFlat(cup.uRange[1] - (s.seamRad * s.midRadiusMm) / 2, 50);
    expect(cup.inSeam(flap)).toBe(true);
    expect(cup.contains(flap, "safe")).toBe(false);
  });

  it("places the 12oz bleed box at the origin", () => {
    const cup = createSurfaces(cup12oz).byCode.BODY!;
    const s = cupSector(cup12oz.model as CupModel);
    const bleed = cup12oz.printAreas[0]!.bleedMm;
    // The box widens the trim angles by bleed / trimInner; here as arc length at the mid radius.
    const widenU = (bleed / s.trimInnerMm) * s.midRadiusMm;
    const outerV = cup.vRange[0] - bleed;
    const innerV = cup.vRange[1] + bleed;
    expect(cup.kind).toBe("sector");
    expect(cup.flatBounds).toEqual({
      x: 0,
      y: 0,
      width: expect.closeTo(286.54, 2),
      height: expect.closeTo(125.53, 2),
    });
    expect(cup.toFlat((s.sweepRad * s.midRadiusMm) / 2, outerV).y).toBeCloseTo(0, 9);
    expect(cup.toFlat(-widenU, outerV).x).toBeCloseTo(0, 9);
    expect(cup.toFlat(cup.uRange[1] + widenU, outerV).x).toBeCloseTo(cup.flatBounds.width, 9);
    expect(cup.toFlat(cup.uRange[1] + widenU, innerV).y).toBeCloseTo(cup.flatBounds.height, 9);
  });

  it("treats a cup with almost no taper as a cylinder", () => {
    const model: CupModel = {
      ...(cup12oz.model as CupModel),
      topDiameterMm: 80,
      bottomDiameterMm: 79.6,
    };
    const area = { ...cup12oz.printAreas[0]!, shape: { type: "rect" as const } };
    const template = customizationTemplateSchema.parse({ ...cup12oz, model, printAreas: [area] });
    const body = createSurfaces(template).byCode.BODY!;
    expect(body.kind).toBe("rect");
    expect(body.flatBounds.width).toBeCloseTo(Math.PI * 80 + 8 + 2 * 2, 9);
    expect(body.toFlat(0, 6)).toEqual({ x: 2, y: 2, uprightRad: 0 });
    const flap = body.toFlat(Math.PI * 80 + 4, 50);
    expect(body.inSeam(flap)).toBe(true);
    expect(body.contains(flap, "safe")).toBe(false);
    expect(body.guides().some((g) => g.kind === "seam")).toBe(true);
    const sectorOnCylinder = { ...template, printAreas: cup12oz.printAreas };
    expect(customizationTemplateSchema.safeParse(sectorOnCylinder).success).toBe(false);
  });
});
