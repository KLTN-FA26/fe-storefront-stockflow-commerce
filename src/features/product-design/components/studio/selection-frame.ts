import {
  applyToPoint,
  elementMatrix,
  elementOutline,
  isWrapped,
  pointInPolygon,
  type DesignElement,
  type EditorState,
  type Mat2D,
  type PointMm,
  type PrintSurface,
  type RectMm,
} from "../../engine";

/** Points along a snap guide across the surface (`v` constant: an arc on the cup). */
const GUIDE_SAMPLES = 48;

/** Half the drawn square of a corner handle, in CSS px. */
export const HANDLE_HALF_PX = 5;
/** Radius of the drawn rotate handle, in CSS px. */
export const ROTATE_DOT_PX = 6;
/** How far the rotate handle sits above the element's top edge, in CSS px. */
const ROTATE_OFFSET_PX = 28;
/** Extra px around a drawn handle that still counts as on it. */
const HANDLE_SLOP_PX = 1;

/** Whether the selected element gets handles: the select tool on an editable, visible, unlocked one. */
export const showsHandles = (
  el: DesignElement,
  { tool, readOnly }: Pick<EditorState, "tool" | "readOnly">,
) => tool === "select" && !readOnly && !el.locked && !el.hidden;

/** What the stage draws around a selected element, in flat mm. */
export type SelectionFrame = {
  /** The outline: the box's four corners, or the arc-sampled outline of a wrapped element. */
  outline: PointMm[];
  /** Top-left, top-right, bottom-right, bottom-left as the element reads (flips aside). */
  corners: [PointMm, PointMm, PointMm, PointMm];
  /** The placement point: the element turns and scales about it. */
  pivot: PointMm;
  /** The middle of the top edge and the unit direction "up" from it; `null` when it cannot turn. */
  top: { at: PointMm; up: PointMm } | null;
};

const mid = (a: PointMm, b: PointMm): PointMm => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/**
 * The element-local → flat matrix the handles follow: `elementMatrix` without the mirroring (so
 * the corner order and "up" read as the element does), and without the rotation a wrapped element
 * ignores (R15).
 */
export function frameMatrix(el: DesignElement, surface: PrintSurface): Mat2D {
  const upright = isWrapped(el, surface)
    ? { ...el, placement: { ...el.placement, rotationDeg: 0 } }
    : el;
  const unflipped = upright.type === "image" ? { ...upright, flipX: false, flipY: false } : upright;
  return elementMatrix(unflipped, surface);
}

export function selectionFrame(
  el: DesignElement,
  surface: PrintSurface,
  box: RectMm,
): SelectionFrame {
  const { x, y } = surface.toFlat(el.placement.u, el.placement.v);
  const pivot = { x, y };

  if (isWrapped(el, surface)) {
    // Top edge left → right, then bottom edge right → left (`elementOutline`).
    const outline = elementOutline(el, surface, box);
    const half = outline.length / 2;
    const corner = (i: number) => outline[i] ?? pivot;
    return {
      outline,
      corners: [corner(0), corner(half - 1), corner(half), corner(outline.length - 1)],
      pivot,
      top: null,
    };
  }

  const m = frameMatrix(el, surface);
  const [right, bottom] = [box.x + box.width, box.y + box.height];
  const corners: SelectionFrame["corners"] = [
    applyToPoint(m, { x: box.x, y: box.y }),
    applyToPoint(m, { x: right, y: box.y }),
    applyToPoint(m, { x: right, y: bottom }),
    applyToPoint(m, { x: box.x, y: bottom }),
  ];
  const topMid = mid(corners[0], corners[1]);
  const bottomMid = mid(corners[3], corners[2]);
  const length = Math.hypot(topMid.x - bottomMid.x, topMid.y - bottomMid.y);
  const up =
    length > 0
      ? { x: (topMid.x - bottomMid.x) / length, y: (topMid.y - bottomMid.y) / length }
      : { x: 0, y: -1 };
  return { outline: corners, corners, pivot, top: { at: topMid, up } };
}

/**
 * Where the handles sit, in flat mm, at `pxPerMm` CSS px per mm: the four corners, and the rotate
 * handle `ROTATE_OFFSET_PX` above the top edge (`null` when the element cannot turn).
 */
export function handleMarks(frame: SelectionFrame, pxPerMm: number) {
  const { top } = frame;
  const rotate = top && {
    x: top.at.x + (top.up.x * ROTATE_OFFSET_PX) / pxPerMm,
    y: top.at.y + (top.up.y * ROTATE_OFFSET_PX) / pxPerMm,
  };
  return { corners: frame.corners, rotate };
}

export type HandleHit = { kind: "scale"; corner: PointMm } | { kind: "rotate" };

/**
 * The handle of the element framed by `frame` a press at `p` (flat mm) is on, decided by geometry rather than by what is drawn on top
 * (small elements are mostly covered by the handles' hit areas): a drawn handle (`HANDLE_HALF_PX`
 * square, `ROTATE_DOT_PX` dot) first; else nothing when `p` is inside the element's outline, so
 * its body can always be dragged; else the nearest handle within `hitRadiusPx`, the hit area
 * reaching outwards from the corners (44 px across on touch screens).
 */
export function handleAt(
  p: PointMm,
  frame: SelectionFrame,
  { pxPerMm, hitRadiusPx }: { pxPerMm: number; hitRadiusPx: number },
): HandleHit | null {
  const { corners, rotate } = handleMarks(frame, pxPerMm);
  const px = (q: PointMm) => Math.hypot(p.x - q.x, p.y - q.y) * pxPerMm;
  const onSquare = (q: PointMm) =>
    Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y)) * pxPerMm <= HANDLE_HALF_PX + HANDLE_SLOP_PX;
  const nearest = [...corners].sort((a, b) => px(a) - px(b))[0];

  if (rotate && px(rotate) <= ROTATE_DOT_PX + HANDLE_SLOP_PX) return { kind: "rotate" };
  if (nearest && onSquare(nearest)) return { kind: "scale", corner: nearest };
  if (pointInPolygon(p, frame.outline)) return null;
  const toRotate = rotate ? px(rotate) : Infinity;
  const toCorner = nearest ? px(nearest) : Infinity;
  if (Math.min(toRotate, toCorner) > hitRadiusPx) return null;
  return toRotate < toCorner || !nearest ? { kind: "rotate" } : { kind: "scale", corner: nearest };
}

/** A snap guide in flat mm: the line `u = value` down the surface, or `v = value` across it. */
export function snapGuide(surface: PrintSurface, axis: "u" | "v", value: number): PointMm[] {
  const point = (u: number, v: number) => {
    const { x, y } = surface.toFlat(u, v);
    return { x, y };
  };
  if (axis === "u") return surface.vRange.map((v) => point(value, v));
  const [u0, u1] = surface.uRange;
  return Array.from({ length: GUIDE_SAMPLES + 1 }, (_, i) =>
    point(u0 + ((u1 - u0) * i) / GUIDE_SAMPLES, value),
  );
}
