import { describe, expect, it } from "vitest";

import { printSlugLines } from "../export/slug";
import { mergeVectorPages } from "../export/vector-merge";
import type { VectorPage } from "../export/vector-page";
import {
  bagSheet,
  DEFAULT_GLUE_FLAP_MM,
  defaultBottomFoldMm,
  onSheet,
  sheetFlatSize,
  sheetLines,
} from "../surfaces/bag-sheet";
import type { BagModel } from "../template/schema";
import { bagM } from "./fixtures";

const model = bagM.model as BagModel;
const known: BagModel = { ...model, glueFlapMm: 20, bottomFoldMm: 72 };

describe("bagSheet", () => {
  // The worked example of spec 2026-11-18 §3, the one the backend's `BagSheet` pins too.
  it("lays the four sides out as the spec's worked example: 780 × 392 mm, 786 × 398 with bleed", () => {
    const sheet = bagSheet(known, bagM.printAreas);

    expect(sheet).toMatchObject({
      glueFlapMm: 20,
      topFoldMm: 40,
      printedHeightMm: 280,
      bottomFoldMm: 72,
      bleedMm: 3,
      trimWidthMm: 780,
      trimHeightMm: 392,
      assumed: false,
    });
    expect(sheetFlatSize(sheet)).toEqual({ width: 786, height: 398 });
    expect(sheet.sides).toEqual({
      FRONT: { x: 20, y: 40, width: 260, height: 280 },
      RIGHT: { x: 280, y: 40, width: 120, height: 280 },
      BACK: { x: 400, y: 40, width: 260, height: 280 },
      LEFT: { x: 660, y: 40, width: 120, height: 280 },
    });
    expect(sheet.verticalFolds).toEqual([20, 280, 340, 400, 660, 720]);
    expect(sheet.horizontalFolds).toEqual([40, 320]);
    expect(onSheet(sheet, sheet.sides.FRONT)).toMatchObject({ x: 23, y: 43 });
  });

  it("stands the defaults in for a template without a glue flap or bottom fold, and says so", () => {
    const sheet = bagSheet(model, bagM.printAreas);

    expect(sheet.glueFlapMm).toBe(DEFAULT_GLUE_FLAP_MM);
    expect(sheet.bottomFoldMm).toBe(defaultBottomFoldMm(120));
    expect(defaultBottomFoldMm(120)).toBe(72);
    expect(defaultBottomFoldMm(95)).toBe(57);
    expect(sheet.assumed).toBe(true);
    expect(bagSheet({ ...model, glueFlapMm: 25 }, bagM.printAreas).assumed).toBe(true);
  });

  it("takes the template's own glue flap and bottom fold, and the largest bleed of the sides", () => {
    const areas = bagM.printAreas.map((area) =>
      area.code === "LEFT" ? { ...area, bleedMm: 4 } : area,
    );
    const sheet = bagSheet({ ...model, glueFlapMm: 15, bottomFoldMm: 60 }, areas);

    expect(sheet.trimWidthMm).toBe(15 + 2 * 260 + 2 * 120);
    expect(sheet.trimHeightMm).toBe(40 + 280 + 60);
    expect(sheet.bleedMm).toBe(4);
    expect(sheet.sides.LEFT.x).toBe(15 + 2 * 260 + 120);
  });

  it("draws the die line round the trim and every fold across the sheet, inside the bleed", () => {
    const sheet = bagSheet(known, bagM.printAreas);
    const { cut, folds } = sheetLines(sheet);

    expect(cut).toEqual([
      { c: "M", x: 3, y: 3 },
      { c: "L", x: 783, y: 3 },
      { c: "L", x: 783, y: 395 },
      { c: "L", x: 3, y: 395 },
      { c: "Z" },
    ]);
    expect(folds).toHaveLength(8);
    expect(folds[0]).toEqual([
      { c: "M", x: 23, y: 3 },
      { c: "L", x: 23, y: 395 },
    ]);
    expect(folds.at(-1)).toEqual([
      { c: "M", x: 3, y: 323 },
      { c: "L", x: 783, y: 323 },
    ]);
  });
});

describe("mergeVectorPages", () => {
  const part = (tag: string, withUnderlay = false): VectorPage => ({
    content: `/VL0 BDC /VGs0 gs /VIm0 Do /VL1 BDC ${tag}`,
    images: [new Uint8Array([tag.charCodeAt(0)])],
    alphas: [0.5],
    layers: [`${tag} 1`, `${tag} 2`],
    ...(withUnderlay
      ? {
          underlay: {
            content: `/VWg0 gs /VMk0 Do ${tag}`,
            alphas: [1],
            masks: [{ width: 1, height: 1, alpha: new Uint8Array([255]) }],
          },
        }
      : {}),
  });

  it("puts the parts one after the other, each numbered after the ones before it", () => {
    const merged = mergeVectorPages([part("a"), part("b")]);

    expect(merged.content).toBe(
      "/VL0 BDC /VGs0 gs /VIm0 Do /VL1 BDC a\n/VL2 BDC /VGs1 gs /VIm1 Do /VL3 BDC b",
    );
    expect(merged.layers).toEqual(["a 1", "a 2", "b 1", "b 2"]);
    expect(merged.alphas).toEqual([0.5, 0.5]);
    expect(merged.images).toHaveLength(2);
    expect(merged.underlay).toBeUndefined();
  });

  it("keeps a white-ink underlay with its own numbering", () => {
    const merged = mergeVectorPages([part("a", true), part("b", true)]);

    expect(merged.underlay?.content).toBe("/VWg0 gs /VMk0 Do a\n/VWg1 gs /VMk1 Do b");
    expect(merged.underlay?.alphas).toEqual([1, 1]);
    expect(merged.underlay?.masks).toHaveLength(2);
  });
});

describe("printSlugLines for a bag's sheet", () => {
  const info = {
    title: "Túi quán A",
    sku: "BAG-KRAFT-M",
    version: 2,
    exportedAt: "19 thg 11, 2026 08:00",
    checksum: "cd".repeat(32),
    profileName: "ISO Coated v2 (ECI)",
  };
  const area = {
    code: "FRONT" as const,
    name: "Tấm trải phẳng",
    page: 1,
    pages: 1,
    trimMm: { width: 780, height: 392 },
    bleedMm: 3,
    guideKinds: ["crease" as const, "safe" as const],
    sheet: { glueFlapMm: 20, topFoldMm: 40, bottomFoldMm: 72, assumed: false },
  };

  it("names the sheet, its trim and its folds", () => {
    const [, line] = printSlugLines(info, area);

    expect(line).toContain("Tấm trải phẳng (4 mặt túi) · Trang 1/1 · Thành phẩm 780 × 392 mm");
    expect(line).toContain("Mép dán 20 mm · Gấp miệng 40 mm · Gấp đáy 72 mm");
    expect(line).not.toContain("giả định");
  });

  it("says when the glue flap and bottom fold are assumed", () => {
    const [, line] = printSlugLines(info, { ...area, sheet: { ...area.sheet, assumed: true } });

    expect(line).toContain("Gấp đáy 72 mm (mép dán, gấp đáy: giả định)");
  });
});
