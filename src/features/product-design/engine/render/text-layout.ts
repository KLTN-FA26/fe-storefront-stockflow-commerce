import type { TextElement } from "../document/schema";
import { ptToMm } from "../geometry/units";
import { FALLBACK_FONT_FAMILY, fontCss, type FontRegistry, type TextMeasurer } from "./fonts";
import { graphemes } from "./graphemes";

/** Text is measured at this size and scaled, so the metrics do not depend on the placed size. */
export const REFERENCE_SIZE_PX = 100;

export type TextLine = {
  text: string;
  /** Left edge of the line in the element's local frame (the box is centred on the origin). */
  xMm: number;
  widthMm: number;
  /** Baseline offset from the origin (y down). */
  baselineMm: number;
};

/** Text laid out in local mm: every line, the box that holds them and the style to draw them in. */
export type TextLayout = {
  lines: TextLine[];
  widthMm: number;
  heightMm: number;
  fontSizeMm: number;
  /** Extra advance after every grapheme of a line, so the renderer can reproduce the measured widths. */
  letterSpacingMm: number;
  /** How far the font reaches above a baseline (the tallest line's, as measured). */
  ascentMm: number;
  /** How far the font reaches below a baseline (the deepest line's, as measured). */
  descentMm: number;
  family: string;
  bold: boolean;
  italic: boolean;
};

/** The face `el` is set in: its registry family (or the fallback), italic only where that family has one. */
function textFace(el: TextElement, fonts: FontRegistry) {
  const font = fonts[el.fontCode];
  return {
    family: font?.family ?? FALLBACK_FONT_FAMILY,
    bold: el.bold,
    italic: el.italic && (font?.italic ?? false),
  };
}

/** The CSS font `el` is measured in: its face at `REFERENCE_SIZE_PX`. */
export function referenceFont(el: TextElement, fonts: FontRegistry): string {
  return fontCss(textFace(el, fonts), REFERENCE_SIZE_PX);
}

/**
 * Lays out a text element in millimetres around the origin. Lines split on `\n` only (no wrapping).
 * Each line is measured at a 100 px reference size and scaled to `ptToMm(sizePt)`; letter spacing
 * adds `(graphemes − 1) × letterSpacingEm × fontSizeMm`, between the characters a reader sees, as
 * the canvas's own `letterSpacing` spaces them (a letter and its combining marks are one). Each
 * line owns a box `lineHeight × fontSizeMm` tall with its glyphs centred in it (CSS line-box
 * model), so an overlay `<textarea>` with the same font and line height sits exactly on the
 * rendered text.
 */
export function layoutText(
  el: TextElement,
  fonts: FontRegistry,
  measure: TextMeasurer,
): TextLayout {
  const { family, bold, italic } = textFace(el, fonts);
  const css = referenceFont(el, fonts);

  const fontSizeMm = ptToMm(el.sizePt);
  const mmPerPx = fontSizeMm / REFERENCE_SIZE_PX;
  const pitchMm = el.lineHeight * fontSizeMm;

  const measured = el.content.split("\n").map((text) => {
    const m = measure(text, css);
    const gaps = Math.max(0, graphemes(text).length - 1);
    return {
      text,
      widthMm: Math.max(0, m.width * mmPerPx + gaps * el.letterSpacingEm * fontSizeMm),
      ascentMm: m.ascent * mmPerPx,
      descentMm: m.descent * mmPerPx,
    };
  });

  // A reduce, not `Math.max(...lines)`: spreading a text of very many lines overflows the stack.
  const widest = (pick: (line: (typeof measured)[number]) => number) =>
    measured.reduce((most, line) => Math.max(most, pick(line)), -Infinity);
  const widthMm = widest((l) => l.widthMm);
  const heightMm = measured.length * pitchMm;
  const ascentMm = widest((l) => l.ascentMm);
  const descentMm = widest((l) => l.descentMm);
  const halfLeadingMm = (pitchMm - (ascentMm + descentMm)) / 2;

  const lines = measured.map(({ text, widthMm: lineMm }, i): TextLine => {
    const xMm =
      el.align === "left"
        ? -widthMm / 2
        : el.align === "right"
          ? widthMm / 2 - lineMm
          : -lineMm / 2;
    return {
      text,
      xMm,
      widthMm: lineMm,
      baselineMm: -heightMm / 2 + i * pitchMm + halfLeadingMm + ascentMm,
    };
  });

  return {
    lines,
    widthMm,
    heightMm,
    fontSizeMm,
    letterSpacingMm: el.letterSpacingEm * fontSizeMm,
    ascentMm,
    descentMm,
    family,
    bold,
    italic,
  };
}
