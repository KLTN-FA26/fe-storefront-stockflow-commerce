// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Placement, SurfaceContent } from "../document/schema";
import { snapPlacement, surfaceSnapTargets } from "../editor/snap";
import { applyToPoint } from "../geometry/affine";
import {
  arcOffsetU,
  clampPlacement,
  containmentPoints,
  elementFlip,
  elementMatrix,
  elementOutline,
  hitTest,
  isWrapped,
  wrapStripMatrix,
} from "../geometry/element";
import { boundsOf } from "../geometry/polygon";
import type { PointMm } from "../geometry/types";
import { strokePolygon } from "../render/brush";
import { createCanvasMeasurer, fontCss, fontSizePx } from "../render/fonts";
import { layoutText } from "../render/text-layout";
import { createSurfaces, cupSector } from "../surfaces";
import type { CupModel } from "../template/schema";
import {
  bagFront,
  cup12oz,
  cupBody,
  drawingEl,
  fakeMeasure,
  FONTS,
  imageEl,
  sizer,
  textEl,
} from "./fixtures";

const placement = (p: Partial<Placement> = {}): Placement => ({
  u: 130,
  v: 140,
  rotationDeg: 0,
  scale: 1,
  ...p,
});

describe("text layout", () => {
  it("lays out a text of very many lines without overflowing the stack", () => {
    const content = Array.from({ length: 200_000 }, (_, i) => (i === 7 ? "xxxx" : "x")).join("\n");
    const l = layoutText(textEl("t", { content, sizePt: 72 }), FONTS, fakeMeasure);
    expect(l.lines).toHaveLength(200_000);
    expect(l.widthMm).toBeCloseTo(4 * 0.5 * 25.4); // the widest line
  });

  it("lays out multi-line centred text in mm, Vietnamese included", () => {
    const l = layoutText(
      textEl("t", { content: "Cà phê\nSữa Đá", sizePt: 72, align: "center", lineHeight: 1.2 }),
      FONTS,
      fakeMeasure,
    );
    expect(l.fontSizeMm).toBeCloseTo(25.4);
    expect(l.lines.map((x) => x.text)).toEqual(["Cà phê", "Sữa Đá"]);
    expect(l.lines[0]!.widthMm).toBeCloseTo(6 * 0.5 * 25.4);
    expect(l.lines[0]!.xMm).toBeCloseTo(-l.lines[0]!.widthMm / 2);
  });

  it("centres the box on the origin with a CSS-like line box per line", () => {
    const l = layoutText(
      textEl("t", { content: "ab\ncdef", sizePt: 72, lineHeight: 1.2 }),
      FONTS,
      fakeMeasure,
    );
    const fs = 25.4;
    expect(l.widthMm).toBeCloseTo(4 * 0.5 * fs);
    expect(l.heightMm).toBeCloseTo(2 * 1.2 * fs);
    // top = -h/2; half-leading = (1.2 - 1) / 2 em; ascent = 0.8 em
    const first = -l.heightMm / 2 + 0.1 * fs + 0.8 * fs;
    expect(l.lines[0]!.baselineMm).toBeCloseTo(first);
    expect(l.lines[1]!.baselineMm - l.lines[0]!.baselineMm).toBeCloseTo(1.2 * fs);
  });

  it("aligns lines to the left or right edge of the widest line", () => {
    const base = { content: "ab\ncdef", sizePt: 72 };
    const left = layoutText(textEl("t", { ...base, align: "left" }), FONTS, fakeMeasure);
    const right = layoutText(textEl("t", { ...base, align: "right" }), FONTS, fakeMeasure);
    expect(left.lines.map((x) => x.xMm)).toEqual([-left.widthMm / 2, -left.widthMm / 2]);
    for (const line of right.lines) expect(line.xMm + line.widthMm).toBeCloseTo(right.widthMm / 2);
  });

  it("adds letter spacing between code points only", () => {
    const l = layoutText(
      textEl("t", { content: "abcd", sizePt: 72, letterSpacingEm: 0.1 }),
      FONTS,
      fakeMeasure,
    );
    expect(l.lines[0]!.widthMm).toBeCloseTo((4 * 0.5 + 3 * 0.1) * 25.4);
    const single = layoutText(
      textEl("t", { content: "a", sizePt: 72, letterSpacingEm: 0.5 }),
      FONTS,
      fakeMeasure,
    );
    expect(single.lines[0]!.widthMm).toBeCloseTo(0.5 * 25.4);
  });

  it("reports the letter spacing in mm for the renderer", () => {
    const spaced = layoutText(
      textEl("t", { sizePt: 72, letterSpacingEm: 0.1 }),
      FONTS,
      fakeMeasure,
    );
    expect(spaced.letterSpacingMm).toBeCloseTo(0.1 * 25.4);
    expect(layoutText(textEl("t"), FONTS, fakeMeasure).letterSpacingMm).toBe(0);
  });

  it("measures at a 100 px reference size with the element's font", () => {
    const measure = vi.fn(fakeMeasure);
    layoutText(textEl("t", { content: "x", bold: true, italic: true }), FONTS, measure);
    expect(measure).toHaveBeenCalledWith("x", 'italic 700 100px "Be Vietnam Pro"');
  });

  it("applies italic only when the family ships italics, and falls back on unknown fonts", () => {
    const lobster = layoutText(
      textEl("t", { fontCode: "lobster", italic: true, bold: true }),
      FONTS,
      fakeMeasure,
    );
    expect(lobster).toMatchObject({ family: "Lobster", bold: true, italic: false });
    const unknown = layoutText(textEl("t", { fontCode: "gone", italic: true }), FONTS, fakeMeasure);
    expect(unknown).toMatchObject({ family: "sans-serif", italic: false });
  });

  it("lays out empty content as one empty line", () => {
    const l = layoutText(textEl("t", { content: "" }), FONTS, fakeMeasure);
    expect(l.lines).toHaveLength(1);
    expect(l.widthMm).toBe(0);
    expect(l.heightMm).toBeGreaterThan(0);
  });
});

describe("font css", () => {
  it("quotes plain families and keeps lists and generics as they are", () => {
    const style = { bold: false, italic: false };
    expect(fontCss({ family: "Be Vietnam Pro", ...style }, 12)).toBe('400 12px "Be Vietnam Pro"');
    expect(fontCss({ family: "'__Lobster_ab12', sans-serif", ...style }, 12)).toBe(
      "400 12px '__Lobster_ab12', sans-serif",
    );
    expect(fontCss({ family: "sans-serif", bold: true, italic: true }, 12)).toBe(
      "italic 700 12px sans-serif",
    );
  });

  it("reads the pixel size back out of a font string", () => {
    expect(fontSizePx('italic 700 100px "Be Vietnam Pro"')).toBe(100);
    expect(fontSizePx("400 12.5px serif")).toBe(12.5);
  });
});

describe("canvas measurer", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("falls back to documented widths when there is no canvas at all", () => {
    const measure = createCanvasMeasurer();
    expect(measure("ab𝒳", "400 100px serif")).toEqual({ width: 165, ascent: 80, descent: 20 });
  });

  it("looks for a canvas once, not on every measure call", () => {
    const createElement = vi.fn(() => ({ getContext: () => null }));
    vi.stubGlobal("document", { createElement });
    const measure = createCanvasMeasurer();
    for (let i = 0; i < 5; i++) measure("abc", "400 10px serif");
    expect(createElement).toHaveBeenCalledTimes(1);
  });

  it("falls back when getContext returns null or throws", () => {
    vi.stubGlobal("document", { createElement: () => ({ getContext: () => null }) });
    expect(createCanvasMeasurer()("abcd", "400 10px serif")).toEqual({
      width: 22,
      ascent: 8,
      descent: 2,
    });
    vi.stubGlobal("document", {
      createElement: () => {
        throw new Error("no canvas");
      },
    });
    expect(createCanvasMeasurer()("a", "400 10px serif").width).toBeCloseTo(5.5);
  });

  it("measures through a 2D context when one exists", () => {
    const ctx = {
      font: "",
      measureText: vi.fn(() => ({
        width: 42,
        fontBoundingBoxAscent: 9,
        fontBoundingBoxDescent: 3,
        actualBoundingBoxAscent: 7,
        actualBoundingBoxDescent: 1,
      })),
    };
    vi.stubGlobal(
      "OffscreenCanvas",
      class {
        getContext = () => ctx;
      },
    );
    const measure = createCanvasMeasurer();
    expect(measure("hi", "700 20px Lobster")).toEqual({ width: 42, ascent: 9, descent: 3 });
    expect(ctx.font).toBe("700 20px Lobster");
    expect(ctx.measureText).toHaveBeenCalledWith("hi");
  });
});

describe("canvas measurer metric fallbacks", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses glyph bounds, then em fractions, when font bounds are missing", () => {
    const metrics: Record<string, number>[] = [
      { width: 10, actualBoundingBoxAscent: 7, actualBoundingBoxDescent: 1 },
      { width: 10 },
    ];
    const ctx = { font: "", measureText: vi.fn(() => metrics.shift()!) };
    vi.stubGlobal(
      "OffscreenCanvas",
      class {
        getContext = () => ctx;
      },
    );
    const measure = createCanvasMeasurer();
    expect(measure("a", "400 20px serif")).toEqual({ width: 10, ascent: 7, descent: 1 });
    expect(measure("a", "400 20px serif")).toEqual({ width: 10, ascent: 16, descent: 4 });
  });
});

describe("element boxes", () => {
  it("sizes images and text around the origin", () => {
    expect(sizer(imageEl("i"))).toEqual({ x: -30, y: -20, width: 60, height: 40 });
    const l = layoutText(textEl("t", { content: "Cà phê" }), FONTS, fakeMeasure);
    expect(sizer(textEl("t", { content: "Cà phê" }))).toEqual({
      x: -l.widthMm / 2,
      y: -l.heightMm / 2,
      width: l.widthMm,
      height: l.heightMm,
    });
  });

  it("sizes a drawing as its stroke points grown by the widest the brush can paint", () => {
    const el = drawingEl("d", {
      strokes: [
        {
          mode: "draw",
          color: "#000000",
          sizeMm: 2,
          points: [
            [0, 0, 0.5],
            [10, 4, 0.5],
          ],
        },
        { mode: "draw", color: "#000000", sizeMm: 6, points: [[-5, 8, 0.5]] },
        { mode: "draw", color: "#000000", sizeMm: 6, points: [] },
      ],
    });
    // Radius 0.75 x size + 0.01 mm: 1.51 around the 2 mm brush, 4.51 around the 6 mm one.
    const box = sizer(el);
    expect(box.x).toBeCloseTo(-5 - 4.51);
    expect(box.y).toBeCloseTo(0 - 1.51);
    expect(box.width).toBeCloseTo(10 + 1.51 - (-5 - 4.51));
    expect(box.height).toBeCloseTo(8 + 4.51 - (0 - 1.51));
    expect(sizer(drawingEl("e"))).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  describe("a drawing's box holds all of its ink", () => {
    const SIZE = 4;
    const stroke = (points: [number, number, number][]) => ({
      mode: "draw" as const,
      color: "#000000" as const,
      sizeMm: SIZE,
      points,
    });
    /** Slow: points 0.5 mm apart with a constant (so simulated) pressure. */
    const slow = stroke(Array.from({ length: 61 }, (_, i) => [i * 0.5, 0, 0.5]));
    /** Pen pressure ramping up to full: the brush swells to 0.75 x its size either side. */
    const full = stroke(
      Array.from({ length: 41 }, (_, i): [number, number, number] => [
        i * 2,
        0,
        Math.min(1, 0.4 + i * 0.05),
      ]),
    );

    it.each([
      ["a slow stroke with simulated pressure", slow],
      ["a stroke at full pen pressure", full],
    ])("covers every vertex of %s", (_name, brush) => {
      const polygon = strokePolygon(brush);
      const box = sizer(drawingEl("d", { strokes: [brush] }));
      // The scenario must reach past the old half-size margin, or it proves nothing.
      expect(Math.max(...polygon.map(([, y]) => Math.abs(y)))).toBeGreaterThan(SIZE / 2);
      for (const [x, y] of polygon) {
        expect(x).toBeGreaterThanOrEqual(box.x);
        expect(x).toBeLessThanOrEqual(box.x + box.width);
        expect(y).toBeGreaterThanOrEqual(box.y);
        expect(y).toBeLessThanOrEqual(box.y + box.height);
      }
    });
  });
});

describe("element matrix", () => {
  it("orients an element on the cup with the local upright", () => {
    const cup = createSurfaces(cup12oz).byCode.BODY!;
    const m = elementMatrix(
      imageEl("i", { placement: { u: 0, v: 50, rotationDeg: 0, scale: 1 } }),
      cup,
    );
    expect(Math.atan2(m[1], m[0])).toBeCloseTo(cup.toFlat(0, 50).uprightRad);
  });

  it("translates to the placement and applies rotation, scale and image flips", () => {
    const el = imageEl("i", {
      placement: placement({ u: 100, v: 50, rotationDeg: 90, scale: 2 }),
      flipX: true,
    });
    const origin = bagFront.toFlat(100, 50);
    const m = elementMatrix(el, bagFront);
    expect(applyToPoint(m, { x: 0, y: 0 })).toMatchObject({ x: origin.x, y: origin.y });
    // local +x is flipped, scaled by 2 and turned a quarter: it ends up pointing up (-y)
    const tip = applyToPoint(m, { x: 1, y: 0 });
    expect(tip.x).toBeCloseTo(origin.x);
    expect(tip.y).toBeCloseTo(origin.y - 2);
  });

  it("does not flip text or drawings", () => {
    const m = elementMatrix(textEl("t", { placement: placement({ scale: 3 }) }), bagFront);
    expect(m[0]).toBeCloseTo(3);
    expect(m[3]).toBeCloseTo(3);
  });
});

describe("arc mapping", () => {
  const sector = cupSector(cup12oz.model as CupModel);

  it("offsets u by the local x at the mid-radius ratio on a cup", () => {
    const v = 40;
    const ratio = sector.midRadiusMm / (sector.outerRadiusMm - v);
    expect(arcOffsetU(cupBody, placement({ u: 120, v, scale: 1.5 }), 20)).toBeCloseTo(
      120 + 20 * 1.5 * ratio,
      9,
    );
    expect(arcOffsetU(cupBody, placement({ u: 120, v }), 0)).toBe(120);
  });

  it("offsets u one to one on rect surfaces", () => {
    expect(arcOffsetU(bagFront, placement({ u: 100, scale: 2 }), 15)).toBeCloseTo(130);
  });

  it("puts every strip centre on one radius, each strip turned to its own upright", () => {
    const apex = cupBody.toFlat(0, sector.outerRadiusMm);
    const p = placement({ u: 120, v: 40 });
    const strips = [-40, -10, 0, 25, 40].map((xc) => {
      const m = wrapStripMatrix(p, cupBody, xc);
      return { m, centre: applyToPoint(m, { x: xc, y: 0 }) };
    });
    for (const { centre } of strips) {
      expect(Math.hypot(centre.x - apex.x, centre.y - apex.y)).toBeCloseTo(
        sector.outerRadiusMm - 40,
        6,
      );
    }
    const turns = strips.map(({ m }) => Math.atan2(m[1], m[0]));
    expect(turns[0]).toBeLessThan(turns[2]!);
    expect(turns[2]).toBeLessThan(turns[4]!);
    expect(turns[2]).toBeCloseTo(cupBody.toFlat(120, 40).uprightRad);
  });

  it("ignores rotation: a wrapped strip band on the cup always reads horizontally", () => {
    const base = placement({ u: 120, v: 40 });
    for (const xc of [-40, 0, 25]) {
      const rotated = wrapStripMatrix({ ...base, rotationDeg: 70 }, cupBody, xc);
      expect(rotated).toEqual(wrapStripMatrix(base, cupBody, xc));
    }
  });

  it("wraps only on sector surfaces", () => {
    const wrapped = { ...imageEl("w"), wrap: true };
    expect(isWrapped(wrapped, cupBody)).toBe(true);
    expect(isWrapped(wrapped, bagFront)).toBe(false);
    expect(isWrapped(imageEl("p"), cupBody)).toBe(false);
    expect(isWrapped({ ...imageEl("f"), wrap: false }, cupBody)).toBe(false);
  });

  it("wraps text and images, never drawings (spec §4.3, cup text/image)", () => {
    expect(isWrapped({ ...textEl("t"), wrap: true }, cupBody)).toBe(true);
    expect(isWrapped({ ...imageEl("i"), wrap: true }, cupBody)).toBe(true);
    expect(isWrapped({ ...drawingEl("d"), wrap: true }, cupBody)).toBe(false);
  });

  describe("flipped strips", () => {
    const p = placement({ u: 120, v: 40, scale: 1.5 });
    const samples = [
      { x: 0, y: 0 },
      { x: 7, y: 3 },
      { x: -12, y: -5 },
    ];
    const near = (a: PointMm, b: PointMm) => {
      expect(a.x).toBeCloseTo(b.x, 6);
      expect(a.y).toBeCloseTo(b.y, 6);
    };

    it("reads the flip off images only", () => {
      expect(elementFlip(imageEl("i", { flipX: true }))).toEqual({ x: true, y: false });
      expect(elementFlip(imageEl("i", { flipY: true }))).toEqual({ x: false, y: true });
      expect(elementFlip(textEl("t"))).toEqual({ x: false, y: false });
      expect(elementFlip(drawingEl("d"))).toEqual({ x: false, y: false });
    });

    it("flip.x puts the column at -xc where the unflipped one sits, mirrored within its strip", () => {
      const xc = -30;
      const flipped = wrapStripMatrix(p, cupBody, xc, { x: true, y: false });
      const mirror = wrapStripMatrix(p, cupBody, -xc);
      // the left column lands at the right-hand arc position (larger u)
      const centre = applyToPoint(flipped, { x: xc, y: 0 });
      near(centre, applyToPoint(mirror, { x: -xc, y: 0 }));
      expect(cupBody.fromFlat(centre.x, centre.y).u).toBeGreaterThan(p.u);
      // a flipped strip is the mirror strip with its x axis reversed: flipped(x, y) = mirror(-x, y)
      for (const { x, y } of samples) {
        near(applyToPoint(flipped, { x: xc + x, y }), applyToPoint(mirror, { x: -xc - x, y }));
      }
      // local +x runs against the circumference
      const tip = applyToPoint(flipped, { x: xc + 1, y: 0 });
      expect(cupBody.fromFlat(tip.x, tip.y).u).toBeLessThan(cupBody.fromFlat(centre.x, centre.y).u);
    });

    it("flip.y points the strip's y axis the opposite way", () => {
      const xc = 10;
      const plain = wrapStripMatrix(p, cupBody, xc);
      const flipped = wrapStripMatrix(p, cupBody, xc, { x: false, y: true });
      expect(flipped[0]).toBeCloseTo(plain[0]);
      expect(flipped[1]).toBeCloseTo(plain[1]);
      expect(flipped[2]).toBeCloseTo(-plain[2]);
      expect(flipped[3]).toBeCloseTo(-plain[3]);
      expect(flipped[4]).toBeCloseTo(plain[4]);
      expect(flipped[5]).toBeCloseTo(plain[5]);
      for (const { x, y } of samples) {
        near(applyToPoint(flipped, { x: xc + x, y }), applyToPoint(plain, { x: xc + x, y: -y }));
      }
    });

    it("keeps the wrapped outline of a flipped image, which is mirror-symmetric", () => {
      const img = { ...imageEl("w", { placement: p }), wrap: true };
      const box = sizer(img);
      const sorted = (poly: PointMm[]) => poly.map(({ x, y }) => [x, y] as const).sort();
      const plain = sorted(elementOutline(img, cupBody, box));
      for (const flip of [{ flipX: true }, { flipY: true }, { flipX: true, flipY: true }]) {
        const outline = sorted(elementOutline({ ...img, ...flip }, cupBody, box));
        outline.forEach(([x, y], i) => {
          expect(x).toBeCloseTo(plain[i]![0], 6);
          expect(y).toBeCloseTo(plain[i]![1], 6);
        });
      }
    });
  });
});

describe("element outline", () => {
  it("is the four transformed corners of the box", () => {
    const el = imageEl("i", { placement: placement({ u: 100, v: 50, rotationDeg: 90 }) });
    const poly = elementOutline(el, bagFront, sizer(el));
    expect(poly).toHaveLength(4);
    const c = bagFront.toFlat(100, 50);
    const b = boundsOf(poly);
    // 60 × 40 box turned a quarter is 40 wide × 60 tall around the origin
    expect(b.x).toBeCloseTo(c.x - 20);
    expect(b.width).toBeCloseTo(40);
    expect(b.height).toBeCloseTo(60);
  });

  it("samples 16 points along the top and bottom of a wrapped element on the same radii", () => {
    const el = { ...textEl("w", { content: "Xin chào cả nhà" }), wrap: true };
    const el2 = { ...el, placement: placement({ u: 120, v: 40, scale: 1.5 }) };
    const box = sizer(el2);
    const poly = elementOutline(el2, cupBody, box);
    expect(poly).toHaveLength(32);
    const apex = cupBody.toFlat(0, cupSector(cup12oz.model as CupModel).outerRadiusMm);
    const radius = (q: PointMm) => Math.hypot(q.x - apex.x, q.y - apex.y);
    const top = poly.slice(0, 16).map(radius);
    const bottom = poly.slice(16).map(radius);
    // local +y runs down the cup, towards the apex: the radius shrinks by scale · y
    const r0 = cupSector(cup12oz.model as CupModel).outerRadiusMm - 40;
    for (const r of top) expect(r).toBeCloseTo(r0 - 1.5 * box.y, 6);
    for (const r of bottom) expect(r).toBeCloseTo(r0 - 1.5 * (box.y + box.height), 6);
  });

  it("bends a wide wrapped element away from its flat quad on the cup", () => {
    const flat = textEl("f", {
      content: "x".repeat(40),
      sizePt: 24,
      placement: placement({ u: 130, v: 40 }),
    });
    const box = sizer(flat);
    const quad = elementOutline(flat, cupBody, box);
    const curved = elementOutline({ ...flat, wrap: true }, cupBody, box);
    // the ends of a wide wrapped element turn with the circumference, the quad's do not
    expect(Math.hypot(curved[0]!.x - quad[0]!.x, curved[0]!.y - quad[0]!.y)).toBeGreaterThan(5);
  });

  it("treats a wrapped drawing on the cup as rigid, like hit-testing and compose do", () => {
    const rigid = drawingEl("d", {
      strokes: [
        {
          mode: "draw",
          color: "#000000",
          sizeMm: 2,
          points: [
            [0, 0, 1],
            [30, 10, 1],
          ],
        },
      ],
      placement: placement({ u: 120, v: 40, rotationDeg: 30 }),
    });
    const box = sizer(rigid);
    const poly = elementOutline({ ...rigid, wrap: true }, cupBody, box);
    expect(poly).toEqual(elementOutline(rigid, cupBody, box));
    expect(poly).toHaveLength(4);
  });

  it("treats a wrapped element on a bag face as rigid, rotation included", () => {
    const rigid = imageEl("i", {
      widthMm: 80,
      placement: placement({ u: 100, v: 100, rotationDeg: 90 }),
    });
    const box = sizer(rigid);
    const wrapped = { ...rigid, wrap: true };
    const poly = elementOutline(wrapped, bagFront, box);
    expect(poly).toEqual(elementOutline(rigid, bagFront, box));
    // 80 × 40 turned a quarter is 40 wide × 80 tall
    const b = boundsOf(poly);
    expect(b.width).toBeCloseTo(40);
    expect(b.height).toBeCloseTo(80);
  });

  it("ignores rotation for a wrapped element on the cup", () => {
    const el = {
      ...imageEl("i", { widthMm: 80, placement: placement({ u: 120, v: 60 }) }),
      wrap: true,
    };
    const box = sizer(el);
    const upright = elementOutline(el, cupBody, box);
    for (const rotationDeg of [90, -35]) {
      const rotated = elementOutline(
        { ...el, placement: { ...el.placement, rotationDeg } },
        cupBody,
        box,
      );
      expect(rotated).toEqual(upright);
    }
    // not collapsed: a real band 80 mm wide and 40 mm tall (the arc bulges a little)
    const b = boundsOf(upright);
    expect(b.width).toBeGreaterThan(75);
    expect(b.height).toBeGreaterThan(39);
  });
});

describe("containment points", () => {
  it("samples every edge of a rigid element on the cup, the middle of its bottom edge included", () => {
    const el = imageEl("i", { placement: placement({ u: 120, v: 60 }) });
    const outline = elementOutline(el, cupBody, sizer(el));
    const points = containmentPoints(el, cupBody, outline);
    expect(points).toHaveLength(40); // 4 edges × 10 segments
    const [bottomRight, bottomLeft] = [outline[2]!, outline[3]!];
    expect(points).toContainEqual({
      x: expect.closeTo((bottomRight.x + bottomLeft.x) / 2, 9),
      y: expect.closeTo((bottomRight.y + bottomLeft.y) / 2, 9),
    });
  });

  it("is the outline itself on a bag face and for a wrapped element, which follows the arcs", () => {
    const flat = imageEl("f");
    const flatOutline = elementOutline(flat, bagFront, sizer(flat));
    expect(containmentPoints(flat, bagFront, flatOutline)).toBe(flatOutline);
    const wrapped = { ...imageEl("w", { placement: placement({ u: 120, v: 60 }) }), wrap: true };
    const wrappedOutline = elementOutline(wrapped, cupBody, sizer(wrapped));
    expect(containmentPoints(wrapped, cupBody, wrappedOutline)).toBe(wrappedOutline);
  });
});

describe("hit-testing", () => {
  it("hits the topmost visible element only", () => {
    const content = {
      background: { kind: "none" },
      elements: [imageEl("under"), imageEl("over"), { ...imageEl("ghost"), hidden: true }],
    } as SurfaceContent;
    const p = bagFront.toFlat(130, 140);
    expect(hitTest(content, bagFront, sizer, p)).toBe("over");
  });

  it("returns null away from every element", () => {
    const content = { background: { kind: "none" }, elements: [imageEl("a")] } as SurfaceContent;
    expect(hitTest(content, bagFront, sizer, bagFront.toFlat(10, 10))).toBeNull();
    expect(hitTest({ ...content, elements: [] }, bagFront, sizer, bagFront.toFlat(130, 140))).toBe(
      null,
    );
  });

  it("follows rotation", () => {
    const content = {
      background: { kind: "none" },
      elements: [imageEl("a", { placement: placement({ rotationDeg: 90 }) })],
    } as SurfaceContent;
    // 60 × 40 turned a quarter covers 40 wide × 60 tall
    expect(hitTest(content, bagFront, sizer, bagFront.toFlat(130, 140 + 25))).toBe("a");
    expect(hitTest(content, bagFront, sizer, bagFront.toFlat(130 + 25, 140))).toBeNull();
  });

  it("hits a wrapped element on the cup at its centre, rotated or not", () => {
    const wrapped = { ...imageEl("w", { widthMm: 80 }), wrap: true };
    for (const rotationDeg of [0, 90]) {
      const content = {
        background: { kind: "none" },
        elements: [{ ...wrapped, placement: placement({ u: 120, v: 60, rotationDeg }) }],
      } as SurfaceContent;
      expect(hitTest(content, cupBody, sizer, cupBody.toFlat(120, 60))).toBe("w");
      expect(hitTest(content, cupBody, sizer, cupBody.toFlat(120, 60 + 30))).toBeNull();
    }
  });

  it("hits elements on the cup through the unrolled geometry", () => {
    const content = {
      background: { kind: "none" },
      elements: [imageEl("a", { placement: placement({ u: 40, v: 50 }) })],
    } as SurfaceContent;
    expect(hitTest(content, cupBody, sizer, cupBody.toFlat(40, 50))).toBe("a");
    expect(hitTest(content, cupBody, sizer, cupBody.toFlat(120, 50))).toBeNull();
  });
});

describe("clamping", () => {
  it("clamps a placement inside the surface", () => {
    expect(clampPlacement({ u: -500, v: 9999, rotationDeg: 0, scale: 1 }, bagFront)).toMatchObject({
      u: 0,
      v: 280,
    });
  });

  it("keeps in-range placements and the other fields untouched", () => {
    const p = { u: 12, v: 34, rotationDeg: 15, scale: 2 };
    expect(clampPlacement(p, bagFront)).toEqual(p);
    const [uMax, vMin] = [cupBody.uRange[1], cupBody.vRange[0]];
    expect(clampPlacement({ ...p, u: 1e6, v: -1e6 }, cupBody)).toEqual({
      ...p,
      u: uMax,
      v: vMin,
    });
  });
});

describe("snapping", () => {
  it("snaps to a target within 2 mm", () => {
    expect(snapPlacement({ u: 129, v: 50 }, [{ u: 130 }])).toMatchObject({
      u: 130,
      snappedU: 130,
      snappedV: null,
    });
    expect(snapPlacement({ u: 125, v: 50 }, [{ u: 130 }]).snappedU).toBeNull();
  });

  it("snaps each axis independently to the nearest target and honours the threshold", () => {
    const targets = [{ u: 100 }, { u: 102 }, { v: 40 }, { u: 10, v: 90 }];
    expect(snapPlacement({ u: 101.2, v: 41.9 }, targets)).toEqual({
      u: 102,
      v: 40,
      snappedU: 102,
      snappedV: 40,
    });
    expect(snapPlacement({ u: 100, v: 43 }, targets, 3)).toMatchObject({ v: 40, snappedV: 40 });
    expect(snapPlacement({ u: 100, v: 43.5 }, targets, 3).snappedV).toBeNull();
  });

  it("offers the centre, the safe edges and the other elements as targets", () => {
    const targets = surfaceSnapTargets(bagFront, [placement({ u: 70, v: 90 })]);
    const us = targets.flatMap((t) => (t.u === undefined ? [] : [t.u])).sort((a, b) => a - b);
    const vs = targets.flatMap((t) => (t.v === undefined ? [] : [t.v])).sort((a, b) => a - b);
    // safe margin 5 mm on a 260 × 280 face
    expect(us.map((x) => Math.round(x * 1e6) / 1e6)).toEqual([5, 70, 130, 255]);
    expect(vs.map((x) => Math.round(x * 1e6) / 1e6)).toEqual([5, 90, 140, 275]);
  });

  it("finds the safe edges and visible centre of the cup, leaving the seam out", () => {
    const s = cupSector(cup12oz.model as CupModel);
    const targets = surfaceSnapTargets(cupBody, []);
    const us = targets.flatMap((t) => (t.u === undefined ? [] : [t.u]));
    const vs = targets.flatMap((t) => (t.v === undefined ? [] : [t.v]));
    // the safe band is inset 3 mm radially: v spans [vRange0 + 3, vRange1 − 3]
    expect(Math.min(...vs)).toBeCloseTo(cupBody.vRange[0] + 3, 6);
    expect(Math.max(...vs)).toBeCloseTo(cupBody.vRange[1] - 3, 6);
    // the printed front (without the seam flap) is centred on u = sweep · Rm / 2
    const centre = (s.sweepRad * s.midRadiusMm) / 2;
    expect(us.some((u) => Math.abs(u - centre) < 1e-6)).toBe(true);
    expect(Math.max(...us)).toBeLessThan(s.sweepRad * s.midRadiusMm);
  });
});
