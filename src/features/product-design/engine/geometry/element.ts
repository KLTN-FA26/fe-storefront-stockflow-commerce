import type { DesignElement, Placement, SurfaceContent } from "../document/schema";
import type { FontRegistry, TextMeasurer } from "../render/fonts";
import { layoutText } from "../render/text-layout";
import type { PrintSurface } from "../surfaces/types";
import { applyToPoint, multiply, rotate, scale, translate, type Mat2D } from "./affine";
import { alongEdges, boundsOf, pointInPolygon } from "./polygon";
import type { PointMm, RectMm } from "./types";

/** An element's box in its own local frame (mm, before `scale`), as the sizer measures it. */
export type ElementSizer = (el: DesignElement) => RectMm;

/** Points sampled along each of the top and bottom edges of a wrapped element's outline. */
const WRAP_OUTLINE_SAMPLES = 16;

/**
 * How far a brush stroke of `sizeMm` can reach from its points: perfect-freehand's radius is
 * `size × (0.25 + 0.5 × pressure)`, at most `0.75 × size` at full pen pressure (a plain half size
 * would flat-cut the ink at the layer edge), plus a hair for the rounded cap. That bound holds for
 * taps and strokes under 3 mm only because `strokePolygon` feeds perfect-freehand tenths of a
 * millimetre; in millimetres its noise threshold and a tap's second point overshoot it.
 */
const strokeReachMm = (sizeMm: number) => 0.75 * sizeMm + 0.01;

/**
 * Local box of every element kind: images and text are centred on the origin, a drawing is the
 * bounds of its stroke points grown by the brush's reach (so all of the ink is inside, and the
 * drawing layer, selection handles, hit-test and preflight agree on its extent).
 */
export function createSizer(fonts: FontRegistry, measure: TextMeasurer): ElementSizer {
  return (el) => {
    switch (el.type) {
      case "image":
        return { x: -el.widthMm / 2, y: -el.heightMm / 2, width: el.widthMm, height: el.heightMm };
      case "text": {
        const { widthMm, heightMm } = layoutText(el, fonts, measure);
        return { x: -widthMm / 2, y: -heightMm / 2, width: widthMm, height: heightMm };
      }
      case "drawing": {
        const corners = el.strokes.flatMap((stroke) => {
          const r = strokeReachMm(stroke.sizeMm);
          return stroke.points.flatMap(([x, y]) => [
            { x: x - r, y: y - r },
            { x: x + r, y: y + r },
          ]);
        });
        return boundsOf(corners);
      }
    }
  };
}

/** Mirroring of an element about its own local axes. */
export type Flip = { x: boolean; y: boolean };

const NO_FLIP: Flip = { x: false, y: false };

/** Only images flip; text and drawings are never mirrored. */
export function elementFlip(el: DesignElement): Flip {
  return el.type === "image" ? { x: el.flipX, y: el.flipY } : NO_FLIP;
}

/**
 * Element-local → flat matrix: `translate(toFlat(u, v)) · rotate(upright + rotationDeg) ·
 * scale(scale · flip)`. `upright` is the surface's local "up" at the placement, so an element on
 * the cup stays upright on the product. Only images flip.
 */
export function elementMatrix(el: DesignElement, surface: PrintSurface): Mat2D {
  const { u, v, rotationDeg, scale: s } = el.placement;
  const at = surface.toFlat(u, v);
  const flip = elementFlip(el);
  return multiply(
    translate(at.x, at.y),
    multiply(
      rotate(at.uprightRad + (rotationDeg * Math.PI) / 180),
      scale(s * (flip.x ? -1 : 1), s * (flip.y ? -1 : 1)),
    ),
  );
}

/**
 * How many `u` mm one flat mm along the row of constant `v` is worth: `Rm / R_el` on a cup, 1 on a
 * rect surface. Read off `toFlat` (chord and angle of a 1 mm step in `u`) so the surface stays the
 * only owner of its unrolling.
 */
function uPerFlatMm(surface: PrintSurface, u: number, v: number): number {
  const du = 1;
  const a = surface.toFlat(u, v);
  const b = surface.toFlat(u + du, v);
  const dPhi = b.uprightRad - a.uprightRad;
  const chord = Math.hypot(b.x - a.x, b.y - a.y);
  // dPhi = du / Rm and chord = 2 · R_el · sin(dPhi / 2), so Rm / R_el = du · 2 sin(dPhi / 2) / (dPhi · chord)
  if (dPhi === 0 || chord === 0) return 1;
  return (du * 2 * Math.sin(dPhi / 2)) / (dPhi * chord);
}

/**
 * Surface `u` of the point `localX` mm (before `scale`) to the right of a wrapped element's centre.
 * On a cup the element follows the circumference: `u` advances by `localX · scale · Rm / R_el` with
 * `R_el = Rt − v` the radius at the element's `v` (Rm = mid radius), so `localX` mm of the element
 * cover the same arc length at every radius. On rect surfaces it is `u + localX · scale`.
 *
 * The compositor's `warpStrips` and `elementOutline` both place wrapped elements with this.
 */
export function arcOffsetU(surface: PrintSurface, placement: Placement, localX: number): number {
  const { u, v, scale: s } = placement;
  return u + localX * s * uPerFlatMm(surface, u, v);
}

/**
 * Whether `el` is warped to the surface: `wrap` applies to text and images only (spec §4.3, "cup
 * text/image"), and takes effect only on a sector (cup) surface. A drawing, or an element on a rect
 * surface (bag face, cylinder cup), is rigid like any other: it keeps its normal matrix and
 * outline, rotation included. The compositor uses this same rule.
 */
export function isWrapped(el: DesignElement, surface: PrintSurface): boolean {
  return el.type !== "drawing" && el.wrap === true && surface.kind === "sector";
}

/**
 * Local → flat matrix of the strip of a wrapped element whose source column is centred at local
 * `xc`: `translate(toFlat(u_i, v)) · rotate(upright_i) · scale(scale · flip) · translate(−xc, 0)`
 * with `u_i = arcOffsetU(…, ±xc)`. The strip centre `matrix · (xc, 0)` is `toFlat(u_i, v)`, so every
 * strip centre sits on the element's radius and each strip is turned to its own upright; together
 * the strips follow the arc.
 *
 * A flipped element is the rigid flipped image bent along the arc: with `flip.x` the column at `xc`
 * is placed where the unflipped element's column at `−xc` sits (`u_i` uses `−xc`) and is mirrored
 * within its strip (negative x scale); `flip.y` negates the y scale. The outline is unaffected,
 * because the element's box is centred on the origin and so is mirror-symmetric.
 *
 * `rotationDeg` is ignored: a rotated strip band would shear and collapse, because the strips are
 * laid out along the circumference. A wrapped element on the cup always reads horizontally.
 */
export function wrapStripMatrix(
  placement: Placement,
  surface: PrintSurface,
  xc: number,
  flip: Flip = NO_FLIP,
): Mat2D {
  const at = surface.toFlat(arcOffsetU(surface, placement, flip.x ? -xc : xc), placement.v);
  const s = placement.scale;
  return multiply(
    translate(at.x, at.y),
    multiply(
      rotate(at.uprightRad),
      multiply(scale(flip.x ? -s : s, flip.y ? -s : s), translate(-xc, 0)),
    ),
  );
}

/**
 * The element's outline on the flat surface: the four corners of `box`, or, for an element that
 * `isWrapped`, `WRAP_OUTLINE_SAMPLES` points along the top edge (left to right) then along the
 * bottom edge (right to left), placed like the strips so the outline hugs the warped element.
 */
export function elementOutline(el: DesignElement, surface: PrintSurface, box: RectMm): PointMm[] {
  const right = box.x + box.width;
  const bottom = box.y + box.height;

  if (!isWrapped(el, surface)) {
    const m = elementMatrix(el, surface);
    return [
      { x: box.x, y: box.y },
      { x: right, y: box.y },
      { x: right, y: bottom },
      { x: box.x, y: bottom },
    ].map((corner) => applyToPoint(m, corner));
  }

  const edge = (y: number): PointMm[] =>
    Array.from({ length: WRAP_OUTLINE_SAMPLES }, (_, i) => {
      const xc = box.x + (box.width * i) / (WRAP_OUTLINE_SAMPLES - 1);
      return applyToPoint(wrapStripMatrix(el.placement, surface, xc), { x: xc, y });
    });
  return [...edge(box.y), ...edge(bottom).reverse()];
}

/**
 * The points of an element's `outline` (from `elementOutline`, possibly pulled in) that a
 * containment test must check. A rigid element's outline is its four corners joined by straight
 * edges; on a sector (cup) surface the band's inner arc is concave, so the middle of a straight
 * edge (a wide logo's bottom edge) leaves the area before its corners do, and every edge is
 * sampled. A wrapped outline already follows the arcs, and on a rect surface every region is a
 * rectangle, so the outline itself is enough there.
 */
export function containmentPoints(
  el: DesignElement,
  surface: PrintSurface,
  outline: PointMm[],
): PointMm[] {
  return surface.kind === "sector" && !isWrapped(el, surface) ? alongEdges(outline) : outline;
}

/** The id of the topmost visible element whose outline contains `p` (flat mm), or `null`. */
export function hitTest(
  content: SurfaceContent,
  surface: PrintSurface,
  sizer: ElementSizer,
  p: PointMm,
): string | null {
  for (const el of content.elements.toReversed()) {
    if (el.hidden) continue;
    if (pointInPolygon(p, elementOutline(el, surface, sizer(el)))) return el.id;
  }
  return null;
}

const clamp = (value: number, [min, max]: [number, number]) => Math.min(max, Math.max(min, value));

/** Moves the placement centre inside the surface's `u × v` range, so an element is never lost off it. */
export function clampPlacement(p: Placement, surface: PrintSurface): Placement {
  return { ...p, u: clamp(p.u, surface.uRange), v: clamp(p.v, surface.vRange) };
}
