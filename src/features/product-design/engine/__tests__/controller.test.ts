// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { addElement, removeElement, updateElement } from "../document/commands";
import { emptyDocument } from "../document/factory";
import type { DesignDocument } from "../document/schema";
import { createEditor, type EditorController } from "../editor/controller";
import { resolveShortcut } from "../editor/shortcuts";
import * as engine from "../index";
import type { PrintAreaCode } from "../template/schema";
import { bagM, textEl } from "./fixtures";

/** Deterministic id source: `id-1`, `id-2`, … */
function seq(): () => string {
  let n = 0;
  return () => `id-${++n}`;
}

/** A bag document whose FRONT surface holds one text element per id. */
function docWith(...ids: string[]): DesignDocument {
  return ids.reduce((doc, id) => addElement(doc, "FRONT", textEl(id)), emptyDocument(bagM));
}

function front(ed: EditorController) {
  return ed.store.getState().document.surfaces.FRONT!.elements;
}

type Mods = Partial<Parameters<typeof resolveShortcut>[0]>;
const k = (key: string, mods: Mods = {}) => ({
  key,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...mods,
});

describe("editor controller", () => {
  it("applies commands, reports changed surfaces and undoes/redoes", () => {
    const ed = createEditor({ template: bagM, document: emptyDocument(bagM), newId: seq() });
    const seen: PrintAreaCode[][] = [];
    ed.onDocumentChange((_d, c) => seen.push(c));
    ed.apply((d) => addElement(d, "FRONT", textEl("a")));
    expect(seen).toEqual([["FRONT"]]);
    expect(ed.store.getState()).toMatchObject({ revision: 1, canUndo: true });
    ed.undo();
    expect(ed.store.getState().document.surfaces.FRONT!.elements).toHaveLength(0);
    ed.redo();
    expect(ed.store.getState().document.surfaces.FRONT!.elements).toHaveLength(1);
  });

  it("ignores edits in read-only mode and clears a removed selection", () => {
    const ed = createEditor({ template: bagM, document: docWith("a") });
    ed.select("a");
    ed.apply((d) => removeElement(d, "FRONT", "a"));
    expect(ed.store.getState().selectedId).toBeNull();
    ed.setReadOnly(true);
    ed.apply((d) => addElement(d, "FRONT", textEl("b")));
    expect(ed.store.getState().document.surfaces.FRONT!.elements).toHaveLength(0);
  });

  it("starts on the first print area with the editor defaults", () => {
    const ed = createEditor({ template: bagM, document: emptyDocument(bagM) });
    expect(ed.store.getState()).toMatchObject({
      activeSurface: "FRONT",
      selectedId: null,
      tool: "select",
      zoom: 1,
      readOnly: false,
      revision: 0,
      canUndo: false,
      canRedo: false,
    });
  });

  describe("no-op commands", () => {
    it("record nothing, bump no revision and emit no change", () => {
      const doc = docWith("a");
      const ed = createEditor({ template: bagM, document: doc });
      const listener = vi.fn();
      ed.onDocumentChange(listener);
      ed.apply((d) => d);
      ed.apply((d) => removeElement(d, "FRONT", "missing"));
      expect(ed.store.getState()).toMatchObject({ revision: 0, canUndo: false });
      expect(ed.store.getState().document).toBe(doc);
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("print areas", () => {
    it("ignores an unknown active surface", () => {
      const ed = createEditor({ template: bagM, document: emptyDocument(bagM) });
      ed.setActiveSurface("BODY");
      expect(ed.store.getState().activeSurface).toBe("FRONT");
      ed.setActiveSurface("LEFT");
      expect(ed.store.getState().activeSurface).toBe("LEFT");
    });

    it("lists only template surfaces as changed", () => {
      const ed = createEditor({ template: bagM, document: emptyDocument(bagM) });
      const seen: PrintAreaCode[][] = [];
      ed.onDocumentChange((_d, c) => seen.push(c));
      ed.apply((d) => addElement(addElement(d, "BACK", textEl("b")), "BODY", textEl("x")));
      expect(seen).toEqual([["BACK"]]);
    });

    it("drops the selection when the active surface changes", () => {
      const ed = createEditor({ template: bagM, document: docWith("a") });
      ed.select("a");
      ed.setActiveSurface("FRONT");
      expect(ed.store.getState().selectedId).toBe("a");
      ed.setActiveSurface("BACK");
      expect(ed.store.getState().selectedId).toBeNull();
    });
  });

  describe("history", () => {
    it("collapses commands sharing a gesture id into one undo step", () => {
      const ed = createEditor({ template: bagM, document: docWith("a") });
      const seen: PrintAreaCode[][] = [];
      ed.onDocumentChange((_d, c) => seen.push(c));
      for (const u of [10, 20, 30]) {
        ed.apply(
          (d) => updateElement(d, "FRONT", "a", { placement: { ...textEl("a").placement, u } }),
          {
            gestureId: "drag-1",
          },
        );
      }
      expect(seen).toHaveLength(3);
      expect(ed.store.getState().revision).toBe(3);

      ed.undo();
      expect(front(ed)[0]!.placement.u).toBe(textEl("a").placement.u);
      expect(ed.store.getState().canUndo).toBe(false);
    });

    it("steps separately without a gesture id", () => {
      const ed = createEditor({ template: bagM, document: emptyDocument(bagM) });
      ed.apply((d) => addElement(d, "FRONT", textEl("a")));
      ed.apply((d) => addElement(d, "FRONT", textEl("b")));
      ed.undo();
      expect(front(ed).map((e) => e.id)).toEqual(["a"]);
      ed.undo();
      expect(front(ed)).toHaveLength(0);
    });

    it("reports the surfaces an undo and a redo change", () => {
      const ed = createEditor({ template: bagM, document: emptyDocument(bagM) });
      ed.apply((d) => addElement(d, "BACK", textEl("a")));
      const seen: PrintAreaCode[][] = [];
      ed.onDocumentChange((_d, c) => seen.push(c));
      ed.undo();
      ed.redo();
      expect(seen).toEqual([["BACK"], ["BACK"]]);
      expect(ed.store.getState()).toMatchObject({ revision: 3, canUndo: true, canRedo: false });
    });

    it("does nothing when there is nothing to undo or redo", () => {
      const ed = createEditor({ template: bagM, document: emptyDocument(bagM) });
      const listener = vi.fn();
      ed.onDocumentChange(listener);
      ed.undo();
      ed.redo();
      expect(ed.store.getState().revision).toBe(0);
      expect(listener).not.toHaveBeenCalled();
    });

    it("clears the selection of an element an undo removes", () => {
      const ed = createEditor({ template: bagM, document: emptyDocument(bagM) });
      ed.apply((d) => addElement(d, "FRONT", textEl("a")));
      ed.select("a");
      ed.undo();
      expect(ed.store.getState().selectedId).toBeNull();
    });

    it("clears the redo trail when a new command is applied", () => {
      const ed = createEditor({ template: bagM, document: emptyDocument(bagM) });
      ed.apply((d) => addElement(d, "FRONT", textEl("a")));
      ed.undo();
      expect(ed.store.getState().canRedo).toBe(true);
      ed.apply((d) => addElement(d, "FRONT", textEl("b")));
      expect(ed.store.getState().canRedo).toBe(false);
    });
  });

  describe("read-only", () => {
    it("also blocks undo and redo and reports them unavailable", () => {
      const ed = createEditor({ template: bagM, document: emptyDocument(bagM) });
      ed.apply((d) => addElement(d, "FRONT", textEl("a")));
      ed.setReadOnly(true);
      expect(ed.store.getState()).toMatchObject({ canUndo: false, canRedo: false });
      ed.undo();
      expect(front(ed)).toHaveLength(1);

      ed.setReadOnly(false);
      expect(ed.store.getState().canUndo).toBe(true);
      ed.undo();
      expect(front(ed)).toHaveLength(0);
    });
  });

  describe("replaceDocument", () => {
    it("swaps the document, clears history and selection, and emits every surface", () => {
      const ed = createEditor({ template: bagM, document: emptyDocument(bagM) });
      ed.apply((d) => addElement(d, "FRONT", textEl("a")));
      ed.select("a");
      const seen: PrintAreaCode[][] = [];
      ed.onDocumentChange((_d, c) => seen.push(c));

      const incoming = docWith("z");
      ed.replaceDocument(incoming);

      expect(ed.store.getState()).toMatchObject({
        document: incoming,
        selectedId: null,
        canUndo: false,
        canRedo: false,
        revision: 2,
      });
      expect(seen).toEqual([["FRONT", "BACK", "LEFT", "RIGHT"]]);
      ed.undo();
      expect(ed.store.getState().document).toBe(incoming);
    });

    it("works while read-only", () => {
      const ed = createEditor({ template: bagM, document: emptyDocument(bagM) });
      ed.setReadOnly(true);
      const incoming = docWith("z");
      ed.replaceDocument(incoming);
      expect(ed.store.getState().document).toBe(incoming);
    });
  });

  describe("document listeners", () => {
    it("hand the new document to listeners and stop after unsubscribe", () => {
      const ed = createEditor({ template: bagM, document: emptyDocument(bagM) });
      const listener = vi.fn();
      const off = ed.onDocumentChange(listener);
      ed.apply((d) => addElement(d, "FRONT", textEl("a")));
      expect(listener).toHaveBeenCalledWith(ed.store.getState().document, ["FRONT"]);
      off();
      ed.apply((d) => addElement(d, "FRONT", textEl("b")));
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("notify after the store holds the new state", () => {
      const ed = createEditor({ template: bagM, document: emptyDocument(bagM) });
      let revisionSeen = -1;
      ed.onDocumentChange(() => {
        revisionSeen = ed.store.getState().revision;
      });
      ed.apply((d) => addElement(d, "FRONT", textEl("a")));
      expect(revisionSeen).toBe(1);
    });
  });

  describe("view and tool state", () => {
    it("clamps zoom to 0.25-8", () => {
      const ed = createEditor({ template: bagM, document: emptyDocument(bagM) });
      ed.setZoom(100);
      expect(ed.store.getState().zoom).toBe(8);
      ed.setZoom(0.01);
      expect(ed.store.getState().zoom).toBe(0.25);
      ed.setZoom(2.5);
      expect(ed.store.getState().zoom).toBe(2.5);
      ed.setZoom(Number.NaN);
      expect(ed.store.getState().zoom).toBe(2.5);
    });

    it("sets the tool and merges brush and eraser patches", () => {
      const ed = createEditor({ template: bagM, document: emptyDocument(bagM) });
      ed.setTool("brush");
      expect(ed.store.getState().tool).toBe("brush");

      const before = ed.store.getState().brush;
      ed.setBrush({ sizeMm: 6 });
      expect(ed.store.getState().brush).toEqual({ ...before, sizeMm: 6 });
      ed.setBrush({ color: "#DC2626", opacity: 0.5 });
      expect(ed.store.getState().brush).toEqual({ sizeMm: 6, color: "#DC2626", opacity: 0.5 });

      ed.setEraser({ sizeMm: 9 });
      expect(ed.store.getState().eraser).toEqual({ sizeMm: 9 });
    });

    it("keeps the state object when nothing changes", () => {
      const ed = createEditor({ template: bagM, document: emptyDocument(bagM) });
      const listener = vi.fn();
      ed.store.subscribe(listener);
      ed.setTool("select");
      ed.setZoom(1);
      ed.setReadOnly(false);
      ed.setBrush({});
      ed.setActiveSurface("FRONT");
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("ids", () => {
    it("mints ids from the supplied source", () => {
      const ed = createEditor({ template: bagM, document: emptyDocument(bagM), newId: seq() });
      expect([ed.newId(), ed.newId()]).toEqual(["id-1", "id-2"]);
    });

    it("mints unique ids by default", () => {
      const ed = createEditor({ template: bagM, document: emptyDocument(bagM) });
      const ids = new Set(Array.from({ length: 50 }, () => ed.newId()));
      expect(ids.size).toBe(50);
      expect([...ids].every((id) => id.length > 0)).toBe(true);
    });
  });
});

describe("shortcuts", () => {
  it("maps shortcuts", () => {
    expect(resolveShortcut(k("z", { ctrlKey: true }))).toEqual({ action: "undo" });
    expect(resolveShortcut(k("y", { ctrlKey: true }))).toEqual({ action: "redo" });
    expect(resolveShortcut(k("ArrowLeft", { shiftKey: true }))).toEqual({
      action: "nudge",
      dx: -5,
      dy: 0,
    });
    expect(resolveShortcut(k("t"))).toEqual({ action: "tool", tool: "text" });
  });

  it("treats Ctrl and Cmd alike for history", () => {
    expect(resolveShortcut(k("z", { metaKey: true }))).toEqual({ action: "undo" });
    expect(resolveShortcut(k("z", { ctrlKey: true, shiftKey: true }))).toEqual({ action: "redo" });
    expect(resolveShortcut(k("Z", { metaKey: true, shiftKey: true }))).toEqual({ action: "redo" });
    expect(resolveShortcut(k("y", { metaKey: true }))).toEqual({ action: "redo" });
  });

  it("maps delete, duplicate and z-order", () => {
    expect(resolveShortcut(k("Delete"))).toEqual({ action: "delete" });
    expect(resolveShortcut(k("Backspace"))).toEqual({ action: "delete" });
    expect(resolveShortcut(k("d", { ctrlKey: true }))).toEqual({ action: "duplicate" });
    expect(resolveShortcut(k("d", { metaKey: true }))).toEqual({ action: "duplicate" });
    expect(resolveShortcut(k("]", { ctrlKey: true }))).toEqual({ action: "raise" });
    expect(resolveShortcut(k("[", { metaKey: true }))).toEqual({ action: "lower" });
  });

  it("nudges 0.5 mm, or 5 mm with Shift", () => {
    expect(resolveShortcut(k("ArrowLeft"))).toEqual({ action: "nudge", dx: -0.5, dy: 0 });
    expect(resolveShortcut(k("ArrowRight"))).toEqual({ action: "nudge", dx: 0.5, dy: 0 });
    expect(resolveShortcut(k("ArrowUp"))).toEqual({ action: "nudge", dx: 0, dy: -0.5 });
    expect(resolveShortcut(k("ArrowDown"))).toEqual({ action: "nudge", dx: 0, dy: 0.5 });
    expect(resolveShortcut(k("ArrowDown", { shiftKey: true }))).toEqual({
      action: "nudge",
      dx: 0,
      dy: 5,
    });
    expect(resolveShortcut(k("ArrowUp", { shiftKey: true }))).toEqual({
      action: "nudge",
      dx: 0,
      dy: -5,
    });
  });

  it("selects tools by letter, in either case", () => {
    const tools = { v: "select", u: "image", t: "text", b: "brush", e: "eraser", g: "background" };
    for (const [key, tool] of Object.entries(tools)) {
      expect(resolveShortcut(k(key))).toEqual({ action: "tool", tool });
      expect(resolveShortcut(k(key.toUpperCase()))).toEqual({ action: "tool", tool });
    }
  });

  it("leaves browser shortcuts and unmapped keys alone", () => {
    expect(resolveShortcut(k("t", { ctrlKey: true }))).toBeNull();
    expect(resolveShortcut(k("v", { metaKey: true }))).toBeNull();
    expect(resolveShortcut(k("ArrowLeft", { ctrlKey: true }))).toBeNull();
    expect(resolveShortcut(k("Delete", { metaKey: true }))).toBeNull();
    expect(resolveShortcut(k("x"))).toBeNull();
    expect(resolveShortcut(k("Enter"))).toBeNull();
    expect(resolveShortcut(k("z"))).toBeNull();
  });
});

describe("engine public entry", () => {
  it("exposes the editor, document, geometry, render and preflight APIs", () => {
    const names = [
      "createEditor",
      "resolveShortcut",
      "emptyDocument",
      "addElement",
      "DocumentHistory",
      "createSurfaces",
      "createSizer",
      "snapPlacement",
      "compose",
      "execute",
      "renderSurface",
      "ImageCache",
      "runPreflight",
      "PRINT_SWATCHES",
    ] as const;
    for (const name of names) expect(engine[name], name).toBeDefined();
  });

  it("does not expose test fixtures", () => {
    for (const name of ["bagM", "cup12oz", "textEl", "imageEl", "recordingCtx", "fakeMeasure"]) {
      expect(name in engine, name).toBe(false);
    }
  });
});
