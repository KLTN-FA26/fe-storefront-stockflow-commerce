import { describe, expect, it } from "vitest";
import { emptyDocument } from "../document/factory";
import { retargetDocument } from "../document/retarget";
import { designDocumentSchema, type DesignDocument, type DesignElement } from "../document/schema";
import { createSurfaces, cupSector } from "../surfaces";
import type { CupModel, CustomizationTemplate, PrintArea } from "../template/schema";
import { bagM, cup12oz, drawingEl, imageEl, textEl } from "./fixtures";

const cupModel = cup12oz.model as CupModel;

/** A bigger conical cup (taller, wider), its print shape derived from `cupSector`. */
function bigCup(): CustomizationTemplate {
  const model: CupModel = { ...cupModel, topDiameterMm: 100, bottomDiameterMm: 65, heightMm: 135 };
  const s = cupSector(model);
  const area: PrintArea = {
    ...cup12oz.printAreas[0]!,
    shape: {
      type: "annular-sector",
      innerRadiusMm: s.innerRadiusMm,
      outerRadiusMm: s.outerRadiusMm,
      sweepRad: s.sweepRad,
      seamMm: model.seamMm,
    },
  };
  return { ...cup12oz, code: "CUP16-BODY", sku: "CUP-PAPER-16OZ-WHT", model, printAreas: [area] };
}

/** A bag of another size: faces 300 x 340 mm and gussets 140 x 340 mm. */
function bagL(): CustomizationTemplate {
  const resize = (a: PrintArea): PrintArea => ({
    ...a,
    widthMm: a.widthMm === 260 ? 300 : 140,
    heightMm: 340,
  });
  return { ...bagM, code: "BAGL-4F", sku: "BAG-KRAFT-L", printAreas: bagM.printAreas.map(resize) };
}

const surfaceOf = (t: CustomizationTemplate, code: PrintArea["code"]) =>
  createSurfaces(t).byCode[code]!;

function docWith(
  template: CustomizationTemplate,
  code: PrintArea["code"],
  elements: DesignElement[],
): DesignDocument {
  const doc = emptyDocument(template);
  doc.surfaces[code] = { background: { kind: "color", color: "#112233" }, elements };
  return doc;
}

const at = (u: number, v: number, scale = 1) => ({ u, v, rotationDeg: 0, scale });
const first = (doc: DesignDocument, code: PrintArea["code"]) => doc.surfaces[code]!.elements[0]!;
const mid = (r: [number, number]) => (r[0] + r[1]) / 2;
const span = (r: [number, number]) => r[1] - r[0];

describe("retargetDocument on rect surfaces", () => {
  const to = bagL();
  const fromS = surfaceOf(bagM, "FRONT");
  const toS = surfaceOf(to, "FRONT");

  it("sets the target template code and sku and keeps the background", () => {
    const { document } = retargetDocument(docWith(bagM, "FRONT", []), bagM, to);
    expect(document.templateCode).toBe(to.code);
    expect(document.sku).toBe(to.sku);
    expect(document.surfaces.FRONT!.background).toEqual({ kind: "color", color: "#112233" });
  });

  it("keeps a centred element centred", () => {
    const el = textEl("t", { placement: at(mid(fromS.uRange), mid(fromS.vRange)) });
    const { document } = retargetDocument(docWith(bagM, "FRONT", [el]), bagM, to);
    expect(first(document, "FRONT").placement.u).toBeCloseTo(mid(toS.uRange), 6);
    expect(first(document, "FRONT").placement.v).toBeCloseTo(mid(toS.vRange), 6);
  });

  it("keeps an element at a quarter of the width at a quarter", () => {
    const el = textEl("t", { placement: at(fromS.uRange[0] + span(fromS.uRange) / 4, 140) });
    const { document } = retargetDocument(docWith(bagM, "FRONT", [el]), bagM, to);
    expect(first(document, "FRONT").placement.u).toBeCloseTo(
      toS.uRange[0] + span(toS.uRange) / 4,
      6,
    );
  });

  it("multiplies scale by s = min of the two size ratios and leaves sizes alone", () => {
    const el = textEl("t", { sizePt: 24, placement: at(130, 140, 1.5) });
    const { document } = retargetDocument(docWith(bagM, "FRONT", [el]), bagM, to);
    const s = Math.min(300 / 260, 340 / 280);
    const out = first(document, "FRONT");
    expect(out.placement.scale).toBeCloseTo(1.5 * s, 9);
    expect(out.type === "text" && out.sizePt).toBe(24);
  });

  it("leaves drawing stroke points untouched", () => {
    const strokes = [
      {
        mode: "draw" as const,
        color: "#000000" as const,
        sizeMm: 2,
        points: [
          [0, 0, 0.5],
          [10, 5, 0.5],
        ] satisfies [number, number, number][],
      },
    ];
    const doc = docWith(bagM, "FRONT", [drawingEl("d", { strokes })]);
    const out = first(retargetDocument(doc, bagM, to).document, "FRONT");
    expect(out.type === "drawing" && out.strokes).toEqual(strokes);
  });

  it("drops elements of print areas the target lacks and counts them", () => {
    const noSides: CustomizationTemplate = {
      ...to,
      printAreas: to.printAreas.filter((a) => a.code === "FRONT" || a.code === "BACK"),
    };
    const doc = emptyDocument(bagM);
    doc.surfaces.LEFT = { background: { kind: "none" }, elements: [textEl("a"), textEl("b")] };
    doc.surfaces.RIGHT = { background: { kind: "none" }, elements: [textEl("c")] };
    doc.surfaces.FRONT = { background: { kind: "none" }, elements: [textEl("d")] };
    const result = retargetDocument(doc, bagM, noSides);
    expect(result.dropped).toBe(3);
    expect(Object.keys(result.document.surfaces).toSorted()).toEqual(["BACK", "FRONT"]);
    expect(result.document.surfaces.FRONT!.elements).toHaveLength(1);
  });

  it("clamps an element past the edge into the print range", () => {
    const el = textEl("t", { placement: at(fromS.uRange[1] + 40, fromS.vRange[0] - 30) });
    const { document } = retargetDocument(docWith(bagM, "FRONT", [el]), bagM, to);
    const p = first(document, "FRONT").placement;
    expect(p.u).toBeCloseTo(toS.uRange[1], 6);
    expect(p.v).toBeCloseTo(toS.vRange[0], 6);
  });

  it("returns to the original position after small to large to small", () => {
    const el = imageEl("i", { placement: at(77.3, 201.9, 0.8) });
    const there = retargetDocument(docWith(bagM, "FRONT", [el]), bagM, to).document;
    const p = first(retargetDocument(there, to, bagM).document, "FRONT").placement;
    expect(Math.abs(p.u - 77.3)).toBeLessThan(0.01);
    expect(Math.abs(p.v - 201.9)).toBeLessThan(0.01);
  });

  it("produces a document the schema accepts", () => {
    const doc = docWith(bagM, "FRONT", [textEl("t"), imageEl("i"), drawingEl("d")]);
    const { document } = retargetDocument(doc, bagM, to);
    expect(designDocumentSchema.safeParse(document).success).toBe(true);
  });

  it("does not mutate its input", () => {
    const doc = docWith(bagM, "FRONT", [textEl("t")]);
    const copy = structuredClone(doc);
    retargetDocument(doc, bagM, to);
    expect(doc).toEqual(copy);
  });
});

describe("retargetDocument on sector surfaces", () => {
  const to = bigCup();
  const fromS = surfaceOf(cup12oz, "BODY");
  const toS = surfaceOf(to, "BODY");

  it("uses sector surfaces for both cups", () => {
    expect(fromS.kind).toBe("sector");
    expect(toS.kind).toBe("sector");
  });

  it("keeps the angular fraction and the radial fraction", () => {
    const el = textEl("t", {
      placement: at(
        fromS.uRange[0] + 0.3 * span(fromS.uRange),
        fromS.vRange[0] + 0.7 * span(fromS.vRange),
      ),
    });
    const { document } = retargetDocument(docWith(cup12oz, "BODY", [el]), cup12oz, to);
    const p = first(document, "BODY").placement;
    expect((p.u - toS.uRange[0]) / span(toS.uRange)).toBeCloseTo(0.3, 6);
    expect((p.v - toS.vRange[0]) / span(toS.vRange)).toBeCloseTo(0.7, 6);
  });

  it("scales by the smaller of the two range ratios", () => {
    const el = imageEl("i", { placement: at(100, 160, 1) });
    const { document } = retargetDocument(docWith(cup12oz, "BODY", [el]), cup12oz, to);
    const s = Math.min(
      span(toS.uRange) / span(fromS.uRange),
      span(toS.vRange) / span(fromS.vRange),
    );
    expect(first(document, "BODY").placement.scale).toBeCloseTo(s, 9);
  });

  it("keeps wrap on wrapped text", () => {
    const el = textEl("t", { wrap: true, placement: at(100, 160) });
    const { document } = retargetDocument(docWith(cup12oz, "BODY", [el]), cup12oz, to);
    expect(first(document, "BODY").wrap).toBe(true);
  });

  it("keeps an element at the far corner inside the range", () => {
    const el = textEl("t", { wrap: true, placement: at(fromS.uRange[1], fromS.vRange[1]) });
    const p = first(
      retargetDocument(docWith(cup12oz, "BODY", [el]), cup12oz, to).document,
      "BODY",
    ).placement;
    expect(p.u).toBeLessThanOrEqual(toS.uRange[1] + 1e-9);
    expect(p.v).toBeLessThanOrEqual(toS.vRange[1] + 1e-9);
  });

  it("clamps an element placed beyond the band into the target range", () => {
    const el = textEl("t", {
      wrap: true,
      placement: at(fromS.uRange[1] + 40, fromS.vRange[0] - 30),
    });
    const { document } = retargetDocument(docWith(cup12oz, "BODY", [el]), cup12oz, to);
    const p = first(document, "BODY").placement;
    expect(p.u).toBeCloseTo(toS.uRange[1], 6);
    expect(p.v).toBeCloseTo(toS.vRange[0], 6);
  });

  it("round-trips a position within 0.01 mm", () => {
    const u = fromS.uRange[0] + 0.37 * span(fromS.uRange);
    const v = fromS.vRange[0] + 0.62 * span(fromS.vRange);
    const el = textEl("t", { wrap: true, placement: at(u, v) });
    const there = retargetDocument(docWith(cup12oz, "BODY", [el]), cup12oz, to).document;
    const p = first(retargetDocument(there, to, cup12oz).document, "BODY").placement;
    expect(Math.abs(p.u - u)).toBeLessThan(0.01);
    expect(Math.abs(p.v - v)).toBeLessThan(0.01);
  });

  it("produces a document the schema accepts", () => {
    const doc = docWith(cup12oz, "BODY", [textEl("t", { wrap: true }), drawingEl("d")]);
    const { document } = retargetDocument(doc, cup12oz, to);
    expect(designDocumentSchema.safeParse(document).success).toBe(true);
  });
});

describe("retargetDocument edge cases", () => {
  it("gives an empty surface to a target area the document lacks", () => {
    const doc = docWith(bagM, "FRONT", [textEl("t")]);
    delete doc.surfaces.BACK;
    const { document, dropped } = retargetDocument(doc, bagM, bagL());
    expect(dropped).toBe(0);
    expect(document.surfaces.BACK).toEqual({ background: { kind: "none" }, elements: [] });
  });

  it("centres on an axis whose source range has no length", () => {
    const flat: CustomizationTemplate = {
      ...bagM,
      printAreas: bagM.printAreas.map((a) => (a.code === "FRONT" ? { ...a, widthMm: 0 } : a)),
    };
    const to = bagL();
    const toS = surfaceOf(to, "FRONT");
    const el = textEl("t", { placement: at(0, 140) });
    const { document } = retargetDocument(docWith(flat, "FRONT", [el]), flat, to);
    const p = first(document, "FRONT").placement;
    expect(Number.isFinite(p.scale)).toBe(true);
    expect(p.u).toBeCloseTo(mid(toS.uRange), 6);
  });
});
