/**
 * The most pixels one print canvas holds. iOS Safari refuses a canvas over 16,777,216 px (4096²);
 * a kraft bag face at 300 DPI is about 17.3 MP, so a page is drawn in horizontal bands of at most
 * this many pixels and stacked again in the PDF.
 */
export const MAX_BAND_PIXELS = 16_000_000;

/**
 * Rows `[y0Px, y0Px + heightPx)` of a page raster: one band, drawn on its own canvas. Bands meet
 * edge to edge and no row belongs to two of them. A repeated row would be painted twice in the PDF,
 * and the raster is transparent wherever there is no ink (no white under kraft), so a translucent
 * ink crossing the join would print darker there (50 % → 75 %). The joins fall on whole raster rows,
 * so a RIP at the raster's DPI or a multiple of it meets them exactly.
 */
export type BandRows = { y0Px: number; heightPx: number };

/**
 * The bands a `widthPx × heightPx` raster is drawn in, top to bottom: as few as keep each canvas
 * within `maxPixels`, of one height but the last. A raster within the limit is one band.
 */
export function printBands(
  widthPx: number,
  heightPx: number,
  maxPixels: number = MAX_BAND_PIXELS,
): BandRows[] {
  const height = Math.max(1, Math.ceil(heightPx));
  const width = Math.max(1, Math.ceil(widthPx));
  if (width * height <= maxPixels) return [{ y0Px: 0, heightPx: height }];
  const rowsPerBand = Math.max(1, Math.floor(maxPixels / width));
  const count = Math.ceil(height / rowsPerBand);
  const bandHeight = Math.ceil(height / count);
  return Array.from({ length: count }, (_, i) => ({
    y0Px: i * bandHeight,
    heightPx: Math.min(bandHeight, height - i * bandHeight),
  }));
}
