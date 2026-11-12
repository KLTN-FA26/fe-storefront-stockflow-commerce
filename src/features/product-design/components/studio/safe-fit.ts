/**
 * Fitting an element to a surface's safe area: the image and text tools place new elements with
 * it, and the bar's "Vừa vùng an toàn" fits an image with it.
 */
import {
  containmentPoints,
  elementOutline,
  surfaceSnapTargets,
  type DesignElement,
  type ImageElement,
  type Placement,
  type PrintSurface,
  type RectMm,
} from "../../engine";
import { SCALE_RANGE } from "./element-actions";

/** Halvings of a search: the answer is found to 2⁻³⁰ of the range searched. */
const FIT_STEPS = 30;

/** The safe area of a surface as the studio reads it: its centre and its extent in `u` and `v`. */
export type SafeBox = { u: number; v: number; width: number; height: number };

/**
 * `surfaceSnapTargets` lists the centre lines (across, down), then the safe edges (left, right,
 * top, bottom), measured along the surface's own centre lines, so a cup's seam flap is outside.
 */
export function safeBox(surface: PrintSurface): SafeBox {
  const targets = surfaceSnapTargets(surface, []);
  const at = (index: number, axis: "u" | "v") => targets[index]?.[axis] ?? 0;
  return {
    u: at(0, "u"),
    v: at(1, "v"),
    width: at(3, "u") - at(2, "u"),
    height: at(5, "v") - at(4, "v"),
  };
}

/** The local box of an image: its frame, centred on the origin. */
export const frameOf = (element: ImageElement): RectMm => ({
  x: -element.widthMm / 2,
  y: -element.heightMm / 2,
  width: element.widthMm,
  height: element.heightMm,
});

/** Whether the whole outline of `element`, put at `placement`, is inside the safe area. */
function insideSafe(
  element: DesignElement,
  box: RectMm,
  surface: PrintSurface,
  placement: Placement,
): boolean {
  const placed = { ...element, placement };
  const outline = elementOutline(placed, surface, box);
  return containmentPoints(placed, surface, outline).every((point) =>
    surface.contains(point, "safe"),
  );
}

/**
 * The centre nearest `target` (along the line from the safe area centre) at which the image,
 * upright at its own scale, lies wholly inside the safe area: `target` itself when it does, else
 * found by halving. The safe centre, where the image was shrunk to fit, is the fallback.
 */
export function pullIntoSafe(
  element: ImageElement,
  surface: PrintSurface,
  target: { u: number; v: number },
): Placement {
  const safe = safeBox(surface);
  const scale = element.placement.scale;
  const at = (t: number): Placement => ({
    u: safe.u + (target.u - safe.u) * t,
    v: safe.v + (target.v - safe.v) * t,
    rotationDeg: 0,
    scale,
  });
  const box = frameOf(element);
  if (insideSafe(element, box, surface, at(1))) return at(1);
  let [low, high] = [0, 1];
  for (let step = 0; step < FIT_STEPS; step++) {
    const middle = (low + high) / 2;
    if (insideSafe(element, box, surface, at(middle))) low = middle;
    else high = middle;
  }
  return at(low);
}

/**
 * The largest scale in `[low, high]` at which the element, whose local `box` is given, centred and
 * upright on the safe area, has its whole outline inside it: `high` when that fits, else found by
 * halving (`low` when nothing larger does). Halving, not arithmetic, because a cup's safe area is a
 * sector: a flat box as wide as the safe width at its middle sticks out at the bottom corners, and
 * one as tall as the safe height at the top ones; and the middle of its bottom edge leaves the
 * concave foot before its corners do, so the test reads `containmentPoints`, not only corners. A
 * text's box grows with its font size, so the scale found for a text is the factor to shrink its
 * size by.
 */
export function largestScaleInSafe(
  element: DesignElement,
  box: RectMm,
  surface: PrintSurface,
  low: number,
  high: number,
): number {
  const safe = safeBox(surface);
  const fits = (scale: number) =>
    insideSafe(element, box, surface, { u: safe.u, v: safe.v, rotationDeg: 0, scale });

  if (fits(high)) return high;
  for (let step = 0; step < FIT_STEPS; step++) {
    const middle = (low + high) / 2;
    if (fits(middle)) low = middle;
    else high = middle;
  }
  return low;
}

/**
 * The placement that fits the image in the safe area: centred, upright, and as large as keeps its
 * whole outline inside (found by halving, because a cup's safe area is a sector: a flat image as
 * wide as the safe width at its middle would stick out at the bottom corners). Within the scale
 * range the handles allow.
 */
export function fitPlacement(element: ImageElement, surface: PrintSurface): Placement {
  const safe = safeBox(surface);
  const high = Math.max(
    SCALE_RANGE.min,
    Math.min(SCALE_RANGE.max, safe.width / element.widthMm, safe.height / element.heightMm),
  );
  return {
    u: safe.u,
    v: safe.v,
    rotationDeg: 0,
    scale: largestScaleInSafe(element, frameOf(element), surface, SCALE_RANGE.min, high),
  };
}
