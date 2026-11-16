import type { PointMm, RectMm } from "../../engine";

/**
 * The flat mm point under a client position: `box` is the stage canvas's top-left on screen,
 * `bounds` the surface's flat bounds and `cssPxPerMm` the canvas scale. The one mapping from the
 * pointer to the sheet, used by the overlay's gestures and by a drop on the stage.
 */
export function flatPointAt(
  box: { left: number; top: number } | undefined,
  bounds: RectMm,
  cssPxPerMm: number,
  clientX: number,
  clientY: number,
): PointMm {
  return {
    x: bounds.x + (clientX - (box?.left ?? 0)) / cssPxPerMm,
    y: bounds.y + (clientY - (box?.top ?? 0)) / cssPxPerMm,
  };
}
