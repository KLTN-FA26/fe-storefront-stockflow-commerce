import type { RectMm } from "../geometry/types";

/** Longest edge of any layer the executor allocates, in px. */
export const MAX_LAYER_EDGE_PX = 8192;

/** The layer's size in px for `mm` at `pxPerMm`, at least 1 and at most `MAX_LAYER_EDGE_PX`. */
export function layerPx(mm: number, pxPerMm: number): number {
  return Math.min(MAX_LAYER_EDGE_PX, Math.max(1, Math.ceil(mm * pxPerMm)));
}

/**
 * px per local mm to rasterise an element at: the output resolution times the element's own scale
 * (a logo scaled 2× prints at full DPI, not upscaled), reduced if that would make a layer longer
 * than `MAX_LAYER_EDGE_PX`. Rounded so the float noise of a matrix's rotation does not make two
 * placements of one element look like two resolutions. `undefined` for a degenerate scale.
 */
export function rasterScale(
  pxPerMm: number,
  elementScale: number,
  frame: { width: number; height: number },
): number | undefined {
  const wanted = Math.round(pxPerMm * elementScale * 1e6) / 1e6;
  if (!(wanted > 0) || !Number.isFinite(wanted)) return undefined;
  return Math.min(wanted, MAX_LAYER_EDGE_PX / Math.max(frame.width, frame.height));
}

/** Whole pixels `[x, x + width) × [y, y + height)` of a grid whose origin is flat (0, 0). */
export type PxRect = { x: number; y: number; width: number; height: number };
/** A `PxRect` on the grid of `k` px per mm. */
export type Grid = PxRect & { k: number };

/** `rect` (flat mm) snapped outward to whole pixels at `k` px per mm. */
function snapOut(rect: RectMm, k: number): PxRect {
  const x = Math.floor(rect.x * k);
  const y = Math.floor(rect.y * k);
  return {
    x,
    y,
    width: Math.ceil((rect.x + rect.width) * k) - x,
    height: Math.ceil((rect.y + rect.height) * k) - y,
  };
}

function overlap(a: PxRect, b: PxRect): PxRect | undefined {
  const [x, y] = [Math.max(a.x, b.x), Math.max(a.y, b.y)];
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : undefined;
}

/**
 * `bounds` (flat mm) snapped outward to whole pixels at `pxPerMm`, cut to `target` when there is
 * one; `undefined` when nothing is left. A rectangle longer than `maxEdgePx` or larger than
 * `maxAreaPx` is laid on a proportionally coarser grid that still covers it: drawn softer rather
 * than not at all.
 */
export function fitGrid(
  bounds: RectMm,
  pxPerMm: number,
  {
    target,
    maxEdgePx = MAX_LAYER_EDGE_PX,
    maxAreaPx = Infinity,
  }: { target?: PxRect | undefined; maxEdgePx?: number; maxAreaPx?: number } = {},
): Grid | undefined {
  const snapped = snapOut(bounds, pxPerMm);
  const rect = target === undefined ? snapped : overlap(snapped, target);
  if (rect === undefined) return undefined;
  const { width: w, height: h } = rect;
  if (Math.max(w, h) <= maxEdgePx && w * h <= maxAreaPx) return { ...rect, k: pxPerMm };
  // Snapping again adds up to a pixel on each side: the scale f keeps f·w + 2 within the edge and
  // (f·w + 2)(f·h + 2) within the area.
  const byEdge = (maxEdgePx - 2) / Math.max(w, h);
  const byArea = (Math.sqrt((w + h) ** 2 + w * h * (maxAreaPx - 4)) - (w + h)) / (w * h);
  const k = pxPerMm * Math.min(byEdge, byArea);
  const mm = (px: number) => px / pxPerMm;
  return { ...snapOut({ x: mm(rect.x), y: mm(rect.y), width: mm(w), height: mm(h) }, k), k };
}
