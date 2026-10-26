import { describe, expect, it } from "vitest";

import {
  beginInking,
  brushTarget,
  editableDrawing,
  emptyDrawing,
  eraserTarget,
  nextDrawingName,
  pressureOf,
  withStroke,
} from "../components/studio/brush-actions";
import {
  applyToPoint,
  createEditor,
  createSurfaces,
  emptyDocument,
  MAX_ELEMENTS_PER_SURFACE,
  type DesignDocument,
  type DesignElement,
  type Stroke,
  type ToolId,
} from "../engine";
import { bagM, drawingEl, imageEl } from "../engine/__tests__/fixtures";

const stroke: Stroke = {
  mode: "draw",
  color: "#000000",
  sizeMm: 2,
  points: [
    [0, 0, 0.5],
    [10, 0, 0.5],
  ],
};

describe("pressureOf", () => {
  it("keeps a reading in (0, 1] and takes 0.5 for none", () => {
    expect(pressureOf(0.3)).toBe(0.3);
    expect(pressureOf(1)).toBe(1);
    expect(pressureOf(1.4)).toBe(1);
    expect(pressureOf(0)).toBe(0.5);
    expect(pressureOf(undefined)).toBe(0.5);
  });
});

describe("the drawing a tool works on", () => {
  const low = drawingEl("low");
  const high = drawingEl("high");
  const photo = imageEl("photo");

  it("is, for the brush, the selected drawing that takes strokes, else none (a new one is made)", () => {
    const all = [photo, low, high];
    expect(brushTarget(all, "low")).toBe(low);
    expect(brushTarget(all, "photo")).toBeNull();
    expect(brushTarget(all, null)).toBeNull();
    expect(brushTarget([drawingEl("shut", { locked: true })], "shut")).toBeNull();
    expect(brushTarget([drawingEl("gone", { hidden: true })], "gone")).toBeNull();
  });

  it("is, for the eraser, the selected drawing, else the topmost one that takes strokes (R60)", () => {
    const all = [low, photo, high];
    expect(eraserTarget(all, "low")).toBe(low);
    expect(eraserTarget(all, "photo")).toBe(high);
    expect(eraserTarget(all, null)).toBe(high);
    expect(eraserTarget([low, drawingEl("hid", { hidden: true })], null)).toBe(low);
    expect(eraserTarget([low, drawingEl("shut", { locked: true })], null)).toBe(low);
    expect(eraserTarget([photo], null)).toBeNull();
    expect(eraserTarget([], null)).toBeNull();
  });

  it("never takes a locked or hidden selection for the eraser", () => {
    expect(eraserTarget([low, drawingEl("shut", { locked: true })], "shut")).toBeNull();
    expect(eraserTarget([low, drawingEl("hid", { hidden: true })], "hid")).toBeNull();
    expect(editableDrawing(photo)).toBeNull();
    expect(editableDrawing(undefined)).toBeNull();
  });
});

describe("nextDrawingName", () => {
  const named = (name: string) => drawingEl(name, { name });

  it("numbers from 1 and takes the smallest number no drawing has", () => {
    expect(nextDrawingName([])).toBe("Nét vẽ 1");
    expect(nextDrawingName([named("Nét vẽ 1"), named("Nét vẽ 2")])).toBe("Nét vẽ 3");
    expect(nextDrawingName([named("Nét vẽ 1"), named("Nét vẽ 3")])).toBe("Nét vẽ 2");
    expect(nextDrawingName([named("Nét vẽ 2")])).toBe("Nét vẽ 1");
  });

  it("ignores other names, and other kinds of element", () => {
    expect(
      nextDrawingName([named("Hình của tôi"), imageEl("Nét vẽ 1", { name: "Nét vẽ 1" })]),
    ).toBe("Nét vẽ 1");
  });
});

describe("withStroke", () => {
  const placement = { u: 50, v: 60, rotationDeg: 0, scale: 1 };
  const fresh = () => emptyDrawing("new", "Nét vẽ 1", placement, 0.7);

  it("adds a new drawing with its first stroke, on top", () => {
    const doc = emptyDocument(bagM);
    const next = withStroke(doc, "FRONT", { drawing: fresh(), isNew: true }, stroke);
    expect(next.surfaces.FRONT!.elements).toEqual([
      expect.objectContaining({ id: "new", type: "drawing", opacity: 0.7, strokes: [stroke] }),
    ]);
    expect(doc.surfaces.FRONT!.elements).toEqual([]);
  });

  it("appends to a drawing the document already has", () => {
    const doc = withStroke(emptyDocument(bagM), "FRONT", { drawing: fresh(), isNew: true }, stroke);
    const next = withStroke(doc, "FRONT", { drawing: fresh(), isNew: false }, stroke);
    expect(next.surfaces.FRONT!.elements).toEqual([
      expect.objectContaining({ id: "new", strokes: [stroke, stroke] }),
    ]);
  });

  it("returns the same document when nothing can take the stroke", () => {
    const empty = emptyDocument(bagM);
    expect(withStroke(empty, "FRONT", { drawing: fresh(), isNew: false }, stroke)).toBe(empty);
    const full = {
      ...empty,
      surfaces: {
        ...empty.surfaces,
        FRONT: {
          background: { kind: "none" as const },
          elements: Array.from({ length: MAX_ELEMENTS_PER_SURFACE }, (_, i) => imageEl(`i${i}`)),
        },
      },
    };
    expect(withStroke(full, "FRONT", { drawing: fresh(), isNew: true }, stroke)).toBe(full);
  });
});

describe("beginInking", () => {
  const front = createSurfaces(bagM).byCode.FRONT!;
  const at = (({ x, y }) => ({ x, y }))(front.toFlat(60, 90));

  /** A press with `tool` at `at` on a front holding `elements`, `selected` selected. */
  function press(
    tool: ToolId,
    elements: DesignElement[] = [],
    { selected = null, pointer = at }: { selected?: string | null; pointer?: typeof at } = {},
  ) {
    const empty = emptyDocument(bagM);
    const document: DesignDocument = {
      ...empty,
      surfaces: { ...empty.surfaces, FRONT: { background: { kind: "none" }, elements } },
    };
    let n = 0;
    const editor = createEditor({ template: bagM, document, newId: () => `id-${++n}` });
    editor.setTool(tool);
    editor.setBrush({ sizeMm: 6, color: "#DC2626", opacity: 0.4 });
    editor.setEraser({ sizeMm: 9 });
    editor.select(selected);
    return beginInking({
      state: editor.store.getState(),
      surface: front,
      at: pointer,
      pointerId: 3,
      newId: editor.newId,
    });
  }

  it("starts a stroke in a new drawing placed under the press, with the brush's settings", () => {
    const inking = press("brush")!;
    expect(inking).toMatchObject({
      pointerId: 3,
      gestureId: "id-2",
      code: "FRONT",
      mode: "draw",
      color: "#DC2626",
      sizeMm: 6,
      points: [],
      target: { isNew: true },
    });
    expect(inking.target.drawing).toMatchObject({
      id: "id-1",
      name: "Nét vẽ 1",
      opacity: 0.4,
      placement: { u: 60, v: 90, rotationDeg: 0, scale: 1 },
      strokes: [],
    });
    // The press itself is the new drawing's origin.
    const origin = applyToPoint(inking.toLocal, at);
    expect(origin.x).toBeCloseTo(0, 9);
    expect(origin.y).toBeCloseTo(0, 9);
  });

  it("goes into the selected drawing, sizing the brush back from the drawing's scale", () => {
    const scaled = drawingEl("d", { placement: { u: 10, v: 10, rotationDeg: 0, scale: 2 } });
    const inking = press("brush", [scaled], { selected: "d" })!;
    expect(inking.target).toEqual({ drawing: scaled, isNew: false });
    expect(inking.sizeMm).toBe(3);
  });

  it("starts an erase stroke in the drawing the eraser targets, at the eraser's size", () => {
    const drawing = drawingEl("d");
    const inking = press("eraser", [drawing])!;
    expect(inking).toMatchObject({ mode: "erase", color: "#000000", sizeMm: 9 });
    expect(inking.target).toEqual({ drawing, isNew: false });
  });

  it("starts nothing for the eraser without a drawing, off the face, or on a full surface", () => {
    expect(press("eraser", [imageEl("photo")])).toBeNull();
    expect(press("brush", [], { pointer: { x: -50, y: 20 } })).toBeNull();
    const full = Array.from({ length: MAX_ELEMENTS_PER_SURFACE }, (_, i) => imageEl(`i${i}`));
    expect(press("brush", full)).toBeNull();
    // A selected drawing still takes strokes on a full surface.
    const withDrawing = [...full.slice(1), drawingEl("d")];
    expect(press("brush", withDrawing, { selected: "d" })).not.toBeNull();
  });
});
