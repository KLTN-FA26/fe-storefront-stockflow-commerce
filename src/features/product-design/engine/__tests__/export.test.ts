// @vitest-environment node
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFString,
  decodePDFRawStream,
} from "pdf-lib";
import { describe, expect, it } from "vitest";

import { emptyDocument } from "../document/factory";
import type { DesignDocument } from "../document/schema";
import { canonicalJson, documentChecksum } from "../export/checksum";
import { MAX_BAND_PIXELS, printBands } from "../export/print-bands";
import { pathBounds } from "../export/pdf-path";
import { ISO_COATED_V2, pdfxMetadata, type PrintProfiles } from "../export/pdfx";
import {
  buildPrintPdf,
  buildSheetPdf,
  PAGE_MARGIN_MM,
  printGuides,
  type PrintJob,
  type PrintPage,
} from "../export/print-pdf";
import { drawSlug, GUIDES_LAYER_NAME, printSlugLines, SLUG_HEIGHT_MM } from "../export/slug";
import { drawSpecSheet } from "../export/spec-sheet";
import { buildSpecSummary, specText } from "../export/summary";
import type { PathCmd } from "../geometry/types";
import { mmToPt } from "../geometry/units";
import type { PreflightReport } from "../preflight/types";
import { createSurfaces } from "../surfaces";
import { bagM, cup12oz, drawingEl, imageEl, PNG_1x1, recordingCtx, textEl } from "./fixtures";

const rectPath: PathCmd[] = [
  { c: "M", x: 0, y: 0 },
  { c: "L", x: 266, y: 0 },
  { c: "L", x: 266, y: 286 },
  { c: "L", x: 0, y: 286 },
  { c: "Z" },
];

const passReport: PreflightReport = { result: "Pass", issues: [] };

/** Stand-ins for the ICC profiles: the builder embeds them as they are. */
const PROFILES: PrintProfiles = {
  output: { ...ISO_COATED_V2, icc: Uint8Array.from([1, 2, 3, 4]) },
  rgb: Uint8Array.from([5, 6, 7]),
};
const CREATED_AT = new Date("2026-11-18T03:04:05.678Z");
const DOCUMENT_ID = "0123456789abcdef0123456789abcdef";

/** A page as the tests write it: guides and slug default to none and a 1 × 1 PNG. */
type PageInput = Omit<PrintPage, "guides" | "slug"> & Partial<Pick<PrintPage, "guides" | "slug">>;

/** A print job of `pages` with a fixed title, id, date and the stand-in profiles. */
const job = (pages: PageInput[], title = "Ly quán A"): PrintJob => ({
  title,
  documentId: DOCUMENT_ID,
  createdAt: CREATED_AT,
  profiles: PROFILES,
  pages: pages.map((page) => ({ guides: [], slug: PNG_1x1, ...page })),
});

/** A bag document with a mix of visible and hidden elements on FRONT, and a few on BACK. */
function sampleDocument(): DesignDocument {
  const doc = emptyDocument(bagM);
  doc.surfaces.FRONT = {
    background: {
      kind: "pattern",
      patternId: "dots",
      colors: ["#112233", "#445566"],
      scale: 1,
      rotationDeg: 0,
    },
    elements: [
      textEl("t1", {
        fontCode: "lobster",
        color: "#ff0000",
        outline: { color: "#0000ff", widthMm: 1 },
      }),
      textEl("t2", { fontCode: "be-vietnam-pro", color: "#FF0000" }),
      textEl("t3", { fontCode: "hidden-font", color: "#abcdef", hidden: true }),
      imageEl("i1"),
      drawingEl("d1", {
        strokes: [
          { mode: "draw", color: "#00FF00", sizeMm: 1, points: [[0, 0, 1]] },
          { mode: "erase", color: "#123456", sizeMm: 1, points: [[0, 0, 1]] },
        ],
      }),
    ],
  };
  doc.surfaces.BACK = { background: { kind: "color", color: "#FFFFFF" }, elements: [] };
  return doc;
}

/** 150 text elements in distinct colours and 200 preflight issues: far past the 4000-char budget. */
function bigDoc(result: PreflightReport["result"] = "Fail"): {
  doc: DesignDocument;
  report: PreflightReport;
} {
  const doc = emptyDocument(cup12oz);
  doc.surfaces.BODY = {
    background: { kind: "none" },
    elements: Array.from({ length: 150 }, (_, i) =>
      textEl(`t${i}`, {
        fontCode: i % 2 === 0 ? "lobster" : "be-vietnam-pro",
        color: `#${(i * 0x010203 + 0x101010).toString(16).padStart(6, "0")}`,
      }),
    ),
  };
  const report: PreflightReport = {
    result,
    issues: Array.from({ length: 200 }, (_, i) => ({
      ruleId: "CROSSES_SAFE_AREA" as const,
      level: "fail" as const,
      message: `Phần tử ${i} nằm sát mép vùng in`,
    })),
  };
  return { doc, report };
}

/** A bag with 200 distinctly coloured text elements on every face: the details alone pass 4000 chars. */
function hugeDoc(): DesignDocument {
  const doc = emptyDocument(bagM);
  Object.values(doc.surfaces).forEach((surface, face) => {
    surface.elements = Array.from({ length: 200 }, (_, i) =>
      textEl(`f${face}-${i}`, {
        color: `#${((face * 200 + i) * 0x010203 + 0x101010).toString(16).padStart(6, "0")}`,
      }),
    );
  });
  return doc;
}

describe("canonicalJson", () => {
  it("sorts object keys recursively, including integer-like keys, and keeps array order", () => {
    expect(canonicalJson({ b: [3, { y: 1, x: 2 }], a: null, 10: "ten", 9: "nine" })).toBe(
      '{"10":"ten","9":"nine","a":null,"b":[3,{"x":2,"y":1}]}',
    );
  });

  it("drops undefined properties like JSON does, so a stored and a fresh document agree", () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe(canonicalJson({ a: 1 }));
    expect(canonicalJson([undefined, 1])).toBe("[null,1]");
    expect(canonicalJson(undefined)).toBe("null");
  });
});

describe("documentChecksum", () => {
  it("hashes a document independent of key order", async () => {
    expect(await documentChecksum({ b: 1, a: 2 } as never)).toBe(
      await documentChecksum({ a: 2, b: 1 } as never),
    );
    expect(await documentChecksum(emptyDocument(bagM))).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is the SHA-256 of the canonical JSON", async () => {
    // sha256("{}")
    expect(await documentChecksum({} as never)).toBe(
      "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
    );
  });

  it("changes when the design changes", async () => {
    const a = sampleDocument();
    const b = sampleDocument();
    b.surfaces.FRONT!.elements.pop();
    expect(await documentChecksum(a)).not.toBe(await documentChecksum(b));
  });
});

describe("spec summary", () => {
  it("summarises within 4000 chars", () => {
    const { doc, report } = bigDoc();
    const text = specText(
      buildSpecSummary({
        name: "Ly quán A",
        template: cup12oz,
        document: doc,
        report,
        checksum: "ab".repeat(32),
      }),
    );
    expect(text.length).toBeLessThanOrEqual(4000);
    expect(text).toContain(cup12oz.sku);
    expect(text).toContain("Preflight: Fail");
  });

  const checksum = "ab".repeat(32);
  const sha = `SHA-256: ${checksum}`;

  it("cuts issue lines first, keeping every other line and marking the cut with a lone ellipsis", () => {
    const { doc, report } = bigDoc("Fail");
    const summary = buildSpecSummary({
      name: "Ly quán A",
      template: cup12oz,
      document: doc,
      report,
      checksum,
    });
    expect([summary.title, ...summary.lines].join("\n").length).toBeGreaterThan(4000);

    const lines = specText(summary).split("\n");
    expect(lines.join("\n").length).toBeLessThanOrEqual(4000);
    // Always kept: title, template, SKU, preflight result and the full checksum as the last line.
    expect(lines[0]).toBe("Ly quán A");
    expect(lines[1]).toBe(summary.lines[0]);
    expect(lines[2]).toBe(`SKU: ${cup12oz.sku}`);
    expect(lines).toContain("Preflight: Fail");
    expect(lines.at(-1)).toBe(sha);
    // The details were not touched: they come before the preflight line, unchanged.
    const preflight = lines.indexOf("Preflight: Fail");
    expect(lines.slice(1, preflight)).toEqual(summary.lines.slice(0, preflight - 1));
    // The leading issues survive, the trailing ones are gone, one `…` line sits where they were.
    const issues = lines.slice(preflight + 1, -1);
    expect(issues.at(-1)).toBe("…");
    expect(issues.slice(0, -1)).toEqual(
      summary.lines.slice(preflight, preflight + issues.length - 1),
    );
    expect(issues.length).toBeGreaterThan(2);
    expect(issues.length).toBeLessThan(200);
    expect(lines.filter((line) => line === "…")).toHaveLength(1);
  });

  it("cuts detail lines once the issues are gone, from the last (colours) back", () => {
    const summary = buildSpecSummary({
      name: "Túi quán B",
      template: bagM,
      document: hugeDoc(),
      report: bigDoc("Fail").report,
      checksum,
    });
    const text = specText(summary);
    const lines = text.split("\n");

    expect(text.length).toBeLessThanOrEqual(4000);
    expect(lines[0]).toBe("Túi quán B");
    expect(lines).toContain("Preflight: Fail");
    expect(lines.at(-1)).toBe(sha);
    // The colour line (thousands of chars on its own) is the first detail to go; areas stay.
    expect(lines.some((line) => line.startsWith("Màu sắc:"))).toBe(false);
    for (const area of bagM.printAreas) expect(text).toContain(`${area.name}: `);
    // Two cuts, two markers: one among the details, one in place of the issues.
    const preflight = lines.indexOf("Preflight: Fail");
    expect(lines.slice(1, preflight)).toContain("…");
    expect(lines.slice(preflight + 1, -1)).toEqual(["…"]);
  });

  it("leaves a summary that fits exactly as it was", () => {
    const summary = buildSpecSummary({
      name: "Túi quán B",
      template: bagM,
      document: sampleDocument(),
      report: passReport,
      checksum,
    });
    expect(specText(summary)).toBe([summary.title, ...summary.lines].join("\n"));
    expect(specText(summary)).not.toContain("…");
  });

  it("shortens the title, never the rest, when only the protected lines are left", () => {
    const summary = buildSpecSummary({
      name: "Ly ".repeat(2500),
      template: cup12oz,
      document: bigDoc().doc,
      report: bigDoc("Fail").report,
      checksum,
    });
    const text = specText(summary);
    const lines = text.split("\n");

    expect(text.length).toBeLessThanOrEqual(4000);
    expect(lines[0]!.endsWith("…")).toBe(true);
    expect(lines[0]!.startsWith("Ly Ly Ly")).toBe(true);
    expect(lines).toContain("Preflight: Fail");
    expect(lines.at(-1)).toBe(sha);
    expect(lines[2]).toBe(`SKU: ${cup12oz.sku}`);
  });

  it("keeps every line of a summary that does not mark any as trimmable", () => {
    const text = specText({ title: "Tiêu đề", lines: ["a".repeat(3000), "SHA-256: x"] });
    expect(text.length).toBeLessThanOrEqual(4000);
    expect(text.endsWith("SHA-256: x")).toBe(true);
    expect(text.startsWith("Tiêu")).toBe(true);
  });

  it("does not cut a text that fits", () => {
    const summary = { title: "Tiêu đề", lines: ["một", "hai"] };
    expect(specText(summary)).toBe("Tiêu đề\nmột\nhai");
  });

  it("never splits a surrogate pair when it cuts", () => {
    const text = specText({ title: "t", lines: ["😀".repeat(3000)] });
    expect(text.length).toBeLessThanOrEqual(4000);
    expect(text.endsWith("…")).toBe(true);
    // A lone surrogate would make the text invalid when sent to the backend.
    expect(text.isWellFormed()).toBe(true);
  });

  it("lists template, sku, areas, fonts, colours, preflight and checksum", () => {
    const report: PreflightReport = {
      result: "Fail",
      issues: [
        {
          ruleId: "DPI_BELOW_MIN",
          level: "fail",
          message: "Ảnh i1 chỉ đạt 250 DPI",
          surfaceCode: "FRONT",
          elementId: "i1",
        },
      ],
    };
    const summary = buildSpecSummary({
      name: "Túi quán B",
      template: bagM,
      document: sampleDocument(),
      report,
      checksum: "cd".repeat(32),
    });
    expect(summary.title).toBe("Túi quán B");
    expect(summary.lines).toEqual([
      "Mẫu: BAGM-4F – Túi kraft size M – in 4 mặt",
      "SKU: BAG-KRAFT-M",
      // Hidden elements are not printed, so they are not counted.
      "Mặt trước: 260 × 280 mm, 4 phần tử",
      "Mặt sau: 260 × 280 mm, 0 phần tử",
      "Hông trái: 120 × 280 mm, 0 phần tử",
      "Hông phải: 120 × 280 mm, 0 phần tử",
      "Phông chữ: be-vietnam-pro, lobster",
      "Màu sắc: #0000FF, #00FF00, #112233, #445566, #FF0000, #FFFFFF",
      "Preflight: Fail",
      "- Ảnh i1 chỉ đạt 250 DPI",
      `SHA-256: ${"cd".repeat(32)}`,
    ]);
  });

  it("states when there are no fonts or colours", () => {
    const summary = buildSpecSummary({
      name: "Trống",
      template: bagM,
      document: emptyDocument(bagM),
      report: passReport,
      checksum: "00".repeat(32),
    });
    expect(summary.lines).toContain("Phông chữ: không có");
    expect(summary.lines).toContain("Màu sắc: không có");
    expect(summary.lines).toContain("Preflight: Pass");
  });
});

/** The decoded content stream(s) of a page, as text. */
function pageContent(pdf: PDFDocument, index = 0): string {
  const contents = pdf.getPage(index).node.Contents();
  const streams =
    contents instanceof PDFArray
      ? contents.asArray().map((ref) => pdf.context.lookup(ref) as PDFRawStream)
      : [contents as PDFRawStream];
  return streams
    .map((stream) => Buffer.from(decodePDFRawStream(stream).decode()).toString("latin1"))
    .join("\n");
}

type PdfOp = { op: string; args: number[] };

/** The path operators between `/CutContour CS` and the stroke, as `{ op, args }`. */
function cutOperators(content: string): PdfOp[] {
  const start = content.indexOf("/CutContour CS");
  expect(start).toBeGreaterThanOrEqual(0);
  return content
    .slice(start)
    .split("\n")
    .map((line) => line.trim().split(/\s+/))
    .filter((tokens) => ["m", "l", "c", "h"].includes(tokens.at(-1) ?? ""))
    .map((tokens) => ({ op: tokens.at(-1)!, args: tokens.slice(0, -1).map(Number) }));
}

/** A cut path on a `widthMm × heightMm` page (default 100 × 100), as the PDF operators it produces. */
async function pathOperators(path: PathCmd[], widthMm = 100, heightMm = 100): Promise<PdfOp[]> {
  const bytes = await buildPrintPdf(
    job([
      { code: "FRONT", widthMm, heightMm, bands: [{ png: PNG_1x1, heightPx: 1 }], cutPath: path },
    ]),
  );
  return cutOperators(pageContent(await PDFDocument.load(bytes)));
}

/** Flat mm → PDF pt on a page `heightMm` tall (y flips: PDF y grows upwards). */
const toPdf = (x: number, y: number, heightMm: number): [number, number] => [
  mmToPt(x),
  mmToPt(heightMm) - mmToPt(y),
];

/** A coordinate as the content stream prints it (rounded to 1/10000 pt). */
const pt = (mm: number) => String(Math.round(mmToPt(mm) * 1e4) / 1e4);

function expectArgs(actual: number[], expected: number[]) {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((value, i) => expect(actual[i]).toBeCloseTo(value, 3));
}

describe("print PDF", () => {
  it("sizes the bleed box in pt, puts the slug under it and carries a CutContour cut path", async () => {
    const bytes = await buildPrintPdf(
      job([
        {
          code: "FRONT",
          widthMm: 266,
          heightMm: 286,
          bands: [{ png: PNG_1x1, heightPx: 1 }],
          cutPath: rectPath,
        },
      ]),
    );
    const pdf = await PDFDocument.load(bytes);
    const page = pdf.getPage(0);
    const [width, height, slug] = [(266 * 72) / 25.4, (286 * 72) / 25.4, mmToPt(SLUG_HEIGHT_MM)];
    expectArgs(Object.values(page.getBleedBox()), [0, 0, width, height]);
    // The MediaBox leaves blank paper around the bleed box, and the slug strip under it.
    const margin = mmToPt(PAGE_MARGIN_MM);
    expectArgs(Object.values(page.getMediaBox()), [
      -margin,
      -slug,
      width + 2 * margin,
      height + margin + slug,
    ]);
    expect(Buffer.from(bytes).toString("latin1")).toContain("/CutContour");
  });

  it("writes one page per area, each with its own size", async () => {
    const pages: PageInput[] = [
      {
        code: "FRONT",
        widthMm: 266,
        heightMm: 286,
        bands: [{ png: PNG_1x1, heightPx: 1 }],
        cutPath: rectPath,
      },
      {
        code: "LEFT",
        widthMm: 126,
        heightMm: 286,
        bands: [{ png: PNG_1x1, heightPx: 1 }],
        cutPath: rectPath,
      },
    ];
    const pdf = await PDFDocument.load(await buildPrintPdf(job(pages)));
    expect(pdf.getPageCount()).toBe(2);
    expect(pdf.getPage(1).getBleedBox().width).toBeCloseTo(mmToPt(126), 2);
    // The raster and the slug are on every page, each drawn as an image XObject.
    for (const index of [0, 1]) {
      const resources = pdf.getPage(index).node.Resources()!;
      const xObjects = resources.lookup(PDFName.of("XObject"), PDFDict);
      expect(xObjects.keys()).toHaveLength(2);
    }
  });

  it("registers a CutContour Separation colour space with a CMYK magenta tint", async () => {
    const pdf = await PDFDocument.load(
      await buildPrintPdf(
        job([
          {
            code: "FRONT",
            widthMm: 266,
            heightMm: 286,
            bands: [{ png: PNG_1x1, heightPx: 1 }],
            cutPath: rectPath,
          },
        ]),
      ),
    );
    const resources = pdf.getPage(0).node.Resources()!;
    const spaces = resources.lookup(PDFName.of("ColorSpace"), PDFDict);
    const separation = spaces.lookup(PDFName.of("CutContour"), PDFArray);

    expect(separation.size()).toBe(4);
    expect(separation.lookup(0, PDFName).decodeText()).toBe("Separation");
    expect(separation.lookup(1, PDFName).decodeText()).toBe("CutContour");
    expect(separation.lookup(2, PDFName).decodeText()).toBe("DeviceCMYK");
    const fn = separation.lookup(3, PDFDict);
    expect(fn.toString()).toBe(
      "<<\n/FunctionType 2\n/Domain [ 0 1 ]\n/C0 [ 0 0 0 0 ]\n/C1 [ 0 1 0 0 ]\n/N 1\n>>",
    );
  });

  it("overprints the cut line, so a RIP that skips it leaves no hairline in the artwork", async () => {
    const pdf = await PDFDocument.load(
      await buildPrintPdf(
        job([
          {
            code: "FRONT",
            widthMm: 266,
            heightMm: 286,
            bands: [{ png: PNG_1x1, heightPx: 1 }],
            cutPath: rectPath,
          },
        ]),
      ),
    );
    const resources = pdf.getPage(0).node.Resources()!;
    const state = resources
      .lookup(PDFName.of("ExtGState"), PDFDict)
      .lookup(PDFName.of("GSCut"), PDFDict);

    expect(state.toString()).toBe("<<\n/Type /ExtGState\n/OP true\n/op true\n/OPM 1\n>>");
    const content = pageContent(pdf);
    expect(content.indexOf("/GSCut gs")).toBeGreaterThan(-1);
    expect(content.indexOf("/GSCut gs")).toBeLessThan(content.indexOf("/CutContour CS"));
  });

  it("selects the spot colour and strokes the cut path at 0.25 pt inside q … Q", async () => {
    const pdf = await PDFDocument.load(
      await buildPrintPdf(
        job([
          {
            code: "FRONT",
            widthMm: 266,
            heightMm: 286,
            bands: [{ png: PNG_1x1, heightPx: 1 }],
            cutPath: rectPath,
          },
        ]),
      ),
    );
    const content = pageContent(pdf);
    const cut = content.slice(content.lastIndexOf("q\n", content.indexOf("/CutContour CS")));
    expect(cut.split("\n").filter(Boolean)).toEqual([
      "q",
      "/GSCut gs",
      "/CutContour CS",
      "1 SCN",
      "0.25 w",
      `0 ${pt(286)} m`,
      `${pt(266)} ${pt(286)} l`,
      `${pt(266)} 0 l`,
      "0 0 l",
      "h",
      "S",
      "Q",
    ]);
  });

  it("flips y into PDF space for a rect: the top-left corner is the top of the page", async () => {
    const ops = await pathOperators([
      { c: "M", x: 10, y: 20 },
      { c: "L", x: 30, y: 20 },
      { c: "Z" },
    ]);
    expectArgs(ops[0]!.args, toPdf(10, 20, 100));
    expectArgs(ops[1]!.args, toPdf(30, 20, 100));
    expect(ops[2]!.op).toBe("h");
  });

  it("approximates a 90° arc with one cubic Bézier", async () => {
    // Centre (50, 50), r 20, from angle 0 (+x) clockwise on screen to π/2 (+y, down).
    const ops = await pathOperators([
      { c: "A", cx: 50, cy: 50, r: 20, start: 0, end: Math.PI / 2, ccw: false },
    ]);
    const k = (4 / 3) * Math.tan(Math.PI / 8);
    expect(ops.map((o) => o.op)).toEqual(["m", "c"]);
    expectArgs(ops[0]!.args, toPdf(70, 50, 100));
    expectArgs(ops[1]!.args, [
      ...toPdf(70, 50 + k * 20, 100),
      ...toPdf(50 + k * 20, 70, 100),
      ...toPdf(50, 70, 100),
    ]);
  });

  it("goes counter-clockwise on screen for ccw, in segments of at most 90°", async () => {
    // 0 → π counter-clockwise visits the top of the circle (y = 30) before reaching (30, 50).
    const ops = await pathOperators([
      { c: "A", cx: 50, cy: 50, r: 20, start: 0, end: Math.PI, ccw: true },
    ]);
    expect(ops.map((o) => o.op)).toEqual(["m", "c", "c"]);
    const k = (4 / 3) * Math.tan(Math.PI / 8);
    expectArgs(ops[1]!.args, [
      ...toPdf(70, 50 - k * 20, 100),
      ...toPdf(50 + k * 20, 30, 100),
      ...toPdf(50, 30, 100),
    ]);
    expectArgs(ops[2]!.args.slice(4), toPdf(30, 50, 100));
  });

  it("wraps a clockwise sweep past 2π the way canvas does", async () => {
    // 3π/2 → π/2 clockwise is +π: (50, 30) → (70, 50) → (50, 70).
    const ops = await pathOperators([
      { c: "A", cx: 50, cy: 50, r: 20, start: 1.5 * Math.PI, end: 0.5 * Math.PI, ccw: false },
    ]);
    expect(ops.map((o) => o.op)).toEqual(["m", "c", "c"]);
    expectArgs(ops[0]!.args, toPdf(50, 30, 100));
    expectArgs(ops[1]!.args.slice(4), toPdf(70, 50, 100));
    expectArgs(ops[2]!.args.slice(4), toPdf(50, 70, 100));
  });

  it("draws a full circle for a sweep of 2π and four segments", async () => {
    const ops = await pathOperators([
      { c: "A", cx: 50, cy: 50, r: 20, start: 0, end: 2 * Math.PI, ccw: false },
    ]);
    expect(ops.map((o) => o.op)).toEqual(["m", "c", "c", "c", "c"]);
    expectArgs(ops[4]!.args.slice(4), toPdf(70, 50, 100));
  });

  it("joins an arc to the current point with a line, as canvas does", async () => {
    const ops = await pathOperators([
      { c: "M", x: 10, y: 10 },
      { c: "A", cx: 50, cy: 50, r: 20, start: 0, end: Math.PI / 2, ccw: false },
    ]);
    expect(ops.map((o) => o.op)).toEqual(["m", "l", "c"]);
    expectArgs(ops[1]!.args, toPdf(70, 50, 100));
  });

  it("traces a real cup sector exactly: corners match the unrolled dieline", async () => {
    const surface = createSurfaces(cup12oz).byCode.BODY!;
    const { width, height } = surface.flatBounds;
    const ops = await pathOperators(surface.outline("trim"), width, height);

    // Trim corners from the surface's own mapping: top-left, then the far end of the outer arc,
    // finally the inner arc closes back on the top-left's inner counterpart.
    const [u0, u1] = surface.uRange;
    const [v0, v1] = surface.vRange;
    const corner = (u: number, v: number) => {
      const p = surface.toFlat(u, v);
      return toPdf(p.x, p.y, height);
    };

    expect(ops[0]!.op).toBe("m");
    expectArgs(ops[0]!.args, corner(u0, v0));

    const line = ops.find((o) => o.op === "l")!;
    expectArgs(line.args, corner(u1, v1));

    const curves = ops.filter((o) => o.op === "c");
    expectArgs(curves.at(-1)!.args.slice(4), corner(u0, v1));
    expect(ops.at(-1)!.op).toBe("h");

    // One segment per arc (each sweeps ~0.88 rad), and every point the curve passes through lies
    // on its circle about the apex, on the page.
    expect(curves).toHaveLength(2);
    const arcs = surface.outline("trim").filter((cmd) => cmd.c === "A");
    const apex = toPdf(arcs[0]!.cx, arcs[0]!.cy, height);
    let from = [ops[0]!.args[0]!, ops[0]!.args[1]!] as const;
    for (const [i, curve] of ops.filter((o) => o.op !== "h").entries()) {
      if (curve.op === "l") {
        from = [curve.args[0]!, curve.args[1]!];
        continue;
      }
      if (curve.op !== "c") continue;
      const [x1, y1, x2, y2, x3, y3] = curve.args as [
        number,
        number,
        number,
        number,
        number,
        number,
      ];
      const radius = mmToPt(arcs[curves.indexOf(curve)]!.r);
      for (let t = 0; t <= 1; t += 0.05) {
        const m = 1 - t;
        const x = m ** 3 * from[0] + 3 * m * m * t * x1 + 3 * m * t * t * x2 + t ** 3 * x3;
        const y = m ** 3 * from[1] + 3 * m * m * t * y1 + 3 * m * t * t * y2 + t ** 3 * y3;
        // A cubic over ~50° strays from the circle by < 1e-5 of its radius (a flipped y or a wrong
        // direction would be off by hundreds of pt).
        const drift = Math.abs(Math.hypot(x - apex[0], y - apex[1]) - radius);
        expect(drift, `curve ${i} at t=${t}`).toBeLessThan(radius * 2e-5);
        expect(x).toBeGreaterThanOrEqual(-0.01);
        expect(x).toBeLessThanOrEqual(mmToPt(width) + 0.01);
        expect(y).toBeGreaterThanOrEqual(-0.01);
        expect(y).toBeLessThanOrEqual(mmToPt(height) + 0.01);
      }
      from = [x3, y3];
    }
  });

  it("refuses an empty page list rather than writing an unreadable PDF", async () => {
    await expect(buildPrintPdf(job([]))).rejects.toThrow(/at least one page/);
  });

  describe("a page drawn in bands (iOS canvas limit)", () => {
    /**
     * The `x y w h` of every image the page draws, in drawing order: pdf-lib translates, then
     * scales the unit image (`1 0 0 1 x y cm … w 0 0 h 0 0 cm … /Image Do`).
     */
    const imagePlacements = (content: string) =>
      [
        ...content.matchAll(
          /1 0 0 1 ([\d.e-]+) ([\d.e-]+) cm\s+(?:1 0 0 1 0 0 cm\s+)?([\d.e-]+) 0 0 ([\d.e-]+) 0 0 cm\s+(?:1 0 0 1 0 0 cm\s+)?\/[\w-]+ Do/g,
        ),
      ].map(([, x, y, w, h]) => [x, y, w, h].map(Number));

    it("stacks the bands from the top over the same page, with the same cut path", async () => {
      const [widthMm, heightMm] = [279.4, 444]; // a bag face at 300 DPI: 3300 × 5244 px, 17.3 MP
      const bands = [
        { png: PNG_1x1, heightPx: 2622 },
        { png: PNG_1x1, heightPx: 2622 },
      ];
      const page = (b: PrintPage["bands"]): PageInput => ({
        code: "FRONT",
        widthMm,
        heightMm,
        bands: b,
        cutPath: rectPath,
      });
      const banded = await PDFDocument.load(await buildPrintPdf(job([page(bands)])));
      const whole = await PDFDocument.load(
        await buildPrintPdf(job([page([{ png: PNG_1x1, heightPx: 5244 }])])),
      );

      expect(banded.getPage(0).getSize()).toEqual(whole.getPage(0).getSize());
      const [w, h] = [mmToPt(widthMm), mmToPt(heightMm)];
      const placements = imagePlacements(pageContent(banded));
      expect(placements).toHaveLength(3);
      expectArgs(placements[0]!, [0, h / 2, w, h / 2]); // the first band is the top half
      expectArgs(placements[1]!, [0, 0, w, h / 2]);
      // Last, the slug: as wide as the page, under the bleed box.
      const slug = mmToPt(SLUG_HEIGHT_MM);
      expectArgs(placements[2]!, [0, -slug, w, slug]);
      expectArgs(imagePlacements(pageContent(whole))[0]!, [0, 0, w, h]);
      expect(cutOperators(pageContent(banded))).toEqual(cutOperators(pageContent(whole)));
    });

    it("draws every band over its own share only, so translucent ink at a join keeps its opacity", async () => {
      const pdf = await PDFDocument.load(
        await buildPrintPdf(
          job([
            {
              code: "FRONT",
              widthMm: 100,
              heightMm: 100,
              bands: [
                { png: PNG_1x1, heightPx: 2 },
                { png: PNG_1x1, heightPx: 2 },
              ],
              cutPath: rectPath,
            },
          ]),
        ),
      );
      const [w, h] = [mmToPt(100), mmToPt(100)];
      const [top, bottom] = imagePlacements(pageContent(pdf));
      // Edge to edge: a row painted by two bands would blend a 50 % ink twice, into 75 %.
      expectArgs(top!, [0, h / 2, w, h / 2]);
      expectArgs(bottom!, [0, 0, w, h / 2]);
      expect(top![1]).toBeCloseTo(bottom![1]! + bottom![3]!, 9);
    });

    it("gives each band its share of the page by its rows", async () => {
      const pdf = await PDFDocument.load(
        await buildPrintPdf(
          job([
            {
              code: "FRONT",
              widthMm: 100,
              heightMm: 100,
              bands: [
                { png: PNG_1x1, heightPx: 3 },
                { png: PNG_1x1, heightPx: 1 },
              ],
              cutPath: rectPath,
            },
          ]),
        ),
      );
      const h = mmToPt(100);
      const [top, bottom] = imagePlacements(pageContent(pdf));
      expectArgs(top!, [0, h / 4, mmToPt(100), (3 * h) / 4]);
      expectArgs(bottom!, [0, 0, mmToPt(100), h / 4]);
    });
  });
});

/** `object` as the raw stream it must be (pdf-lib's typed `lookup` takes no stream class). */
function rawStream(object: unknown): PDFRawStream {
  expect(object).toBeInstanceOf(PDFRawStream);
  return object as PDFRawStream;
}

describe("print PDF/X-4", () => {
  const cup = createSurfaces(cup12oz).byCode.BODY!;
  const cupPage = (overrides: Partial<PageInput> = {}): PageInput => ({
    code: "BODY",
    widthMm: cup.flatBounds.width,
    heightMm: cup.flatBounds.height,
    bands: [{ png: PNG_1x1, heightPx: 1 }],
    cutPath: cup.outline("trim"),
    guides: printGuides(cup.guides()),
    ...overrides,
  });
  const load = async (pages: PageInput[] = [cupPage()], title?: string) => {
    const bytes = await buildPrintPdf(job(pages, title));
    // Loading must not stamp a new ModDate: the test reads the dates the file was written with.
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
    return { raw: Buffer.from(bytes).toString("latin1"), pdf };
  };

  it("draws a vector page instead of its bands: its content, images, alphas and layers", async () => {
    const vector = {
      content: "/OC /VL0 BDC\nq\n/VGs0 gs\n/VIm0 Do\nQ\nEMC",
      images: [PNG_1x1],
      alphas: [0.5],
      layers: ["1 · Ảnh / logo"],
    };
    const { pdf } = await load([cupPage({ bands: [], vector })]);
    const page = pdf.getPage(0).node;
    const resources = page.Resources()!;
    const sub = (key: string) => resources.lookup(PDFName.of(key), PDFDict);
    const image = rawStream(sub("XObject").lookup(PDFName.of("VIm0")));
    expect(image.dict.lookup(PDFName.of("ColorSpace"), PDFArray).lookup(0)).toBe(
      PDFName.of("ICCBased"),
    );
    expect(sub("ExtGState").lookup(PDFName.of("VGs0"), PDFDict).get(PDFName.of("ca"))).toEqual(
      PDFNumber.of(0.5),
    );
    expect(sub("ColorSpace").get(PDFName.of("VCs"))).toBeDefined();
    expect(sub("Properties").get(PDFName.of("VL0"))).toBeDefined();
    // The art is the page's first content stream: the slug, guides and cut line come after it.
    const contents = page.Contents();
    expect(contents).toBeInstanceOf(PDFArray);
    const first = rawStream(pdf.context.lookup((contents as PDFArray).get(0)));
    expect(new TextDecoder().decode(decodePDFRawStream(first).decode())).toBe(vector.content);
  });

  it("refuses a page with neither bands nor vectors", async () => {
    await expect(load([cupPage({ bands: [] })])).rejects.toThrow(/needs its raster/);
  });

  it("declares PDF 1.6, the version PDF/X-4 is built on", async () => {
    const { raw } = await load();
    expect(raw.startsWith("%PDF-1.6")).toBe(true);
  });

  it("names the CMYK printing condition and embeds its profile as the OutputIntent", async () => {
    const { pdf } = await load();
    const intents = pdf.catalog.lookup(PDFName.of("OutputIntents"), PDFArray);
    expect(intents.size()).toBe(1);
    const intent = intents.lookup(0, PDFDict);
    const text = (key: string) => intent.lookup(PDFName.of(key), PDFString).decodeText();
    expect(intent.lookup(PDFName.of("S"))).toBe(PDFName.of("GTS_PDFX"));
    expect(text("OutputConditionIdentifier")).toBe("FOGRA39");
    expect(text("Info")).toBe("ISO Coated v2 (ECI)");
    expect(text("RegistryName")).toBe("http://www.color.org");
    const profile = rawStream(intent.lookup(PDFName.of("DestOutputProfile")));
    expect(profile.dict.lookup(PDFName.of("N"), PDFNumber).asNumber()).toBe(4);
    expect([...decodePDFRawStream(profile).decode()]).toEqual([1, 2, 3, 4]);
  });

  it("writes the XMP packet with the PDF/X version, and Info entries that agree with it", async () => {
    const { pdf } = await load([cupPage()], "Ly <quán> & A");
    const metadata = rawStream(pdf.catalog.lookup(PDFName.of("Metadata")));
    expect(metadata.dict.has(PDFName.of("Filter"))).toBe(false);
    const xmp = new TextDecoder().decode(metadata.getContents());
    expect(xmp).toContain("<pdfxid:GTS_PDFXVersion>PDF/X-4</pdfxid:GTS_PDFXVersion>");
    expect(xmp).toContain('<rdf:li xml:lang="x-default">Ly &#60;quán&#62; &#38; A</rdf:li>');
    expect(xmp).toContain("<xmp:CreateDate>2026-11-18T03:04:05Z</xmp:CreateDate>");
    expect(xmp).toContain("<xmp:ModifyDate>2026-11-18T03:04:05Z</xmp:ModifyDate>");
    expect(xmp).toContain("<pdf:Trapped>False</pdf:Trapped>");
    expect(xmp).toContain(
      "<xmpMM:DocumentID>uuid:01234567-89ab-cdef-0123-456789abcdef</xmpMM:DocumentID>",
    );
    expect(xmp).toContain("<xmpMM:VersionID>1</xmpMM:VersionID>");
    expect(xmp).toContain("<xmpMM:RenditionClass>default</xmpMM:RenditionClass>");

    expect(pdf.getTitle()).toBe("Ly <quán> & A");
    expect(pdf.getCreationDate()).toEqual(new Date("2026-11-18T03:04:05Z"));
    expect(pdf.getModificationDate()).toEqual(new Date("2026-11-18T03:04:05Z"));
    const info = pdf.context.lookup(pdf.context.trailerInfo.Info, PDFDict);
    expect(info.lookup(PDFName.of("Trapped"))).toBe(PDFName.of("False"));
    expect(xmp).toContain(`<pdf:Producer>${pdf.getProducer()}</pdf:Producer>`);
  });

  it("keeps the XMP packet well-formed: one packet, escaped title", () => {
    const xmp = pdfxMetadata({
      title: `"A" & 'B'`,
      documentId: DOCUMENT_ID,
      createdAt: CREATED_AT,
    });
    expect(xmp.match(/<\?xpacket /g)).toHaveLength(2);
    expect(xmp).toContain(">&#34;A&#34; &#38; &#39;B&#39;<");
  });

  it("sets the trailer /ID from the document id, and refuses an id that is not 32 hex digits", async () => {
    const { pdf } = await load();
    const id = pdf.context.trailerInfo.ID as PDFArray;
    expect(id.size()).toBe(2);
    for (const i of [0, 1]) expect(id.lookup(i, PDFHexString).asString()).toBe(DOCUMENT_ID);
    await expect(buildPrintPdf({ ...job([cupPage()]), documentId: "not-an-id" })).rejects.toThrow(
      /32-hex-digit/,
    );
  });

  it("tags every image with the sRGB profile (ICCBased), never DeviceRGB", async () => {
    const { pdf, raw } = await load();
    expect(raw).not.toContain("/DeviceRGB");
    const xObjects = pdf.getPage(0).node.Resources()!.lookup(PDFName.of("XObject"), PDFDict);
    const spaces = xObjects.keys().map((key) => {
      const image = rawStream(xObjects.lookup(key));
      return image.dict.lookup(PDFName.of("ColorSpace"), PDFArray);
    });
    expect(spaces).toHaveLength(2); // the raster and the slug
    for (const space of spaces) {
      expect(space.lookup(0)).toBe(PDFName.of("ICCBased"));
      const profile = space.lookup(1, PDFRawStream);
      expect(profile.dict.lookup(PDFName.of("N"), PDFNumber).asNumber()).toBe(3);
      expect([...decodePDFRawStream(profile).decode()]).toEqual([5, 6, 7]);
    }
    // One profile object, shared by every image.
    expect(spaces[0]!.get(1)).toBe(spaces[1]!.get(1));
  });

  it("boxes a cup page: TrimBox around the trim sector, inside the BleedBox", async () => {
    const { pdf } = await load();
    const page = pdf.getPage(0);
    const { width, height } = cup.flatBounds;

    // The trim sector sampled finely through the surface's own mapping: its two arcs end to end.
    const [u0, u1] = cup.uRange;
    const [v0, v1] = cup.vRange;
    const points = Array.from({ length: 4001 }, (_, i) => u0 + ((u1 - u0) * i) / 4000).flatMap(
      (u) => [cup.toFlat(u, v0), cup.toFlat(u, v1)],
    );
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const sampled = {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    };
    const bounds = pathBounds(cup.outline("trim"));
    for (const key of ["x", "y", "width", "height"] as const) {
      expect(bounds[key]).toBeCloseTo(sampled[key], 3);
    }

    const trim = page.getTrimBox();
    expectArgs(
      [trim.x, trim.y, trim.width, trim.height],
      [
        mmToPt(bounds.x),
        mmToPt(height - bounds.y - bounds.height),
        mmToPt(bounds.width),
        mmToPt(bounds.height),
      ],
    );
    const bleed = page.getBleedBox();
    expectArgs(
      [bleed.x, bleed.y, bleed.width, bleed.height],
      [0, 0, mmToPt(width), mmToPt(height)],
    );
    expect(trim.x).toBeGreaterThan(bleed.x);
    expect(trim.y).toBeGreaterThan(bleed.y);
    expect(trim.x + trim.width).toBeLessThan(bleed.x + bleed.width);
    expect(trim.y + trim.height).toBeLessThan(bleed.y + bleed.height);
  });

  it("puts the safe area and the seam on a layer that is off, so the press never prints them", async () => {
    const { pdf } = await load();
    const properties = pdf.catalog.lookup(PDFName.of("OCProperties"), PDFDict);
    const layer = properties.lookup(PDFName.of("OCGs"), PDFArray).get(0);
    const ocg = pdf.context.lookup(layer, PDFDict);
    expect(ocg.lookup(PDFName.of("Type"))).toBe(PDFName.of("OCG"));
    expect(ocg.lookup(PDFName.of("Name"), PDFHexString).decodeText()).toBe(GUIDES_LAYER_NAME);
    const defaults = properties.lookup(PDFName.of("D"), PDFDict);
    expect(defaults.lookup(PDFName.of("Name"), PDFHexString).decodeText()).toBe("Mặc định");
    expect(defaults.lookup(PDFName.of("OFF"), PDFArray).asArray()).toEqual([layer]);
    expect(defaults.has(PDFName.of("AS"))).toBe(false); // PDF/X-4 forbids auto-state

    const resources = pdf.getPage(0).node.Resources()!;
    expect(resources.lookup(PDFName.of("Properties"), PDFDict).get(PDFName.of("OCGuides"))).toBe(
      layer,
    );
    const content = pageContent(pdf);
    const [begin, end] = [content.indexOf("/OC /OCGuides BDC"), content.indexOf("EMC")];
    expect(begin).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(begin);
    // The cut line is drawn after the layer ends: it stays on the printed page.
    expect(content.indexOf("/CutContour CS")).toBeGreaterThan(end);
    const guides = content.slice(begin, end).split("\n");
    expect(guides).toContain("1 0 0 0 K");
    expect(guides).toContain("0.5 w");
    // The safe area dashed, then the seam solid: one stroke each.
    expect(guides.filter((line) => line.endsWith(" d"))).toEqual(["[ 4 2 ] 0 d", "[ ] 0 d"]);
    expect(guides.filter((line) => line === "S")).toHaveLength(2);
  });

  it("writes no layer when no page has guides", async () => {
    const { pdf } = await load([cupPage({ guides: [] })]);
    expect(pdf.catalog.has(PDFName.of("OCProperties"))).toBe(false);
    expect(pageContent(pdf)).not.toContain("BDC");
  });

  it("takes a surface's guides without its bleed and trim (they are the boxes and the cut)", () => {
    expect(printGuides(cup.guides()).map((guide) => guide.kind)).toEqual(["safe", "seam"]);
  });
});

describe("print slug", () => {
  const info = {
    title: "Ly quán A",
    sku: "CUP-PAPER-12OZ-WHT",
    version: 7,
    exportedAt: "18 thg 11, 2026 10:04",
    checksum: "ab".repeat(32),
    profileName: "ISO Coated v2 (ECI)",
  };

  it("names the job, the page with its sizes, and how to see its guide layer", () => {
    const lines = printSlugLines(info, {
      code: "BODY",
      name: "Thân ly",
      page: 1,
      pages: 1,
      trimMm: { width: 279.6649, height: 120.8531 },
      bleedMm: 3,
      seamMm: 8,
      guideKinds: ["safe", "seam", "safe"],
    });
    expect(lines).toEqual([
      "Ly quán A · SKU CUP-PAPER-12OZ-WHT · Phiên bản 7 · Xuất 18 thg 11, 2026 10:04 · SHA-256 abababababababab",
      "Vùng in Thân ly (BODY) · Trang 1/1 · Thành phẩm 279,7 × 120,9 mm · Lề tràn 3 mm · Mép dán 8 mm · PDF/X-4, ISO Coated v2 (ECI)",
      `Bật lớp “${GUIDES_LAYER_NAME}” trong trình xem PDF để xem: nét đứt = vùng an toàn, nét liền = mép dán`,
    ]);
  });

  it("leaves out the seam and the legend when the page has neither", () => {
    const lines = printSlugLines(info, {
      code: "FRONT",
      name: "Mặt trước",
      page: 2,
      pages: 4,
      trimMm: { width: 280, height: 444.25 },
      bleedMm: 2.5,
      guideKinds: [],
    });
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe(
      "Vùng in Mặt trước (FRONT) · Trang 2/4 · Thành phẩm 280 × 444,3 mm · Lề tràn 2,5 mm · PDF/X-4, ISO Coated v2 (ECI)",
    );
  });

  it("draws each line from the margin in the caller's ink, inside save … restore", () => {
    const rec = recordingCtx({ glyphWidth: (text) => [...text].length });
    drawSlug(rec.ctx, ["một", "hai"], 100, 1, { ink: "ink" });
    const drawn = rec.calls.filter(([m]) => m === "fillText");
    expect(drawn).toEqual([
      ["fillText", "một", 3, 1.6],
      ["fillText", "hai", 3, 1.6 + 3.6],
    ]);
    expect(rec.sets.fillStyle).toEqual(["ink"]);
    expect(rec.calls[0]![0]).toBe("save");
    expect(rec.calls.at(-1)![0]).toBe("restore");
    // Both lines fit: set at the full size, 2.4 mm.
    expect((rec.sets.font as string[]).every((font) => font.includes(" 2.4px "))).toBe(true);
  });

  it("sets a line too wide for the strip smaller, then cuts it with …", () => {
    // 1 px per char at 1 px per mm: a 46 mm strip leaves 40 px between the margins.
    const rec = recordingCtx({ glyphWidth: (text) => [...text].length });
    drawSlug(rec.ctx, ["x".repeat(60)], 46, 1, { ink: "ink" });
    const [, text] = rec.calls.find(([m]) => m === "fillText")!;
    expect(text).toBe(`${"x".repeat(39)}…`);
    expect((rec.sets.font as string[]).at(-1)).toContain(" 1.6px ");
  });
});

describe("printBands", () => {
  it("draws a page within the limit as one band", () => {
    expect(printBands(3000, 4000)).toEqual([{ y0Px: 0, heightPx: 4000 }]);
  });

  it("splits a page over 16 MP into even bands, edge to edge, no row drawn twice", () => {
    const bands = printBands(3300, 5244); // 17.3 MP
    expect(bands).toEqual([
      { y0Px: 0, heightPx: 2622 },
      { y0Px: 2622, heightPx: 2622 },
    ]);
    expect(bands.every(({ heightPx }) => 3300 * heightPx <= MAX_BAND_PIXELS)).toBe(true);
  });

  it("covers every row exactly once, whatever the size, each canvas within the limit", () => {
    for (const [width, height] of [
      [4000, 4001],
      [8192, 8192],
      [12_000, 9_999],
      [1, 50_000_000],
    ] as const) {
      const bands = printBands(width, height);
      let next = 0;
      for (const band of bands) {
        expect(Object.keys(band).toSorted()).toEqual(["heightPx", "y0Px"]);
        expect(band.y0Px).toBe(next);
        expect(width * band.heightPx).toBeLessThanOrEqual(MAX_BAND_PIXELS);
        next += band.heightPx;
      }
      expect(next).toBe(height);
    }
  });
});

describe("sheet PDF", () => {
  it("defaults to A4 and draws the PNG as an image", async () => {
    const pdf = await PDFDocument.load(await buildSheetPdf(PNG_1x1));
    expect(pdf.getPageCount()).toBe(1);
    const { width, height } = pdf.getPage(0).getSize();
    expect(width).toBeCloseTo(mmToPt(210), 2);
    expect(height).toBeCloseTo(mmToPt(297), 2);
    const xObjects = pdf.getPage(0).node.Resources()!.lookup(PDFName.of("XObject"), PDFDict);
    expect(xObjects.keys()).toHaveLength(1);
  });

  it("takes a custom page size", async () => {
    const pdf = await PDFDocument.load(await buildSheetPdf(PNG_1x1, 148, 210));
    const { width, height } = pdf.getPage(0).getSize();
    expect(width).toBeCloseTo(mmToPt(148), 2);
    expect(height).toBeCloseTo(mmToPt(210), 2);
  });
});

describe("drawSpecSheet", () => {
  const summary = { title: "Ly quán A", lines: ["Mẫu: CUP12-BODY", "SKU: CUP-PAPER-12OZ-WHT"] };

  it("draws the title and every line in the caller's ink with generic fonts", () => {
    const rec = recordingCtx();
    drawSpecSheet(rec.ctx, summary, 2, { ink: "ink-colour" });

    const texts = rec.calls.filter(([m]) => m === "fillText").map((c) => c[1]);
    expect(texts).toEqual(["Ly quán A", "Mẫu: CUP12-BODY", "SKU: CUP-PAPER-12OZ-WHT"]);
    expect(rec.sets.fillStyle).toEqual(["ink-colour"]);
    for (const font of rec.sets.font as string[]) expect(font).toContain("sans-serif");
  });

  it("scales the margin and type with pxPerMm and starts below the top margin", () => {
    const at = (pxPerMm: number) => {
      const rec = recordingCtx();
      drawSpecSheet(rec.ctx, summary, pxPerMm, { ink: "ink" });
      return rec.calls.find(([m]) => m === "fillText") as [string, string, number, number];
    };
    const [, , x1, y1] = at(1);
    const [, , x2, y2] = at(4);
    expect(x2).toBeCloseTo(x1 * 4, 6);
    expect(y2).toBeCloseTo(y1 * 4, 6);
    expect(x1).toBeGreaterThan(0);
  });

  it("restores the context so the caller's state is untouched", () => {
    const rec = recordingCtx();
    drawSpecSheet(rec.ctx, summary, 2, { ink: "ink" });
    expect(rec.calls[0]![0]).toBe("save");
    expect(rec.calls.at(-1)![0]).toBe("restore");
  });

  it("wraps a long line on spaces at the page's text width", () => {
    // 1 px per char, 1 px per mm: the 210 mm page leaves 180 mm for text.
    const rec = recordingCtx({ glyphWidth: (text) => [...text].length });
    const words = Array.from({ length: 60 }, () => "abcdefghi").join(" "); // 599 chars
    drawSpecSheet(rec.ctx, { title: "T", lines: [words] }, 1, { ink: "ink" });
    const lines = rec.calls.filter(([m]) => m === "fillText").map((c) => String(c[1]));
    expect(lines.slice(1).join(" ")).toBe(words);
    for (const line of lines) expect([...line].length).toBeLessThanOrEqual(180);
    expect(lines.length).toBeGreaterThan(3);
  });

  it("breaks a token that is wider than the page instead of running off it", () => {
    const rec = recordingCtx({ glyphWidth: (text) => [...text].length });
    drawSpecSheet(rec.ctx, { title: "T", lines: ["x".repeat(500)] }, 1, { ink: "ink" });
    const lines = rec.calls.filter(([m]) => m === "fillText").map((c) => String(c[1]));
    expect(lines.slice(1).join("")).toBe("x".repeat(500));
    for (const line of lines) expect([...line].length).toBeLessThanOrEqual(180);
  });

  it("stops at the bottom margin with an ellipsis when the text is too long", () => {
    const rec = recordingCtx();
    const lines = Array.from({ length: 500 }, (_, i) => `dòng ${i}`);
    drawSpecSheet(rec.ctx, { title: "T", lines }, 1, { ink: "ink", heightMm: 100 });
    const drawn = rec.calls.filter(([m]) => m === "fillText") as [string, string, number, number][];
    expect(drawn.length).toBeLessThan(50);
    expect(drawn.at(-1)![1]).toBe("…");
    // Nothing is drawn below the page.
    for (const [, , , y] of drawn) expect(y).toBeLessThan(100);
  });
});
