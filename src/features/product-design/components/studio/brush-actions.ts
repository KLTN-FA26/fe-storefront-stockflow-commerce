import {
  addElement,
  appendStroke,
  elementMatrix,
  invert,
  MAX_ELEMENTS_PER_SURFACE,
  simplifyRdp,
  type DesignDocument,
  type DesignElement,
  type DrawingElement,
  type EditorState,
  type Hex,
  type Mat2D,
  type Placement,
  type PointMm,
  type PrintAreaCode,
  type PrintSurface,
  type Stroke,
} from "../../engine";

/** The brush's size range, in mm on the surface, for the brush and the eraser alike. */
export const BRUSH_SIZE_MM = { min: 0.5, max: 20 } as const;
/** Stored points are simplified (Ramer–Douglas–Peucker) to this deviation, in mm on the surface. */
export const SIMPLIFY_TOLERANCE_MM = 0.1;
/** What a pointer that reports no pressure (a mouse, many touch screens) is taken to press with. */
const NO_PRESSURE = 0.5;
/** The colour an erase stroke carries: `destination-out` paints nothing, so it is never seen. */
export const ERASE_COLOR: Hex = "#000000";

/** `pressure` as a stroke point stores it: 0 (no reading from a pressed mouse) means "none". */
export function pressureOf(reported: number | undefined): number {
  return reported !== undefined && reported > 0 ? Math.min(1, reported) : NO_PRESSURE;
}

/** A drawing that takes strokes: neither hidden nor locked. */
export function editableDrawing(element: DesignElement | undefined): DrawingElement | null {
  return element?.type === "drawing" && !element.hidden && !element.locked ? element : null;
}

/** The drawing the brush adds to: the selected one, if it takes strokes; else a new one is made. */
export function brushTarget(
  elements: readonly DesignElement[],
  selectedId: string | null,
): DrawingElement | null {
  return editableDrawing(elements.find((element) => element.id === selectedId));
}

/**
 * The drawing the eraser cuts (R60): the selected drawing; when the selection is something else
 * or nothing, the topmost drawing of the surface that takes strokes. `null` (the eraser does
 * nothing) with no such drawing, or when the selected drawing is locked or hidden.
 */
export function eraserTarget(
  elements: readonly DesignElement[],
  selectedId: string | null,
): DrawingElement | null {
  const selected = elements.find((element) => element.id === selectedId);
  if (selected?.type === "drawing") return editableDrawing(selected);
  for (const element of elements.toReversed()) {
    const drawing = editableDrawing(element);
    if (drawing) return drawing;
  }
  return null;
}

const DRAWING_NAME = /^Nét vẽ (\d+)$/;

/** "Nét vẽ {n}" with the smallest n no drawing of the surface is called yet. */
export function nextDrawingName(elements: readonly DesignElement[]): string {
  const taken = new Set(
    elements.flatMap((element) => {
      const n = element.type === "drawing" ? DRAWING_NAME.exec(element.name)?.[1] : undefined;
      return n === undefined ? [] : [Number(n)];
    }),
  );
  let n = 1;
  while (taken.has(n)) n += 1;
  return `Nét vẽ ${n}`;
}

/** A drawing with no strokes yet, whose origin is the placement (never mirrored, never wrapped, R16). */
export function emptyDrawing(
  id: string,
  name: string,
  placement: Placement,
  opacity: number,
): DrawingElement {
  return {
    id,
    type: "drawing",
    name,
    hidden: false,
    locked: false,
    opacity,
    placement,
    strokes: [],
  };
}

/** What a stroke goes into: a drawing of the document, or a new one that goes in with it. */
export type StrokeTarget = { drawing: DrawingElement; isNew: boolean };

/**
 * `doc` with `stroke` in the target drawing, which is added to surface `code` first when new.
 * The same document back when nothing can take it (the surface is full, the drawing is gone).
 */
export function withStroke(
  doc: DesignDocument,
  code: PrintAreaCode,
  { drawing, isNew }: StrokeTarget,
  stroke: Stroke,
): DesignDocument {
  return appendStroke(isNew ? addElement(doc, code, drawing) : doc, code, drawing.id, stroke);
}

/** A stroke under way: the pointer that draws it, and its points so far in the drawing's local mm. */
export type Inking = {
  pointerId: number;
  gestureId: string;
  code: PrintAreaCode;
  target: StrokeTarget;
  /** Flat mm → the target drawing's local mm. */
  toLocal: Mat2D;
  mode: Stroke["mode"];
  color: Hex;
  /** In the drawing's local mm: the brush's size on the surface, undone from the drawing's scale. */
  sizeMm: number;
  points: [number, number, number][];
};

/** The stroke as it is stored: its points simplified, to the same deviation on the surface at any scale. */
export function strokeOf({ mode, color, sizeMm, points, target }: Inking): Stroke {
  const tolerance = SIMPLIFY_TOLERANCE_MM / target.drawing.placement.scale;
  return { mode, color, sizeMm, points: simplifyRdp(points, tolerance) };
}

/**
 * The stroke a press at `at` (flat mm) starts with the brush or the eraser, whichever `state.tool`
 * is, with no points yet; `null` when it draws nothing: the press is off the printable area, the
 * eraser has no drawing to cut, or a new drawing has no room on the surface. The brush goes into
 * `brushTarget`, else into a new drawing named by `nextDrawingName`, placed where the press is,
 * upright and unscaled (R16: a drawing never wraps). `newId` mints the ids of the new drawing
 * and of the stroke's gesture.
 */
export function beginInking({
  state,
  surface,
  at,
  pointerId,
  newId,
}: {
  state: EditorState;
  surface: PrintSurface;
  at: PointMm;
  pointerId: number;
  newId: () => string;
}): Inking | null {
  const code = surface.code;
  if (!surface.contains(at, "bleed")) return null;
  const elements = state.document.surfaces[code]?.elements ?? [];
  const mode: Stroke["mode"] = state.tool === "eraser" ? "erase" : "draw";
  const existing =
    mode === "erase"
      ? eraserTarget(elements, state.selectedId)
      : brushTarget(elements, state.selectedId);

  let target: StrokeTarget | null = existing && { drawing: existing, isNew: false };
  if (!target && mode === "draw" && elements.length < MAX_ELEMENTS_PER_SURFACE) {
    const { u, v } = surface.fromFlat(at.x, at.y);
    const placement = { u, v, rotationDeg: 0, scale: 1 };
    const name = nextDrawingName(elements);
    target = { drawing: emptyDrawing(newId(), name, placement, state.brush.opacity), isNew: true };
  }
  const toLocal = target && invert(elementMatrix(target.drawing, surface));
  if (!target || !toLocal) return null;

  const sizeOnSurface = mode === "erase" ? state.eraser.sizeMm : state.brush.sizeMm;
  return {
    pointerId,
    gestureId: newId(),
    code,
    target,
    toLocal,
    mode,
    color: mode === "erase" ? ERASE_COLOR : state.brush.color,
    sizeMm: sizeOnSurface / target.drawing.placement.scale,
    points: [],
  };
}
