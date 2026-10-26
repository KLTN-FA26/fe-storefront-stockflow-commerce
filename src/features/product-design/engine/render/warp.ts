import type { DesignElement } from "../document/schema";
import { elementFlip, wrapStripMatrix } from "../geometry/element";
import type { RectMm } from "../geometry/types";
import type { PrintSurface } from "../surfaces/types";
import type { Strip } from "./ops";

/** Strips a wrapped element is sliced into: enough that the facets are invisible at print size. */
export const WARP_STRIP_COUNT = 48;

/**
 * Slices an element's local `box` into `count` equal vertical strips and places each on the
 * surface (`wrapStripMatrix`), so the element follows the cup's circumference. Strip `i` covers
 * local x `[box.x + i·w/n, +w/n]` and is placed by its centre; a flipped image is mirrored by
 * the strips themselves (`wrapStripMatrix`), so the executor always draws the unflipped source.
 */
export function warpStrips(
  el: DesignElement,
  surface: PrintSurface,
  box: RectMm,
  count = WARP_STRIP_COUNT,
): Strip[] {
  const flip = elementFlip(el);
  const srcWidth = box.width / count;
  return Array.from({ length: count }, (_, i) => {
    const srcX = box.x + i * srcWidth;
    const xc = srcX + srcWidth / 2;
    return { srcX, srcWidth, matrix: wrapStripMatrix(el.placement, surface, xc, flip) };
  });
}
