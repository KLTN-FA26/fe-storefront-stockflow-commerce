import type { Ctx2D } from "../render/execute";
import { FALLBACK_FONT_FAMILY, fontCss } from "../render/fonts";
import type { Guide } from "../surfaces/types";
import type { PrintAreaCode } from "../template/schema";

/**
 * The slug: a strip under the bleed box with what the press needs to tell one job from another and
 * the sizes to check it against. It is printed outside the bleed, so the die-cut leaves it with the
 * waste. Three lines of `LINE_STEP_MM`, with room under the last.
 */
export const SLUG_HEIGHT_MM = 14;

/** The name of the non-printing layer that carries the safe-area, seam and crease lines. */
export const GUIDES_LAYER_NAME = "Hướng dẫn kỹ thuật (không in)";

/** The guide kinds drawn on that layer (bleed and trim are the page's boxes and the cut line). */
export type PrintGuideKind = Exclude<Guide["kind"], "bleed" | "trim">;

const GUIDE_LEGEND: Record<PrintGuideKind, string> = {
  safe: "nét đứt = vùng an toàn",
  seam: "nét liền = mép dán",
  crease: "gạch chấm = nếp gấp",
};

/** What identifies the print job, as the slug writes it (the date already in Vietnam time). */
export type PrintJobInfo = {
  title: string;
  sku: string;
  version: number;
  exportedAt: string;
  checksum: string;
  /** The output condition the file is prepared for, e.g. "ISO Coated v2 (ECI)". */
  profileName: string;
};

export type SlugArea = {
  code: PrintAreaCode;
  name: string;
  /** 1-based page number of this area, and the page count. */
  page: number;
  pages: number;
  /** The finished piece: the bounds of the trim (the page's TrimBox), in mm. */
  trimMm: { width: number; height: number };
  bleedMm: number;
  /** The glue flap's width, where the area has one (a cup body). */
  seamMm?: number;
  guideKinds: PrintGuideKind[];
};

/** Millimetres as the slug prints them: one decimal, Vietnamese decimal comma ("279,7"). */
const mm = (value: number) => String(Math.round(value * 10) / 10).replace(".", ",");

/**
 * The slug's lines for one page: the job; the page, its sizes and print condition; then, where the
 * page has guides, how to see them (their layer is off, so it is never printed).
 */
export function printSlugLines(info: PrintJobInfo, area: SlugArea): string[] {
  const legend = [...new Set(area.guideKinds)].map((kind) => GUIDE_LEGEND[kind]);
  const { width, height } = area.trimMm;
  return [
    [
      info.title,
      `SKU ${info.sku}`,
      `Phiên bản ${info.version}`,
      `Xuất ${info.exportedAt}`,
      `SHA-256 ${info.checksum.slice(0, 16)}`,
    ].join(" · "),
    [
      `Vùng in ${area.name} (${area.code})`,
      `Trang ${area.page}/${area.pages}`,
      `Thành phẩm ${mm(width)} × ${mm(height)} mm`,
      `Lề tràn ${mm(area.bleedMm)} mm`,
      ...(area.seamMm ? [`Mép dán ${mm(area.seamMm)} mm`] : []),
      `PDF/X-4, ${info.profileName}`,
    ].join(" · "),
    ...(legend.length > 0
      ? [`Bật lớp “${GUIDES_LAYER_NAME}” trong trình xem PDF để xem: ${legend.join(", ")}`]
      : []),
  ];
}

export type SlugOptions = {
  /** Text colour as a canvas colour string; the engine owns no colour of its own. */
  ink: string;
  family?: string;
};

const MARGIN_MM = 3;
const TOP_MM = 1.6;
/** ≈ 6.8 pt: legible on the sheet, three lines fit the strip. */
const TEXT_SIZE_MM = 2.4;
/** A line that is too long is set smaller, down to this (≈ 4.5 pt), then cut with `…`. */
const MIN_TEXT_SIZE_MM = 1.6;
const LINE_STEP_MM = 3.6;
const ELLIPSIS = "…";

/**
 * Draws the slug lines on a canvas `widthMm × SLUG_HEIGHT_MM` at `pxPerMm`, one per row from the
 * top-left margin. A line wider than the strip is set smaller; past the minimum size it is cut and
 * ends in `…`. The canvas is left transparent around the text.
 */
export function drawSlug(
  ctx: Ctx2D,
  lines: readonly string[],
  widthMm: number,
  pxPerMm: number,
  options: SlugOptions,
): void {
  const { ink, family = FALLBACK_FONT_FAMILY } = options;
  const px = (mm: number) => mm * pxPerMm;
  const maxWidth = px(widthMm - 2 * MARGIN_MM);
  const fontAt = (sizeMm: number) => fontCss({ family, bold: false, italic: false }, px(sizeMm));

  ctx.save();
  ctx.fillStyle = ink;
  ctx.textBaseline = "top";
  for (const [i, line] of lines.entries()) {
    ctx.font = fontAt(TEXT_SIZE_MM);
    const natural = ctx.measureText(line).width;
    const sizeMm =
      natural > maxWidth
        ? Math.max(MIN_TEXT_SIZE_MM, (TEXT_SIZE_MM * maxWidth) / natural)
        : TEXT_SIZE_MM;
    ctx.font = fontAt(sizeMm);
    let text = line;
    if (ctx.measureText(text).width > maxWidth) {
      const chars = [...line];
      while (chars.length > 0 && ctx.measureText(chars.join("") + ELLIPSIS).width > maxWidth) {
        chars.pop();
      }
      text = chars.join("") + ELLIPSIS;
    }
    ctx.fillText(text, px(MARGIN_MM), px(TOP_MM + i * LINE_STEP_MM));
  }
  ctx.restore();
}
