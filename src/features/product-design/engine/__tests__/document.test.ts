// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  addElement,
  appendStroke,
  copySurface,
  duplicateElement,
  removeElement,
  reorderElement,
  setBackground,
  setBackgroundAll,
  updateElement,
} from "../document/commands";
import { emptyDocument, documentByteSize, migrateDocument } from "../document/factory";
import { DocumentHistory } from "../document/history";
import { PRINT_SWATCHES } from "../document/palette";
import {
  designDocumentSchema,
  elementSchema,
  hexSchema,
  MAX_DOCUMENT_BYTES,
  MAX_ELEMENTS_PER_SURFACE,
  PATTERN_IDS,
  surfaceContentSchema,
  type Background,
  type DesignDocument,
  type Stroke,
} from "../document/schema";
import { bagM, cup12oz, drawingEl, imageEl, textEl } from "./fixtures";

const stroke: Stroke = {
  mode: "draw",
  color: "#112233",
  sizeMm: 2,
  points: [
    [0, 0, 0.5],
    [1, 1, 0.6],
  ],
};

describe("design document schema", () => {
  it("parses a minimal document and normalises hex", () => {
    const doc = emptyDocument(cup12oz);
    const parsed = designDocumentSchema.parse({
      ...doc,
      surfaces: { BODY: { background: { kind: "color", color: "#ff0000" }, elements: [] } },
    });
    expect(parsed.surfaces.BODY!.background).toEqual({ kind: "color", color: "#FF0000" });
  });

  it("rejects more than 200 elements on a surface and unknown versions", () => {
    const many = Array.from({ length: 201 }, (_, i) => textEl(`t${i}`));
    expect(
      surfaceContentSchema.safeParse({ background: { kind: "none" }, elements: many }).success,
    ).toBe(false);
    expect(() => migrateDocument({ schemaVersion: 2 })).toThrow(
      "Unsupported design document version",
    );
  });

  it("exposes the document budgets and pattern ids", () => {
    expect(MAX_ELEMENTS_PER_SURFACE).toBe(200);
    expect(MAX_DOCUMENT_BYTES).toBe(1_000_000);
    expect(PATTERN_IDS).toEqual(["dots", "stripes", "checker", "waves", "grid", "chevron"]);
    const exactly200 = Array.from({ length: 200 }, (_, i) => textEl(`t${i}`));
    expect(
      surfaceContentSchema.safeParse({ background: { kind: "none" }, elements: exactly200 })
        .success,
    ).toBe(true);
  });

  it("accepts #RRGGBB in any case and rejects every other colour spelling", () => {
    expect(hexSchema.parse("#aBc09f")).toBe("#ABC09F");
    for (const bad of ["#fff", "ff0000", "#ff00000", "#gg0000", "red", ""]) {
      expect(hexSchema.safeParse(bad).success).toBe(false);
    }
  });

  it("discriminates elements on type and validates each kind", () => {
    const outlined = textEl("t", { outline: { color: "#ffffff", widthMm: 0.5 }, wrap: true });
    const parsedText = elementSchema.parse(outlined);
    expect(parsedText).toMatchObject({ type: "text", outline: { color: "#FFFFFF" }, wrap: true });
    expect(elementSchema.parse(imageEl("i")).type).toBe("image");
    expect(elementSchema.parse(drawingEl("d", { strokes: [stroke] })).type).toBe("drawing");
    expect(elementSchema.safeParse({ ...textEl("x"), type: "shape" }).success).toBe(false);
    expect(elementSchema.safeParse({ ...imageEl("x"), type: "text" }).success).toBe(false);
    expect(elementSchema.safeParse(textEl("x", { opacity: 1.5 })).success).toBe(false);
    expect(elementSchema.safeParse(imageEl("x", { widthMm: 0 })).success).toBe(false);
    expect(
      elementSchema.safeParse(drawingEl("x", { strokes: [{ ...stroke, mode: "paint" as never }] }))
        .success,
    ).toBe(false);
  });

  it("validates the three background kinds", () => {
    const wrap = (background: unknown) =>
      surfaceContentSchema.safeParse({ background, elements: [] }).success;
    expect(wrap({ kind: "none" })).toBe(true);
    expect(wrap({ kind: "color", color: "#00ff00" })).toBe(true);
    expect(
      wrap({
        kind: "pattern",
        patternId: "dots",
        colors: ["#000000", "#ffffff"],
        scale: 1,
        rotationDeg: 45,
      }),
    ).toBe(true);
    expect(
      wrap({
        kind: "pattern",
        patternId: "polka",
        colors: ["#000000", "#ffffff"],
        scale: 1,
        rotationDeg: 0,
      }),
    ).toBe(false);
    expect(
      wrap({ kind: "pattern", patternId: "dots", colors: ["#000000"], scale: 1, rotationDeg: 0 }),
    ).toBe(false);
    expect(wrap({ kind: "color", color: "red" })).toBe(false);
  });

  it("rejects surfaces that are not print areas", () => {
    const doc = emptyDocument(bagM);
    const surfaces = { ...doc.surfaces, TOP: { background: { kind: "none" }, elements: [] } };
    expect(designDocumentSchema.safeParse({ ...doc, surfaces }).success).toBe(false);
  });
});

describe("document factory", () => {
  it("creates an empty surface for every print area", () => {
    const cup = emptyDocument(cup12oz);
    expect(cup).toEqual({
      schemaVersion: 1,
      templateCode: "CUP12-BODY",
      sku: "CUP-PAPER-12OZ-WHT",
      surfaces: { BODY: { background: { kind: "none" }, elements: [] } },
    });

    const bag = emptyDocument(bagM);
    expect(Object.keys(bag.surfaces).sort()).toEqual(["BACK", "FRONT", "LEFT", "RIGHT"]);
    expect(bag.surfaces.FRONT).not.toBe(bag.surfaces.BACK);
    expect(designDocumentSchema.parse(bag)).toEqual(bag);
  });

  it("migrates a v1 document and rejects anything else", () => {
    const doc = emptyDocument(bagM);
    expect(migrateDocument(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
    for (const raw of [{ schemaVersion: 0 }, { schemaVersion: "1" }, {}, null, "1"]) {
      expect(() => migrateDocument(raw)).toThrow("Unsupported design document version");
    }
    expect(() => migrateDocument({ ...doc, surfaces: { FRONT: { elements: [] } } })).toThrow();
  });

  it("measures the serialised document in UTF-8 bytes", () => {
    const ascii = emptyDocument(bagM);
    expect(documentByteSize(ascii)).toBe(JSON.stringify(ascii).length);

    const vietnamese = addElement(ascii, "FRONT", textEl("a", { content: "Ly giấy 12oz" }));
    const json = JSON.stringify(vietnamese);
    expect(documentByteSize(vietnamese)).toBeGreaterThan(json.length);
    expect(documentByteSize(vietnamese)).toBe(Buffer.byteLength(json, "utf8"));
  });
});

describe("document commands", () => {
  it("changes only the touched surface", () => {
    const doc = emptyDocument(bagM);
    const next = addElement(doc, "FRONT", textEl("a"));
    expect(next.surfaces.BACK).toBe(doc.surfaces.BACK);
    expect(next.surfaces.FRONT!.elements.map((e) => e.id)).toEqual(["a"]);
  });

  it("duplicates with an offset, reorders and copies a surface with new ids", () => {
    let doc = addElement(
      addElement(emptyDocument(bagM), "FRONT", textEl("a")),
      "FRONT",
      textEl("b"),
    );
    doc = duplicateElement(doc, "FRONT", "a", "c");
    expect(doc.surfaces.FRONT!.elements.find((e) => e.id === "c")!.placement.u).toBe(
      textEl("a").placement.u + 5,
    );
    doc = reorderElement(doc, "FRONT", "b", 0);
    expect(doc.surfaces.FRONT!.elements[0]!.id).toBe("b");
    let n = 0;
    doc = copySurface(doc, "FRONT", "BACK", () => `n${++n}`);
    expect(doc.surfaces.BACK!.elements.map((e) => e.id)).toEqual(["n1", "n2", "n3"]);
  });

  it("adds at an index and appends by default", () => {
    let doc = addElement(emptyDocument(bagM), "FRONT", textEl("a"));
    doc = addElement(doc, "FRONT", textEl("b"));
    doc = addElement(doc, "FRONT", textEl("c"), 0);
    doc = addElement(doc, "FRONT", textEl("d"), 99);
    expect(doc.surfaces.FRONT!.elements.map((e) => e.id)).toEqual(["c", "a", "b", "d"]);
  });

  it("stops adding at the per-surface element cap and leaves the document untouched", () => {
    let doc = emptyDocument(bagM);
    for (let i = 0; i < MAX_ELEMENTS_PER_SURFACE; i++) {
      doc = addElement(doc, "FRONT", textEl(`t${i}`));
    }
    expect(doc.surfaces.FRONT!.elements).toHaveLength(MAX_ELEMENTS_PER_SURFACE);
    expect(addElement(doc, "FRONT", textEl("extra"))).toBe(doc);
    expect(duplicateElement(doc, "FRONT", "t0", "extra")).toBe(doc);
    expect(designDocumentSchema.safeParse(doc).success).toBe(true);
  });

  it("updates one element and keeps every other element and surface by reference", () => {
    const a = textEl("a");
    const b = textEl("b");
    const doc = addElement(addElement(emptyDocument(bagM), "FRONT", a), "FRONT", b);
    const next = updateElement(doc, "FRONT", "a", { opacity: 0.5, content: "Đã đổi" });
    const [na, nb] = next.surfaces.FRONT!.elements;
    expect(na).toMatchObject({ id: "a", type: "text", opacity: 0.5, content: "Đã đổi" });
    expect(nb).toBe(b);
    expect(next.surfaces.BACK).toBe(doc.surfaces.BACK);
    expect(doc.surfaces.FRONT!.elements[0]).toBe(a);
  });

  it("clears optional fields when a patch sets them to undefined", () => {
    const styled = textEl("a", { wrap: true, outline: { color: "#FFFFFF", widthMm: 0.5 } });
    const doc = addElement(emptyDocument(cup12oz), "BODY", styled);
    const next = updateElement(doc, "BODY", "a", { wrap: undefined, outline: undefined });
    const el = next.surfaces.BODY!.elements[0]!;
    expect("wrap" in el).toBe(false);
    expect("outline" in el).toBe(false);
    expect(el).toMatchObject({ id: "a", content: styled.content });
  });

  it("never lets a patch change an element's id or type", () => {
    const doc = addElement(emptyDocument(bagM), "FRONT", textEl("a"));
    const next = updateElement(doc, "FRONT", "a", { id: "z", type: "image" } as never);
    expect(next.surfaces.FRONT!.elements[0]).toMatchObject({ id: "a", type: "text" });
    expect(next).toBe(doc);
  });

  it("returns the same document for no-ops and unknown targets", () => {
    const doc = addElement(emptyDocument(bagM), "FRONT", textEl("a"));
    expect(updateElement(doc, "FRONT", "a", { opacity: 1 })).toBe(doc);
    expect(updateElement(doc, "FRONT", "missing", { opacity: 0.1 })).toBe(doc);
    expect(updateElement(doc, "BACK", "a", { opacity: 0.1 })).toBe(doc);
    expect(removeElement(doc, "FRONT", "missing")).toBe(doc);
    expect(reorderElement(doc, "FRONT", "missing", 0)).toBe(doc);
    expect(reorderElement(doc, "FRONT", "a", 0)).toBe(doc);
    expect(duplicateElement(doc, "FRONT", "missing", "x")).toBe(doc);
    expect(appendStroke(doc, "FRONT", "missing", stroke)).toBe(doc);
    expect(appendStroke(doc, "FRONT", "a", stroke)).toBe(doc); // "a" is text, not a drawing
    expect(copySurface(doc, "FRONT", "FRONT", () => "x")).toBe(doc);
  });

  it("removes an element and clamps reorder indexes", () => {
    let doc = ["a", "b", "c"].reduce(
      (acc, id) => addElement(acc, "FRONT", textEl(id)),
      emptyDocument(bagM),
    );
    doc = reorderElement(doc, "FRONT", "a", 99);
    expect(doc.surfaces.FRONT!.elements.map((e) => e.id)).toEqual(["b", "c", "a"]);
    doc = reorderElement(doc, "FRONT", "a", -5);
    expect(doc.surfaces.FRONT!.elements.map((e) => e.id)).toEqual(["a", "b", "c"]);
    doc = removeElement(doc, "FRONT", "b");
    expect(doc.surfaces.FRONT!.elements.map((e) => e.id)).toEqual(["a", "c"]);
  });

  it("inserts a duplicate directly above its source, offset 5 mm on both axes", () => {
    const doc = ["a", "b"].reduce(
      (acc, id) => addElement(acc, "FRONT", imageEl(id)),
      emptyDocument(bagM),
    );
    const next = duplicateElement(doc, "FRONT", "a", "a2");
    const elements = next.surfaces.FRONT!.elements;
    expect(elements.map((e) => e.id)).toEqual(["a", "a2", "b"]);
    expect(elements[1]).toMatchObject({
      type: "image",
      assetId: "asset-1",
      placement: { u: 135, v: 145, rotationDeg: 0, scale: 1 },
    });
    expect(elements[0]!.placement).toEqual({ u: 130, v: 140, rotationDeg: 0, scale: 1 });
  });

  it("sets a background on one surface or on all of them", () => {
    const doc = emptyDocument(bagM);
    const red: Background = { kind: "color", color: "#FF0000" };

    const one = setBackground(doc, "BACK", red);
    expect(one.surfaces.BACK!.background).toBe(red);
    expect(one.surfaces.FRONT).toBe(doc.surfaces.FRONT);
    expect(one.surfaces.LEFT).toBe(doc.surfaces.LEFT);

    const all = setBackgroundAll(doc, red);
    expect(Object.keys(all.surfaces).sort()).toEqual(["BACK", "FRONT", "LEFT", "RIGHT"]);
    for (const surface of Object.values(all.surfaces)) expect(surface.background).toBe(red);
    expect(doc.surfaces.FRONT!.background).toEqual({ kind: "none" });
  });

  it("copies a surface's background and elements and replaces the target", () => {
    const green: Background = { kind: "color", color: "#00FF00" };
    let doc = setBackground(addElement(emptyDocument(bagM), "FRONT", textEl("a")), "FRONT", green);
    doc = addElement(doc, "BACK", textEl("old"));
    const copied = copySurface(doc, "FRONT", "BACK", () => "n1");
    expect(copied.surfaces.BACK).toEqual({
      background: green,
      elements: [textEl("n1", { name: "Text a" })],
    });
    expect(copied.surfaces.FRONT).toBe(doc.surfaces.FRONT);
    expect(copied.surfaces.LEFT).toBe(doc.surfaces.LEFT);
  });

  it("appends strokes to the named drawing only", () => {
    const other = drawingEl("other");
    let doc = addElement(emptyDocument(bagM), "FRONT", drawingEl("d"));
    doc = addElement(doc, "FRONT", other);
    const next = appendStroke(doc, "FRONT", "d", stroke);
    const next2 = appendStroke(next, "FRONT", "d", { ...stroke, mode: "erase" });
    const [d, o] = next2.surfaces.FRONT!.elements;
    expect(d).toMatchObject({ strokes: [stroke, { mode: "erase" }] });
    expect(o).toBe(other);
    expect(doc.surfaces.FRONT!.elements[0]).toMatchObject({ strokes: [] });
    expect(designDocumentSchema.safeParse(next2).success).toBe(true);
  });

  it("keeps untouched surfaces by reference in every command", () => {
    const base = addElement(
      addElement(emptyDocument(bagM), "FRONT", textEl("a")),
      "FRONT",
      drawingEl("d"),
    );
    const results: DesignDocument[] = [
      addElement(base, "FRONT", textEl("n")),
      updateElement(base, "FRONT", "a", { hidden: true }),
      removeElement(base, "FRONT", "a"),
      reorderElement(base, "FRONT", "d", 0),
      duplicateElement(base, "FRONT", "a", "n"),
      setBackground(base, "FRONT", { kind: "color", color: "#FFFFFF" }),
      appendStroke(base, "FRONT", "d", stroke),
    ];
    for (const next of results) {
      expect(next).not.toBe(base);
      expect(next.surfaces.FRONT).not.toBe(base.surfaces.FRONT);
      for (const code of ["BACK", "LEFT", "RIGHT"] as const) {
        expect(next.surfaces[code]).toBe(base.surfaces[code]);
      }
    }
    const copied = copySurface(base, "FRONT", "LEFT", () => "n");
    expect(copied.surfaces.FRONT).toBe(base.surfaces.FRONT);
    expect(copied.surfaces.BACK).toBe(base.surfaces.BACK);
    expect(copied.surfaces.RIGHT).toBe(base.surfaces.RIGHT);
  });

  it("creates a surface the document lacks when an element is added to it", () => {
    const full = emptyDocument(bagM);
    const partial: DesignDocument = {
      ...full,
      surfaces: {
        FRONT: full.surfaces.FRONT!,
        LEFT: full.surfaces.LEFT!,
        RIGHT: full.surfaces.RIGHT!,
      },
    };
    expect(partial.surfaces.BACK).toBeUndefined();
    const next = addElement(partial, "BACK", textEl("a"));
    expect(next.surfaces.BACK).toEqual({ background: { kind: "none" }, elements: [textEl("a")] });
    expect(removeElement(partial, "BACK", "a")).toBe(partial);
  });
});

describe("document history", () => {
  it("undoes one gesture as one step and drops the oldest past the limit", () => {
    const h = new DocumentHistory(2);
    const d0 = emptyDocument(bagM);
    const d1 = addElement(d0, "FRONT", textEl("a"));
    const d2 = updateElement(d1, "FRONT", "a", { opacity: 0.5 });
    h.record(d0, "drag-1");
    h.record(d1, "drag-1");
    expect(h.undo(d2)).toBe(d0);
    expect(h.redo(d0)).toBe(d2);
    h.record(d0);
    h.record(d1);
    h.record(d2); // limit 2
    expect(h.undo(d2)).toBe(d2);
    expect(h.undo(d2)).toBe(d1);
    expect(h.undo(d1)).toBeNull();
  });

  it("reports canUndo/canRedo and returns null when there is nothing to do", () => {
    const h = new DocumentHistory();
    const d0 = emptyDocument(bagM);
    const d1 = addElement(d0, "FRONT", textEl("a"));
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
    expect(h.undo(d0)).toBeNull();
    expect(h.redo(d0)).toBeNull();

    h.record(d0);
    expect(h.canUndo).toBe(true);
    expect(h.undo(d1)).toBe(d0);
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(true);
    expect(h.redo(d0)).toBe(d1);
    expect(h.canRedo).toBe(false);
    expect(h.canUndo).toBe(true);
  });

  it("walks back through several steps and forward again", () => {
    const h = new DocumentHistory();
    const d0 = emptyDocument(bagM);
    const d1 = addElement(d0, "FRONT", textEl("a"));
    const d2 = addElement(d1, "FRONT", textEl("b"));
    const d3 = addElement(d2, "FRONT", textEl("c"));
    h.record(d0);
    h.record(d1);
    h.record(d2);
    expect(h.undo(d3)).toBe(d2);
    expect(h.undo(d2)).toBe(d1);
    expect(h.redo(d1)).toBe(d2);
    expect(h.redo(d2)).toBe(d3);
    expect(h.redo(d3)).toBeNull();
  });

  it("clears the redo stack on a new record", () => {
    const h = new DocumentHistory();
    const d0 = emptyDocument(bagM);
    const d1 = addElement(d0, "FRONT", textEl("a"));
    const d2 = addElement(d1, "FRONT", textEl("b"));
    h.record(d0);
    h.undo(d1);
    expect(h.canRedo).toBe(true);
    h.record(d0);
    expect(h.canRedo).toBe(false);
    expect(h.redo(d2)).toBeNull();
  });

  it("starts a new step for the same gesture id once an undo or redo has intervened", () => {
    const h = new DocumentHistory();
    const d0 = emptyDocument(bagM);
    const d1 = addElement(d0, "FRONT", textEl("a"));
    const d2 = addElement(d1, "FRONT", textEl("b"));
    h.record(d0, "g");
    h.record(d1, "g");
    expect(h.undo(d2)).toBe(d0);
    h.record(d0, "g"); // same id, but the previous gesture ended with the undo
    h.record(d1, "other");
    expect(h.undo(d2)).toBe(d1);
    expect(h.undo(d1)).toBe(d0);
    expect(h.canUndo).toBe(false);
  });

  it("does not merge calls without a gesture id", () => {
    const h = new DocumentHistory();
    const d0 = emptyDocument(bagM);
    const d1 = addElement(d0, "FRONT", textEl("a"));
    h.record(d0);
    h.record(d1);
    expect(h.undo(d1)).toBe(d1);
    expect(h.undo(d1)).toBe(d0);
  });

  it("forgets everything on clear", () => {
    const h = new DocumentHistory();
    const d0 = emptyDocument(bagM);
    const d1 = addElement(d0, "FRONT", textEl("a"));
    h.record(d0);
    h.undo(d1);
    expect(h.canRedo).toBe(true);
    h.clear();
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);

    h.record(d0, "g");
    h.clear();
    h.record(d0, "g"); // not merged into the pre-clear gesture
    expect(h.canUndo).toBe(true);
  });
});

describe("print swatches", () => {
  it("offers 12 distinct ink colours in normalised hex, including black and white", () => {
    expect(PRINT_SWATCHES).toHaveLength(12);
    expect(new Set(PRINT_SWATCHES).size).toBe(12);
    expect(PRINT_SWATCHES).toContain("#000000");
    expect(PRINT_SWATCHES).toContain("#FFFFFF");
    for (const color of PRINT_SWATCHES) expect(hexSchema.parse(color)).toBe(color);
  });
});
