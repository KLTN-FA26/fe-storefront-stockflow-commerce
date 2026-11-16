import { clampPlacement } from "../geometry/element";
import { createSurfaces, type PrintSurface } from "../surfaces";
import type { CustomizationTemplate, PrintAreaCode } from "../template/schema";
import { emptySurface } from "./factory";
import type { DesignDocument, DesignElement, Placement, SurfaceContent } from "./schema";

/**
 * Part E, spec §7 and plan decision Q4. A pure re-fit of a design from one variant's print
 * template to another's (the "clone to another size" feature).
 *
 * Per print area present in both templates, each element keeps its relative position inside the
 * surface's `uRange` / `vRange` and its `placement.scale` is multiplied by
 * `s = min(Δu to / Δu from, Δv to / Δv from)`. On a sector `u` is arc length at the mid radius, so
 * the `u` fraction is the angular fraction and `v` is the radial fraction. `scale` multiplies the
 * whole element (text, image, drawing), so `sizePt`, image sizes and stroke points stay as they
 * are. Branching is by what a surface is, never by model kind: a near-cylindrical cup is `rect`.
 * Elements in an area the target lacks are dropped and counted; the result is clamped into the
 * target's print range; backgrounds are copied as they are.
 */
export function retargetDocument(
  document: DesignDocument,
  from: CustomizationTemplate,
  to: CustomizationTemplate,
): { document: DesignDocument; dropped: number } {
  const fromSurfaces = createSurfaces(from).byCode;
  const toSurfaces = createSurfaces(to).byCode;
  const surfaces: DesignDocument["surfaces"] = {};
  let dropped = 0;

  for (const area of to.printAreas) {
    const code = area.code;
    const target = toSurfaces[code];
    const content = document.surfaces[code];
    if (!target) continue;
    surfaces[code] = content ? refit(content, fromSurfaces[code], target) : emptySurface();
  }
  for (const code of Object.keys(document.surfaces) as PrintAreaCode[]) {
    if (!toSurfaces[code]) dropped += document.surfaces[code]?.elements.length ?? 0;
  }

  // `surfaces` are cloned by `refit` already: only the rest of the document is cloned here.
  const { surfaces: _surfaces, ...rest } = document;
  return {
    document: { ...structuredClone(rest), templateCode: to.code, sku: to.sku, surfaces },
    dropped,
  };
}

const lengthOf = ([min, max]: [number, number]) => max - min;

/** Where `value` sits in `range`, 0 at the start and 1 at the end. */
const fraction = (value: number, range: [number, number]) =>
  lengthOf(range) === 0 ? 0.5 : (value - range[0]) / lengthOf(range);

/** `to` as many times as long as `from`; 1 when `from` has no length (nothing to scale by). */
const scaleBetween = (from: [number, number], to: [number, number]) =>
  lengthOf(from) === 0 ? 1 : lengthOf(to) / lengthOf(from);

function refit(
  content: SurfaceContent,
  from: PrintSurface | undefined,
  to: PrintSurface,
): SurfaceContent {
  const copy = structuredClone(content);
  if (!from) {
    // The source template has no such area (malformed document): only keep the elements inside.
    return {
      ...copy,
      elements: copy.elements.map((el) => place(el, clampPlacement(el.placement, to))),
    };
  }
  const s = Math.min(scaleBetween(from.uRange, to.uRange), scaleBetween(from.vRange, to.vRange));
  return {
    ...copy,
    elements: copy.elements.map((el) => {
      const p = el.placement;
      const moved: Placement = {
        ...p,
        u: to.uRange[0] + fraction(p.u, from.uRange) * lengthOf(to.uRange),
        v: to.vRange[0] + fraction(p.v, from.vRange) * lengthOf(to.vRange),
        scale: p.scale * s,
      };
      return place(el, clampPlacement(moved, to));
    }),
  };
}

const place = (el: DesignElement, placement: Placement): DesignElement => ({ ...el, placement });
