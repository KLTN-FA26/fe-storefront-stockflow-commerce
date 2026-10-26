// @vitest-environment node
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { emptyDocument } from "../document/factory";
import type { DesignDocument } from "../document/schema";
import { canonicalJson, documentChecksum } from "../export/checksum";
import { BAND_OVERLAP_PX, MAX_BAND_PIXELS, printBands } from "../export/print-bands";
import { buildPrintPdf, buildSheetPdf, type PrintPage } from "../export/print-pdf";
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
function bigDoc(result: PreflightReport["result"] = "Warning"): {
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
      level: "warning" as const,
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
    expect(text).toContain("Preflight: Warning");
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
      result: "Warning",
      issues: [
        {
          ruleId: "DPI_LOW",
          level: "warning",
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
      "Preflight: Warning",
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
  const bytes = await buildPrintPdf([
    { code: "FRONT", widthMm, heightMm, bands: [{ png: PNG_1x1, heightPx: 1 }], cutPath: path },
  ]);
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
  it("sizes print pages in pt and carries a CutContour cut path", async () => {
    const bytes = await buildPrintPdf([
      {
        code: "FRONT",
        widthMm: 266,
        heightMm: 286,
        bands: [{ png: PNG_1x1, heightPx: 1 }],
        cutPath: rectPath,
      },
    ]);
    const pdf = await PDFDocument.load(bytes);
    const { width, height } = pdf.getPage(0).getSize();
    expect(width).toBeCloseTo((266 * 72) / 25.4, 2);
    expect(height).toBeCloseTo((286 * 72) / 25.4, 2);
    expect(Buffer.from(bytes).toString("latin1")).toContain("/CutContour");
  });

  it("writes one page per area, each with its own size", async () => {
    const pages: PrintPage[] = [
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
    const pdf = await PDFDocument.load(await buildPrintPdf(pages));
    expect(pdf.getPageCount()).toBe(2);
    expect(pdf.getPage(1).getSize().width).toBeCloseTo(mmToPt(126), 2);
    // The PNG is on every page, drawn as an image XObject.
    for (const index of [0, 1]) {
      const resources = pdf.getPage(index).node.Resources()!;
      const xObjects = resources.lookup(PDFName.of("XObject"), PDFDict);
      expect(xObjects.keys()).toHaveLength(1);
    }
  });

  it("registers a CutContour Separation colour space with a CMYK magenta tint", async () => {
    const pdf = await PDFDocument.load(
      await buildPrintPdf([
        {
          code: "FRONT",
          widthMm: 266,
          heightMm: 286,
          bands: [{ png: PNG_1x1, heightPx: 1 }],
          cutPath: rectPath,
        },
      ]),
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
      await buildPrintPdf([
        {
          code: "FRONT",
          widthMm: 266,
          heightMm: 286,
          bands: [{ png: PNG_1x1, heightPx: 1 }],
          cutPath: rectPath,
        },
      ]),
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
      await buildPrintPdf([
        {
          code: "FRONT",
          widthMm: 266,
          heightMm: 286,
          bands: [{ png: PNG_1x1, heightPx: 1 }],
          cutPath: rectPath,
        },
      ]),
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
    await expect(buildPrintPdf([])).rejects.toThrow(/at least one page/);
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
      const page = (b: PrintPage["bands"]): PrintPage => ({
        code: "FRONT",
        widthMm,
        heightMm,
        bands: b,
        cutPath: rectPath,
      });
      const banded = await PDFDocument.load(await buildPrintPdf([page(bands)]));
      const whole = await PDFDocument.load(
        await buildPrintPdf([page([{ png: PNG_1x1, heightPx: 5244 }])]),
      );

      expect(banded.getPage(0).getSize()).toEqual(whole.getPage(0).getSize());
      const [w, h] = [mmToPt(widthMm), mmToPt(heightMm)];
      const placements = imagePlacements(pageContent(banded));
      expect(placements).toHaveLength(2);
      expectArgs(placements[0]!, [0, h / 2, w, h / 2]); // the first band is the top half
      expectArgs(placements[1]!, [0, 0, w, h / 2]);
      expectArgs(imagePlacements(pageContent(whole))[0]!, [0, 0, w, h]);
      expect(cutOperators(pageContent(banded))).toEqual(cutOperators(pageContent(whole)));
    });

    it("draws a band's overlap row into the next band's share, under it (no hairline, N5)", async () => {
      const pdf = await PDFDocument.load(
        await buildPrintPdf([
          {
            code: "FRONT",
            widthMm: 100,
            heightMm: 100,
            bands: [
              { png: PNG_1x1, heightPx: 2, overlapPx: 1 },
              { png: PNG_1x1, heightPx: 2 },
            ],
            cutPath: rectPath,
          },
        ]),
      );
      const [w, h] = [mmToPt(100), mmToPt(100)];
      const [top, bottom] = imagePlacements(pageContent(pdf));
      // The top band is 3 rows tall from the top edge: its own 2 and the next band's first row.
      expectArgs(top!, [0, h / 4, w, (3 * h) / 4]);
      // The bottom band keeps its share and is drawn after, over the repeated row.
      expectArgs(bottom!, [0, 0, w, h / 2]);
    });

    it("gives each band its share of the page by its rows", async () => {
      const pdf = await PDFDocument.load(
        await buildPrintPdf([
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
      );
      const h = mmToPt(100);
      const [top, bottom] = imagePlacements(pageContent(pdf));
      expectArgs(top!, [0, h / 4, mmToPt(100), (3 * h) / 4]);
      expectArgs(bottom!, [0, 0, mmToPt(100), h / 4]);
    });
  });
});

describe("printBands", () => {
  it("draws a page within the limit as one band, with no overlap", () => {
    expect(printBands(3000, 4000)).toEqual([{ y0Px: 0, heightPx: 4000, overlapPx: 0 }]);
  });

  it("splits a page over 16 MP into even bands that overlap the next by one row", () => {
    const bands = printBands(3300, 5244); // 17.3 MP
    expect(bands).toEqual([
      { y0Px: 0, heightPx: 2622, overlapPx: BAND_OVERLAP_PX },
      { y0Px: 2622, heightPx: 2622, overlapPx: 0 },
    ]);
    expect(
      bands.every(({ heightPx, overlapPx }) => 3300 * (heightPx + overlapPx) <= MAX_BAND_PIXELS),
    ).toBe(true);
  });

  it("covers every row once, whatever the size, each canvas within the limit", () => {
    for (const [width, height] of [
      [4000, 4001],
      [8192, 8192],
      [12_000, 9_999],
      [1, 50_000_000],
    ] as const) {
      const bands = printBands(width, height);
      let next = 0;
      for (const [i, { y0Px, heightPx, overlapPx }] of bands.entries()) {
        expect(y0Px).toBe(next);
        expect(width * (heightPx + overlapPx)).toBeLessThanOrEqual(MAX_BAND_PIXELS);
        expect(overlapPx).toBe(i < bands.length - 1 ? BAND_OVERLAP_PX : 0);
        next += heightPx;
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
