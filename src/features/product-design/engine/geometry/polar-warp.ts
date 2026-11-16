import type { DesignElement } from "../document/schema";
import type { PrintSurface } from "../surfaces/types";
import { elementFlip, isWrapped } from "./element";
import { sectorBounds } from "./sector";
import type { PathCmd, PointMm, RectMm } from "./types";

/**
 * A wrapped element's closed-form polar warp (spec §4): local mm `(x, y)` of `box` map to the flat
 * sheet at `φ = angleRad + x' · scale / radiusMm`, `r = radiusMm − y' · scale`, about `apex`
 * (`x'`, `y'` are `x`, `y` with the flips applied). Plain data, so it can cross to a worker.
 */
export type PolarWarp = {
  apex: PointMm;
  /** `R_el`: the radius at the element's `v` (apex to `toFlat(u, v)`). */
  radiusMm: number;
  /** `φ_el`: the angle at the element's `u`, 0 = straight up (−y). */
  angleRad: number;
  scale: number;
  flipX: boolean;
  flipY: boolean;
  box: RectMm;
};

/** The warp of `el` over its local `box`; `undefined` unless the element `isWrapped` on `surface`. */
export function polarWarp(
  el: DesignElement,
  surface: PrintSurface,
  box: RectMm,
): PolarWarp | undefined {
  const apex = surface.apexMm;
  if (!apex || !isWrapped(el, surface)) return undefined;
  const { u, v, scale } = el.placement;
  const at = surface.toFlat(u, v);
  const flip = elementFlip(el);
  return {
    apex,
    radiusMm: Math.hypot(at.x - apex.x, at.y - apex.y),
    angleRad: at.uprightRad,
    scale,
    flipX: flip.x,
    flipY: flip.y,
    box,
  };
}

const polar = (w: PolarWarp, phi: number, r: number): PointMm => ({
  x: w.apex.x + r * Math.sin(phi),
  y: w.apex.y - r * Math.cos(phi),
});

const angleAt = (w: PolarWarp, x: number) =>
  w.angleRad + ((w.flipX ? -x : x) * w.scale) / w.radiusMm;
const radiusAt = (w: PolarWarp, y: number) => w.radiusMm - (w.flipY ? -y : y) * w.scale;

/** Local mm `(x, y)` of the element → flat mm. */
export function warpToFlat(w: PolarWarp, x: number, y: number): PointMm {
  return polar(w, angleAt(w, x), radiusAt(w, y));
}

/** Flat mm → local mm `(x, y)`; the result may lie outside `w.box`. */
export function warpToLocal(w: PolarWarp, px: number, py: number): PointMm {
  const dx = px - w.apex.x;
  const dy = w.apex.y - py;
  // Not `Math.hypot`: this runs for every remapped pixel, where hypot's overflow care took about a
  // third of the remap's time.
  const r = Math.sqrt(dx * dx + dy * dy);
  const x = ((Math.atan2(dx, dy) - w.angleRad) * w.radiusMm) / w.scale;
  const y = (w.radiusMm - r) / w.scale;
  return { x: w.flipX ? -x : x, y: w.flipY ? -y : y };
}

/** The largest `r / R_el` over the box: how much its most stretched column outgrows the source. */
export function warpStretch(w: PolarWarp): number {
  const { y, height } = w.box;
  return Math.max(1, radiusAt(w, y) / w.radiusMm, radiusAt(w, y + height) / w.radiusMm);
}

/** Flat bounding box of the warped box, an annular sector about the apex: exact. */
export function warpBounds(w: PolarWarp): RectMm {
  const { x, y, width, height } = w.box;
  return sectorBounds(
    w.apex,
    [radiusAt(w, y), radiusAt(w, y + height)],
    angleAt(w, x),
    angleAt(w, x + width),
  );
}

/**
 * The radii about `apex` that a region's outline spans, `[nearest, farthest]`: its points'
 * distances, and for an arc the nearest and farthest its circle comes (exact for an arc about the
 * apex, as every arc of a sector surface is).
 */
export function outlineRadii(path: PathCmd[], apex: PointMm): [number, number] {
  let [near, far] = [Infinity, 0];
  const span = (lo: number, hi: number) => {
    near = Math.min(near, lo);
    far = Math.max(far, hi);
  };
  for (const cmd of path) {
    if (cmd.c === "M" || cmd.c === "L") {
      const d = Math.hypot(cmd.x - apex.x, cmd.y - apex.y);
      span(d, d);
    } else if (cmd.c === "A") {
      const d = Math.hypot(cmd.cx - apex.x, cmd.cy - apex.y);
      span(Math.abs(d - cmd.r), d + cmd.r);
    }
  }
  return [near, far];
}
