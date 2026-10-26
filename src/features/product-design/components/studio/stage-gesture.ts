import {
  applyToPoint,
  hitTest,
  invert,
  snapPlacement,
  surfaceSnapTargets,
  type DesignElement,
  type ElementSizer,
  type Mat2D,
  type PointMm,
  type PrintSurface,
  type SnapTarget,
  type SurfaceContent,
  type SurfacePoint,
} from "../../engine";
import { normalizeDeg, SCALE_RANGE } from "./element-actions";
import { frameMatrix, handleAt, selectionFrame } from "./selection-frame";

/**
 * The geometry of the stage's pointer gestures, in flat mm: what a press starts and what each
 * pointer position makes of the element (`useStagePointer` wires it to the overlay).
 */

/** Snap distance of a dragged element's centre, in mm (spec §6.2). */
const SNAP_MM = 2;
/** Rotation steps with Shift held. */
const ROTATE_STEP_DEG = 15;
/** Smallest side of an image resized freely (Shift), in mm. */
const MIN_SIDE_MM = 1;
/**
 * Shortest corner-to-pivot distance a scale is measured with, in mm: the factor is the grabbed
 * corner's reach now over its reach at the press, both floored, so the first frame is always 1.
 */
const MIN_SCALE_REACH_MM = 2;

export type SnapGuides = { u: number | null; v: number | null };
export const NO_GUIDES: SnapGuides = { u: null, v: null };

export type Drag =
  | { kind: "move"; grab: SurfacePoint; targets: SnapTarget[] }
  | {
      kind: "scale";
      /** The grabbed corner, the press point and the corner's distance to the pivot (floored). */
      corner: PointMm;
      from: PointMm;
      distance: number;
      toLocal: Mat2D | null;
    }
  | { kind: "rotate"; angle: number };

/** A drag under way: the element as it was when it began (every frame starts from it). */
export type DragFrom = Drag & { surface: PrintSurface; start: DesignElement; pivot: PointMm };

export type StagePointer = PointMm & { shift: boolean };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const angleOf = (p: PointMm, pivot: PointMm) => Math.atan2(p.y - pivot.y, p.x - pivot.x);
const pivotOf = (el: DesignElement, surface: PrintSurface): PointMm => {
  const { x, y } = surface.toFlat(el.placement.u, el.placement.v);
  return { x, y };
};

/**
 * What a press at `p` does. On a handle of `withHandles` (the selected element, when it shows
 * handles) it starts scaling or turning it; anywhere else it selects the topmost visible element
 * under `p` (`select`, `null` for none) and starts moving it, snapped to the surface's centre and
 * safe lines and the other elements. `pxPerMm` and `hitRadiusPx` size the handles as drawn.
 */
export function press({
  p,
  withHandles,
  content,
  surface,
  sizer,
  pxPerMm,
  hitRadiusPx,
}: {
  p: PointMm;
  withHandles: DesignElement | undefined;
  content: SurfaceContent;
  surface: PrintSurface;
  sizer: ElementSizer;
  pxPerMm: number;
  hitRadiusPx: number;
}): { select?: string | null; drag: DragFrom | null } {
  const frame = withHandles && selectionFrame(withHandles, surface, sizer(withHandles));
  const handle = frame && handleAt(p, frame, { pxPerMm, hitRadiusPx });
  if (withHandles && handle) {
    const pivot = pivotOf(withHandles, surface);
    const from = { surface, start: withHandles, pivot };
    if (handle.kind === "rotate") {
      return { drag: { ...from, kind: "rotate", angle: angleOf(p, pivot) } };
    }
    const { corner } = handle;
    const distance = Math.max(
      MIN_SCALE_REACH_MM,
      Math.hypot(corner.x - pivot.x, corner.y - pivot.y),
    );
    const toLocal = invert(frameMatrix(withHandles, surface));
    return { drag: { ...from, kind: "scale", corner, from: p, distance, toLocal } };
  }

  const id = hitTest(content, surface, sizer, p);
  const start = content.elements.find((element) => element.id === id);
  if (!start) return { select: null, drag: null };
  const at = surface.fromFlat(p.x, p.y);
  const others = content.elements.filter((el) => el.id !== start.id && !el.hidden);
  const drag: DragFrom = {
    kind: "move",
    grab: { u: at.u - start.placement.u, v: at.v - start.placement.v },
    targets: surfaceSnapTargets(
      surface,
      others.map((el) => el.placement),
    ),
    surface,
    start,
    pivot: pivotOf(start, surface),
  };
  return { select: start.id, drag };
}

/** The edit one frame of a drag makes, from where it began and where the pointer is now. */
export function dragEdit(
  g: DragFrom,
  p: StagePointer,
): { patch: Partial<DesignElement>; guides: SnapGuides } {
  const { start, pivot, surface } = g;
  switch (g.kind) {
    case "move": {
      const at = surface.fromFlat(p.x, p.y);
      const snap = snapPlacement({ u: at.u - g.grab.u, v: at.v - g.grab.v }, g.targets, SNAP_MM);
      return {
        patch: { placement: { ...start.placement, u: snap.u, v: snap.v } },
        guides: { u: snap.snappedU, v: snap.snappedV },
      };
    }
    case "scale": {
      // The grabbed corner follows the pointer from where it was pressed.
      const at = { x: g.corner.x + p.x - g.from.x, y: g.corner.y + p.y - g.from.y };
      if (p.shift && start.type === "image" && g.toLocal) {
        // Shift on an image: each side follows the corner on its own, about the centre.
        const local = applyToPoint(g.toLocal, at);
        const widthMm = Math.max(MIN_SIDE_MM, 2 * Math.abs(local.x));
        const heightMm = Math.max(MIN_SIDE_MM, 2 * Math.abs(local.y));
        return { patch: { widthMm, heightMm, placement: start.placement }, guides: NO_GUIDES };
      }
      const reach = Math.max(MIN_SCALE_REACH_MM, Math.hypot(at.x - pivot.x, at.y - pivot.y));
      const factor = reach / g.distance;
      const scale = clamp(start.placement.scale * factor, SCALE_RANGE.min, SCALE_RANGE.max);
      const size =
        start.type === "image" ? { widthMm: start.widthMm, heightMm: start.heightMm } : {};
      return { patch: { ...size, placement: { ...start.placement, scale } }, guides: NO_GUIDES };
    }
    case "rotate": {
      const turned = start.placement.rotationDeg + ((angleOf(p, pivot) - g.angle) * 180) / Math.PI;
      const rotationDeg = normalizeDeg(
        p.shift ? Math.round(turned / ROTATE_STEP_DEG) * ROTATE_STEP_DEG : turned,
      );
      return { patch: { placement: { ...start.placement, rotationDeg } }, guides: NO_GUIDES };
    }
  }
}
