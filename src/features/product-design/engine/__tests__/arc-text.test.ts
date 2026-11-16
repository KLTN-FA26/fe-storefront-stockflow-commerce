// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { TextElement } from "../document/schema";
import { applyToPoint, type Mat2D } from "../geometry/affine";
import { wrapColumnMatrix } from "../geometry/element";
import { arcGlyphs, type ArcGlyph } from "../render/arc-text";
import { fontCss, fontSizePx, type TextMeasurer } from "../render/fonts";
import { layoutText } from "../render/text-layout";
import { cupSector } from "../surfaces";
import type { CupModel } from "../template/schema";
import { cup12oz, cupBody, fakeMeasure, FONTS, textEl } from "./fixtures";

const placement = { u: 140, v: 60, rotationDeg: 0, scale: 1.5 };

/** A wrapped text on the cup, its layout and its glyphs, measured by `measure`. */
function glyphsOf(overrides: Partial<TextElement>, measure: TextMeasurer = fakeMeasure) {
  const el = textEl("t", { wrap: true, placement, ...overrides });
  const layout = layoutText(el, FONTS, measure);
  return { el, layout, glyphs: arcGlyphs(el, layout, cupBody, FONTS, measure) };
}

/** `fakeMeasure`, less 0.1 em for every "AV" pair: "AV" is narrower than "A" and "V" side by side. */
const kerningMeasure: TextMeasurer = (text, css) => {
  const plain = fakeMeasure(text, css);
  const pairs = text.split("AV").length - 1;
  return { ...plain, width: plain.width - pairs * 0.1 * fontSizePx(css) };
};

const expectSameMatrix = (actual: Mat2D, expected: Mat2D) =>
  actual.forEach((value, i) => expect(value).toBeCloseTo(expected[i]!, 9));

/** Where the last glyph of `glyphs` ends, and where its line's laid-out box ends. */
const lineEnds = (glyphs: ArcGlyph[], line: { xMm: number; widthMm: number }) => {
  const last = glyphs.at(-1)!;
  return { glyph: last.xMm + last.widthMm, box: line.xMm + line.widthMm };
};

/** "ệ" typed as `e` and two combining marks (not the precomposed U+1EC7): 3 code points. */
const E_DOT_CIRCUMFLEX = String.fromCodePoint(0x65, 0x323, 0x302);
/** A thumbs-up with a skin tone: 2 code points. */
const THUMBS_UP_TONED = String.fromCodePoint(0x1f44d, 0x1f3fd);
/** Man, woman and girl joined by zero-width joiners: 5 code points. */
const FAMILY = String.fromCodePoint(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467);

/** `fakeMeasure`, recording every text it is asked to measure. */
function countingMeasure() {
  const asked: string[] = [];
  const measure: TextMeasurer = (text, css) => {
    asked.push(text);
    return fakeMeasure(text, css);
  };
  return { asked, measure };
}

describe("arcGlyphs", () => {
  it("sums each glyph's x as layoutText sums its line, so the last glyph ends where the line does", () => {
    const { layout, glyphs } = glyphsOf({ content: "Xin chào", letterSpacingEm: 0.1 });
    const line = layout.lines[0]!;
    // fakeMeasure is additive: 0.5 em per code point.
    const advance = 0.5 * layout.fontSizeMm;
    expect(glyphs.map((g) => g.text)).toEqual([..."Xin chào"]);
    glyphs.forEach((g, i) => {
      expect(g.xMm).toBeCloseTo(line.xMm + i * (advance + layout.letterSpacingMm), 9);
    });
    const ends = lineEnds(glyphs, line);
    expect(ends.glyph).toBeCloseTo(ends.box, 9);
  });

  it("keeps kerning: a glyph starts where it sits in the shaped line, kerned to the one before", () => {
    const css = fontCss({ family: "Be Vietnam Pro", bold: false, italic: false }, 100);
    expect(kerningMeasure("AV", css).width).toBeLessThan(
      kerningMeasure("A", css).width + kerningMeasure("V", css).width,
    );
    const { layout, glyphs } = glyphsOf({ content: "AVA" }, kerningMeasure);
    const line = layout.lines[0]!;
    const em = layout.fontSizeMm;
    const starts = glyphs.map((g) => g.xMm - line.xMm);
    // "V" kerned towards "A": measure("AV") − measure("V") = 0.4 em; the last "A" follows at 0.9 em.
    [0, 0.4 * em, 0.9 * em].forEach((x, i) => expect(starts[i]).toBeCloseTo(x, 9));
    const ends = lineEnds(glyphs, line);
    expect(ends.glyph).toBeCloseTo(ends.box, 9);
  });

  it("ends a line whose last pair kerns exactly at its box", () => {
    const { layout, glyphs } = glyphsOf({ content: "AV", align: "right" }, kerningMeasure);
    const line = layout.lines[0]!;
    expect(glyphs[1]!.xMm - line.xMm).toBeCloseTo(0.4 * layout.fontSizeMm, 9);
    const ends = lineEnds(glyphs, line);
    expect(ends.glyph).toBeCloseTo(ends.box, 9);
  });

  it("keeps a grapheme together as one glyph: combining marks, a skin tone, a ZWJ family", () => {
    expect([E_DOT_CIRCUMFLEX, THUMBS_UP_TONED, FAMILY].map((g) => [...g].length)).toEqual([
      3, 2, 5,
    ]);
    const { glyphs } = glyphsOf({ content: `${E_DOT_CIRCUMFLEX} ${THUMBS_UP_TONED}${FAMILY}` });
    expect(glyphs.map((g) => g.text)).toEqual([E_DOT_CIRCUMFLEX, " ", THUMBS_UP_TONED, FAMILY]);
  });

  it("spaces graphemes, not code points, as layoutText does", () => {
    const content = `Vi${E_DOT_CIRCUMFLEX}t`;
    const { layout, glyphs } = glyphsOf({ content, letterSpacingEm: 0.1 });
    const line = layout.lines[0]!;
    const em = layout.fontSizeMm;
    expect(glyphs.map((g) => g.text)).toEqual(["V", "i", E_DOT_CIRCUMFLEX, "t"]);
    // "Vi" + "ệ" measure 5 code points (2.5 em) before "t", then one spacing after each grapheme.
    expect(glyphs[3]!.xMm).toBeCloseTo(line.xMm + 2.5 * em + 3 * layout.letterSpacingMm, 9);
    const ends = lineEnds(glyphs, line);
    expect(ends.glyph).toBeCloseTo(ends.box, 9);
  });

  it.each([
    ["a stacked mark", E_DOT_CIRCUMFLEX],
    ["a skin-toned emoji", THUMBS_UP_TONED],
    ["a ZWJ family", FAMILY],
  ])("ends a spaced line ending in %s exactly at its box", (_name, last) => {
    const { layout, glyphs } = glyphsOf({ content: `a${last}`, letterSpacingEm: 0.1 });
    expect(glyphs.map((g) => g.text)).toEqual(["a", last]);
    const ends = lineEnds(glyphs, layout.lines[0]!);
    expect(ends.glyph).toBeCloseTo(ends.box, 9);
  });

  it("yields no glyph for an empty text", () => {
    expect(glyphsOf({ content: "" }).glyphs).toEqual([]);
  });

  it("sets each line on its own baseline from its own x, and skips an empty line", () => {
    const { layout, glyphs } = glyphsOf({ content: "ab\n\ncd", align: "right" });
    const [first, , third] = layout.lines;
    expect(glyphs.map((g) => [g.text, g.baselineMm])).toEqual([
      ["a", first!.baselineMm],
      ["b", first!.baselineMm],
      ["c", third!.baselineMm],
      ["d", third!.baselineMm],
    ]);
    expect(first!.baselineMm).not.toBe(third!.baselineMm);
    expect(glyphs[0]!.xMm).toBe(first!.xMm);
    expect(glyphs[2]!.xMm).toBe(third!.xMm);
  });

  it("places every glyph by wrapColumnMatrix at its middle, on the radius of its baseline", () => {
    const { el, layout, glyphs } = glyphsOf({ content: "Xin chào\nThế giới" });
    const { outerRadiusMm } = cupSector(cup12oz.model as CupModel);
    const apex = cupBody.toFlat(placement.u, outerRadiusMm);
    const advance = 0.5 * layout.fontSizeMm;
    expect(glyphs).toHaveLength(16);
    for (const g of glyphs) {
      expect(g.widthMm).toBeCloseTo(advance, 9);
      const middle = g.xMm + advance / 2;
      expectSameMatrix(g.matrix, wrapColumnMatrix(el.placement, cupBody, middle));
      const centre = applyToPoint(g.matrix, { x: middle, y: g.baselineMm });
      expect(Math.hypot(centre.x - apex.x, centre.y - apex.y)).toBeCloseTo(
        outerRadiusMm - placement.v - g.baselineMm * placement.scale,
        6,
      );
    }
    // Each glyph is turned to its own upright, so a line fans out along the arc.
    const turn = (m: Mat2D) => Math.atan2(m[1], m[0]);
    expect(turn(glyphs[0]!.matrix)).toBeLessThan(turn(glyphs[7]!.matrix));
  });

  describe("measuring", () => {
    const wrapped = (content: string, over: Partial<TextElement> = {}) =>
      textEl("t", { wrap: true, placement, content, ...over });

    it("measures a line once: placed again (moved), only its reference width and matrices are new", () => {
      const { asked, measure } = countingMeasure();
      const el = wrapped("Xin chào\nThế giới");
      const layout = layoutText(el, FONTS, measure);
      asked.length = 0;
      const first = arcGlyphs(el, layout, cupBody, FONTS, measure);
      expect(asked.length).toBeGreaterThan(2);

      asked.length = 0;
      const moved = { ...el, placement: { ...placement, u: 170 } };
      const again = arcGlyphs(moved, layout, cupBody, FONTS, measure);
      // One measure per line at the reference size: the key the kept measures are found by.
      expect(asked).toEqual(["Xin chào", "Thế giới"]);
      const local = ({ matrix: _matrix, ...rest }: ArcGlyph) => rest;
      expect(again.map(local)).toEqual(first.map(local));
      again.forEach((g) => {
        const middle = g.xMm + g.widthMm / 2;
        expectSameMatrix(g.matrix, wrapColumnMatrix(moved.placement, cupBody, middle));
      });
      expect(again[0]!.matrix).not.toEqual(first[0]!.matrix);
    });

    it("re-uses a line's measures when only its size or letter spacing changes", () => {
      const { asked, measure } = countingMeasure();
      const place = (el: TextElement) => {
        const layout = layoutText(el, FONTS, measure);
        asked.length = 0;
        return { layout, glyphs: arcGlyphs(el, layout, cupBody, FONTS, measure) };
      };
      place(wrapped("Xin chào", { sizePt: 24 }));
      const { layout, glyphs } = place(wrapped("Xin chào", { sizePt: 36, letterSpacingEm: 0.2 }));
      expect(asked).toEqual(["Xin chào"]);
      const ends = lineEnds(glyphs, layout.lines[0]!);
      expect(ends.glyph).toBeCloseTo(ends.box, 9);
    });

    it("measures again once the line's width changes, as when its face finishes loading", () => {
      let loaded = false;
      // Before the face loads the browser measures the fallback face: 20% narrower here.
      const measure: TextMeasurer = (text, css) => {
        const m = fakeMeasure(text, css);
        return loaded ? m : { ...m, width: m.width * 0.8 };
      };
      const el = wrapped("Ly");
      const before = arcGlyphs(el, layoutText(el, FONTS, measure), cupBody, FONTS, measure);
      loaded = true;
      const layout = layoutText(el, FONTS, measure);
      const after = arcGlyphs(el, layout, cupBody, FONTS, measure);
      expect(after[1]!.widthMm).toBeGreaterThan(before[1]!.widthMm);
      const ends = lineEnds(after, layout.lines[0]!);
      expect(ends.glyph).toBeCloseTo(ends.box, 9);
    });

    it("keeps the last 256 lines per measurer, least recently used out first", () => {
      const { asked, measure } = countingMeasure();
      /** How many measures placing `content` takes: 1 (its reference width) when it is kept. */
      const place = (content: string) => {
        const el = wrapped(content);
        const layout = layoutText(el, FONTS, measure);
        asked.length = 0;
        arcGlyphs(el, layout, cupBody, FONTS, measure);
        return asked.length;
      };
      for (let i = 0; i < 256; i++) place(`line ${i}`);
      expect(place("line 0")).toBe(1); // a hit: "line 0" is now the most recently used
      expect(place("line 256")).toBeGreaterThan(1);
      expect(place("line 0")).toBe(1);
      expect(place("line 1")).toBeGreaterThan(1); // the least recently used went out
    });

    it("splits by code point where the browser has no Intl.Segmenter", () => {
      const segmenter = Object.getOwnPropertyDescriptor(Intl, "Segmenter");
      expect(segmenter).toBeDefined();
      Reflect.deleteProperty(Intl, "Segmenter");
      try {
        // A measurer of its own, so no line measured with the segmenter is reused.
        const { measure } = countingMeasure();
        const el = wrapped(`Vi${E_DOT_CIRCUMFLEX}t`, { letterSpacingEm: 0.1 });
        const layout = layoutText(el, FONTS, measure);
        const glyphs = arcGlyphs(el, layout, cupBody, FONTS, measure);
        expect(glyphs.map((g) => g.text)).toEqual([..."Vi", ...E_DOT_CIRCUMFLEX, "t"]);
        const ends = lineEnds(glyphs, layout.lines[0]!);
        expect(ends.glyph).toBeCloseTo(ends.box, 9);
      } finally {
        Object.defineProperty(Intl, "Segmenter", segmenter!);
      }
      expect(typeof Intl.Segmenter).toBe("function");
    });
  });
});
