/** Millimetres in one inch; the single bridge between metric document space and DPI/pt. */
export const MM_PER_INCH = 25.4;

/** Points per inch (PDF/CSS point, also the unit for font size). */
const PT_PER_INCH = 72;

/** Pixels needed to cover `mm` at `dpi` dots per inch. */
export function mmToPx(mm: number, dpi: number): number {
  return (mm / MM_PER_INCH) * dpi;
}

/** Millimetres covered by `px` pixels at `dpi` dots per inch. */
export function pxToMm(px: number, dpi: number): number {
  return (px / dpi) * MM_PER_INCH;
}

/** Points (1/72 in) to millimetres: font sizes are authored in pt, laid out in mm. */
export function ptToMm(pt: number): number {
  return (pt * MM_PER_INCH) / PT_PER_INCH;
}

/** Millimetres to points (1/72 in): PDF page boxes are in pt. */
export function mmToPt(mm: number): number {
  return (mm * PT_PER_INCH) / MM_PER_INCH;
}

/**
 * Print resolution an image reaches once placed: `naturalPx / (placedMm / 25.4)`.
 * A `placedMm` of 0 yields `Infinity` (no physical extent to be sharp over).
 */
export function effectiveDpi(naturalPx: number, placedMm: number): number {
  return naturalPx / (placedMm / MM_PER_INCH);
}
