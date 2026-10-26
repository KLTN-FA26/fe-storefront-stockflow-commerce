/**
 * The most pixels one print canvas holds. iOS Safari refuses a canvas over 16,777,216 px (4096²);
 * a kraft bag face at 300 DPI is about 17.3 MP, so a page is drawn in horizontal bands of at most
 * this many pixels and stacked again in the PDF.
 */
export const MAX_BAND_PIXELS = 16_000_000;

/**
 * Rows a band draws past its own share, repeated by the band below it (N5): stacked edge to edge,
 * two images can leave a hairline where a viewer or a RIP rounds their edges; the next band is drawn
 * over the repeated row, so nothing shows between them.
 */
export const BAND_OVERLAP_PX = 1;

/**
 * Rows `[y0Px, y0Px + heightPx)` of a page raster, and `overlapPx` rows after them that the next
 * band covers again (none for the last band). The band's canvas holds `heightPx + overlapPx` rows.
 */
export type BandRows = { y0Px: number; heightPx: number; overlapPx: number };

/**
 * The bands a `widthPx × heightPx` raster is drawn in, top to bottom: as few as keep each canvas,
 * overlap included, within `maxPixels`, of one height but the last. A raster within the limit is
 * one band.
 */
export function printBands(
  widthPx: number,
  heightPx: number,
  maxPixels: number = MAX_BAND_PIXELS,
): BandRows[] {
  const height = Math.max(1, Math.ceil(heightPx));
  const width = Math.max(1, Math.ceil(widthPx));
  if (width * height <= maxPixels) return [{ y0Px: 0, heightPx: height, overlapPx: 0 }];
  const rowsPerBand = Math.max(1, Math.floor(maxPixels / width) - BAND_OVERLAP_PX);
  const count = Math.ceil(height / rowsPerBand);
  const bandHeight = Math.ceil(height / count);
  return Array.from({ length: count }, (_, i) => ({
    y0Px: i * bandHeight,
    heightPx: Math.min(bandHeight, height - i * bandHeight),
    overlapPx: i < count - 1 ? BAND_OVERLAP_PX : 0,
  }));
}
