/**
 * Fonts known to the editor: `fontCode → family`. `italic` is true only where the family ships an
 * italic face, so the layout never asks the browser to synthesise one. The registry is built by the
 * app (self-hosted fonts); the engine only reads it.
 */
export type FontRegistry = Readonly<
  Record<string, { label: string; family: string; italic: boolean }>
>;

/** Family used when a document names a font the registry no longer has. */
export const FALLBACK_FONT_FAMILY = "sans-serif";

/** Measured size of a piece of text, in px at the size inside the font string. */
export type TextMeasurer = (
  text: string,
  fontCss: string,
) => { width: number; ascent: number; descent: number };

const GENERIC_FAMILIES = new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy"]);

/** A single family name needs quotes; a list (what `next/font` returns) or a generic keyword does not. */
function cssFamily(family: string): string {
  return /["',]/.test(family) || GENERIC_FAMILIES.has(family) ? family : `"${family}"`;
}

/** Canvas/CSS `font` shorthand for a text style at `sizePx`, e.g. `italic 700 100px "Lobster"`. */
export function fontCss(
  style: { family: string; bold: boolean; italic: boolean },
  sizePx: number,
): string {
  return `${style.italic ? "italic " : ""}${style.bold ? 700 : 400} ${sizePx}px ${cssFamily(style.family)}`;
}

/** The CSS default (`medium`) when a font string carries no pixel size. */
const DEFAULT_FONT_PX = 16;

/** The pixel size inside a font string such as `700 100px "Lobster"`. */
export function fontSizePx(fontCss: string): number {
  const match = /(\d+(?:\.\d+)?)px/.exec(fontCss);
  return match?.[1] === undefined ? DEFAULT_FONT_PX : Number(match[1]);
}

/** Without a canvas the text is assumed to be this wide per code point (em), like a mid-width sans. */
const FALLBACK_WIDTH_EM = 0.55;
const FALLBACK_ASCENT_EM = 0.8;
const FALLBACK_DESCENT_EM = 0.2;

type MeasureContext = {
  font: string;
  measureText(text: string): TextMetrics;
};

/** An offscreen 2D context, or `null` where there is no canvas (node) or it is unimplemented (jsdom). */
function acquireContext(): MeasureContext | null {
  try {
    if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(1, 1).getContext("2d");
    if (typeof document !== "undefined") return document.createElement("canvas").getContext("2d");
  } catch {
    // A canvas that cannot be created is the same as no canvas: use the fallback widths.
  }
  return null;
}

/**
 * Text measurer backed by one offscreen 2D canvas, created on first use. Where no 2D context
 * exists it measures `0.55 em` per code point with an ascent of `0.8 em` and a descent of `0.2 em`,
 * so layout and hit-testing still work (approximately) under node and jsdom.
 */
export function createCanvasMeasurer(): TextMeasurer {
  // `null` is a resolved answer too ("no canvas here"): resolve once, not on every call.
  let context: MeasureContext | null = null;
  let resolved = false;

  return (text, css) => {
    if (!resolved) {
      context = acquireContext();
      resolved = true;
    }
    if (context === null) {
      const em = fontSizePx(css);
      return {
        width: [...text].length * FALLBACK_WIDTH_EM * em,
        ascent: FALLBACK_ASCENT_EM * em,
        descent: FALLBACK_DESCENT_EM * em,
      };
    }
    context.font = css;
    const m = context.measureText(text);
    const em = fontSizePx(css);
    return {
      width: m.width,
      ascent: m.fontBoundingBoxAscent ?? m.actualBoundingBoxAscent ?? FALLBACK_ASCENT_EM * em,
      descent: m.fontBoundingBoxDescent ?? m.actualBoundingBoxDescent ?? FALLBACK_DESCENT_EM * em,
    };
  };
}
