import type { RectMm } from "../../engine";

/** Longest bitmap edge of the stage canvas. */
export const MAX_STAGE_EDGE_PX = 8192;
/**
 * Bitmap area of the stage canvas on a desktop: under iOS Safari's 16,777,216 px canvas limit, and
 * what one drag frame recomposes.
 */
export const STAGE_AREA_PX = 16_000_000;
/** The smaller budget of a touch device (phone or tablet: less memory, slower GPU uploads). */
export const COARSE_STAGE_AREA_PX = 8_000_000;

/** A phone or tablet: its stage bitmap gets the smaller area budget, its handles larger hit areas. */
export const hasCoarsePointer = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(pointer: coarse)").matches;

/**
 * Bitmap px per mm of the stage canvas: the CSS scale times the device pixel ratio, lowered so the
 * bitmap stays within `MAX_STAGE_EDGE_PX` on its longest edge and within the area budget. The
 * canvas's CSS size still follows the zoom; past the cap the view only gets softer.
 */
export function stagePxPerMm({
  cssPxPerMm,
  dpr,
  bounds,
  coarsePointer,
}: {
  cssPxPerMm: number;
  dpr: number;
  bounds: Pick<RectMm, "width" | "height">;
  coarsePointer: boolean;
}): number {
  const budget = coarsePointer ? COARSE_STAGE_AREA_PX : STAGE_AREA_PX;
  const byEdge = MAX_STAGE_EDGE_PX / Math.max(bounds.width, bounds.height);
  const byArea = Math.sqrt(budget / (bounds.width * bounds.height));
  return Math.min(cssPxPerMm * dpr, byEdge, byArea);
}
