let segmenter: Intl.Segmenter | undefined;

/**
 * Whether every code point of `text` is a grapheme of its own: printable ASCII, Latin-1, Latin
 * Extended-A/B and the precomposed Latin of Vietnamese (U+1E00–U+1EFF). None of these extends or
 * joins a neighbour, so such text (nearly every line a customer types) skips the segmenter, which
 * costs microseconds per call on a path that lays text out many times a frame. All of them are in
 * the BMP, so UTF-16 units are code points here.
 */
function oneCodePointEach(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    const own =
      (unit >= 0x20 && unit <= 0x7e) ||
      (unit >= 0xa0 && unit <= 0x24f) ||
      (unit >= 0x1e00 && unit <= 0x1eff);
    if (!own) return false;
  }
  return true;
}

/**
 * The graphemes of `text`, the characters a reader sees: "ệ" typed as `e` and two combining marks,
 * a skin-toned emoji or a ZWJ family each stay one. Where the browser has no `Intl.Segmenter`
 * (checked on every call), its code points instead. Letter spacing goes between graphemes, as the
 * canvas's own `letterSpacing` and CSS put it.
 */
export function graphemes(text: string): string[] {
  if (oneCodePointEach(text) || typeof Intl.Segmenter !== "function") return Array.from(text);
  segmenter ??= new Intl.Segmenter(undefined, { granularity: "grapheme" });
  return Array.from(segmenter.segment(text), ({ segment }) => segment);
}

/** A grapheme of a shaped line: where it starts, before any letter spacing, and its own advance. */
export type ShapedGrapheme = { text: string; start: number; width: number };

/**
 * The graphemes of a line with where each starts in the shaped line, measured by `widthOf` (in
 * whatever unit it answers). A grapheme `g` after the prefix `p` starts at `widthOf(p + g) −
 * widthOf(g)`: the end of the line up to and including `g`, less `g`'s own advance, which keeps the
 * kern between `g` and the grapheme before it, so the last one ends at `widthOf(text)`. Letter
 * spacing is the caller's: one after each grapheme before `g`. The arc text and `paintText`'s own
 * placement both place glyphs by this, so they cannot drift apart.
 */
export function shapedGraphemes(text: string, widthOf: (text: string) => number): ShapedGrapheme[] {
  let prefix = "";
  return graphemes(text).map((segment) => {
    prefix += segment;
    const width = widthOf(segment);
    return { text: segment, start: widthOf(prefix) - width, width };
  });
}
