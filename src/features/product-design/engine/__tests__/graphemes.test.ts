// @vitest-environment node
import { describe, expect, it } from "vitest";

import { graphemes, shapedGraphemes } from "../render/graphemes";

const bySegmenter = (text: string) =>
  Array.from(
    new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text),
    (s) => s.segment,
  );

/** "ệ" typed as `e` and two combining marks, a skin-toned thumbs-up, a ZWJ family. */
const STACKED = String.fromCodePoint(0x65, 0x323, 0x302);
const TONED = String.fromCodePoint(0x1f44d, 0x1f3fd);
const FAMILY = String.fromCodePoint(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467);

describe("graphemes", () => {
  it.each([
    ["plain Latin", "Coffee & tea, 12oz!"],
    ["Latin-1 and Latin Extended", "Café Øre Łódź ǅ"],
    ["precomposed Vietnamese", "Thế giới cà phê sữa đá ỄỖẾ"],
    ["stacked marks", `Vi${STACKED}t`],
    ["emoji", `a ${TONED}${FAMILY} b`],
    // "a", a tab, "b", a soft hyphen, "c"
    ["a tab and a soft hyphen", String.fromCodePoint(0x61, 0x9, 0x62, 0xad, 0x63)],
    ["empty", ""],
  ])("splits %s as Intl.Segmenter does", (_name, text) => {
    expect(graphemes(text)).toEqual(bySegmenter(text));
  });

  it("splits by code point where the browser has no Intl.Segmenter", () => {
    const segmenter = Object.getOwnPropertyDescriptor(Intl, "Segmenter");
    expect(segmenter).toBeDefined();
    Reflect.deleteProperty(Intl, "Segmenter");
    try {
      expect(graphemes(`a${STACKED}`)).toEqual(["a", ...STACKED]);
      expect(graphemes("cà phê")).toEqual([..."cà phê"]);
    } finally {
      Object.defineProperty(Intl, "Segmenter", segmenter!);
    }
    expect(typeof Intl.Segmenter).toBe("function");
  });
});

describe("shapedGraphemes", () => {
  /** 3 per code point, less 0.6 for every "AV" pair: "AV" is narrower than "A" and "V". */
  const kerned = (text: string) => 3 * [...text].length - 0.6 * (text.split("AV").length - 1);

  it("starts each grapheme where the shaped line puts it, kerned to the one before", () => {
    const shaped = shapedGraphemes("AVA", kerned);
    expect(shaped.map((g) => g.text)).toEqual(["A", "V", "A"]);
    // measure(p + g) − measure(g): 0, then 5.4 − 3, then 8.4 − 3.
    [0, 2.4, 5.4].forEach((start, i) => expect(shaped[i]!.start).toBeCloseTo(start, 9));
    expect(shaped.map((g) => g.width)).toEqual([3, 3, 3]);
    const last = shaped.at(-1)!;
    expect(last.start + last.width).toBeCloseTo(kerned("AVA"), 9);
  });

  it("measures a grapheme of several code points as one", () => {
    const shaped = shapedGraphemes(`a${STACKED}`, kerned);
    expect(shaped.map((g) => [g.text, g.start, g.width])).toEqual([
      ["a", 0, 3],
      [STACKED, 3, 9],
    ]);
  });

  it("has no grapheme for an empty line", () => {
    expect(shapedGraphemes("", kerned)).toEqual([]);
  });
});
