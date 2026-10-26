import type { Ctx2D } from "../render/execute";
import { FALLBACK_FONT_FAMILY, fontCss } from "../render/fonts";
import type { SpecSummary } from "./summary";

/** The sheet's default page: ISO A4 portrait, in mm. */
export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;

export type SpecSheetOptions = {
  /** Text colour as a canvas colour string; the engine owns no colour of its own. */
  ink: string;
  /** Font family; defaults to the generic sans-serif the page falls back to. */
  family?: string;
  /** Page size in mm, when it is not A4 portrait. */
  widthMm?: number;
  heightMm?: number;
};

const MARGIN_MM = 15;
/** Font sizes in mm of em (≈ 20 pt title, 11 pt body); line height as a multiple of the size. */
const TITLE_SIZE_MM = 7;
const BODY_SIZE_MM = 3.9;
const LINE_HEIGHT = 1.45;
const TITLE_GAP_MM = 4;
const ELLIPSIS = "…";

type Measure = (text: string) => number;

/** One wrapped line of the sheet: what to draw, in which font, and the space left after it. */
type Row = { text: string; font: string; sizeMm: number; gapAfterMm: number };

/** Splits one over-wide word into the longest pieces that fit, by code point. */
function breakWord(word: string, maxWidth: number, width: Measure): string[] {
  const pieces: string[] = [];
  let piece = "";
  for (const char of word) {
    if (piece !== "" && width(piece + char) > maxWidth) {
      pieces.push(piece);
      piece = "";
    }
    piece += char;
  }
  return [...pieces, piece];
}

/** Greedy word wrap of `text` into lines no wider than `maxWidth`; a word wider than that is broken. */
function wrap(text: string, maxWidth: number, width: Measure): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const candidate = line === "" ? word : `${line} ${word}`;
    if (width(candidate) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line !== "") lines.push(line);
    const pieces = breakWord(word, maxWidth, width);
    lines.push(...pieces.slice(0, -1));
    line = pieces.at(-1) ?? "";
  }
  return [...lines, line];
}

/**
 * Draws the technical-spec sheet on a canvas `pxPerMm` pixels per mm (the page is A4 unless
 * `options` says otherwise): the title, then one wrapped paragraph per line, from the top-left
 * margin down. Text goes through canvas `fillText`, so Vietnamese renders with the page's own
 * fonts. What does not fit above the bottom margin is cut and marked with `…`. The caller owns the
 * background (the canvas is left transparent) and rasterises the result for `buildSheetPdf`.
 */
export function drawSpecSheet(
  ctx: Ctx2D,
  summary: SpecSummary,
  pxPerMm: number,
  options: SpecSheetOptions,
): void {
  const { ink, family = FALLBACK_FONT_FAMILY } = options;
  const px = (mm: number) => mm * pxPerMm;
  const maxWidth = px((options.widthMm ?? A4_WIDTH_MM) - 2 * MARGIN_MM);
  const bottom = px((options.heightMm ?? A4_HEIGHT_MM) - MARGIN_MM);

  const title = {
    font: fontCss({ family, bold: true, italic: false }, px(TITLE_SIZE_MM)),
    sizeMm: TITLE_SIZE_MM,
  };
  const body = {
    font: fontCss({ family, bold: false, italic: false }, px(BODY_SIZE_MM)),
    sizeMm: BODY_SIZE_MM,
  };

  // Measuring sets the font, so the caller's context is saved before anything is touched.
  ctx.save();
  const rowsOf = (style: typeof title, text: string, gapAfterMm: number): Row[] => {
    ctx.font = style.font;
    const lines = wrap(text, maxWidth, (candidate) => ctx.measureText(candidate).width);
    return lines.map((line, i) => ({
      text: line,
      ...style,
      gapAfterMm: i === lines.length - 1 ? gapAfterMm : 0,
    }));
  };
  const rows = [
    ...rowsOf(title, summary.title, TITLE_GAP_MM),
    ...summary.lines.flatMap((line) => rowsOf(body, line, 0)),
  ];

  // Place rows top-down until the bottom margin; the last row that fits is replaced by `…` when
  // more follow, so a cut-off sheet says so.
  const placed: { row: Row; y: number }[] = [];
  let y = px(MARGIN_MM);
  for (const row of rows) {
    const height = px(row.sizeMm * LINE_HEIGHT);
    if (y + height > bottom) break;
    placed.push({ row, y });
    y += height + px(row.gapAfterMm);
  }
  const last = placed.at(-1);
  if (last !== undefined && placed.length < rows.length) last.row = { ...last.row, text: ELLIPSIS };

  ctx.fillStyle = ink;
  ctx.textBaseline = "top";
  for (const { row, y: top } of placed) {
    ctx.font = row.font;
    ctx.fillText(row.text, px(MARGIN_MM), top);
  }
  ctx.restore();
}
