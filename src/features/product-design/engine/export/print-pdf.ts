import type { PDFDocument as PdfDocument, PDFPage } from "pdf-lib";

import type { PathCmd } from "../geometry/types";
import { mmToPt } from "../geometry/units";
import type { PrintAreaCode } from "../template/schema";
import { pathToPdf } from "./pdf-path";
import { A4_HEIGHT_MM, A4_WIDTH_MM } from "./spec-sheet";

/**
 * A horizontal slice of a page's raster, as a PNG: `heightPx` rows of its own, then `overlapPx`
 * rows that the next band draws over again (`BAND_OVERLAP_PX`, none for the last band).
 */
export type PrintBand = { png: Uint8Array; heightPx: number; overlapPx?: number };

/** One print area ready for the press: its raster, the page size, and the die-cut line over it. */
export type PrintPage = {
  code: PrintAreaCode;
  /** Page size: the bleed box of the surface, in mm. The raster covers all of it. */
  widthMm: number;
  heightMm: number;
  /**
   * The raster, top to bottom (one band, or several where a canvas could not hold the whole page):
   * each spans the page's width and a share of its height in proportion to its rows.
   */
  bands: PrintBand[];
  /** The trim outline in the same flat mm space as the raster (`PrintSurface.outline("trim")`). */
  cutPath: PathCmd[];
};

/**
 * The spot colour the press's cutter reads: a Separation named `CutContour` that falls back to
 * 100 % magenta (CMYK `0 1 0 0`) for viewers that cannot print spot colours.
 */
const CUT_COLOR_NAME = "CutContour";
const CUT_LINE_PT = 0.25;
/**
 * The cut line overprints (Q11): a RIP that cuts along the `CutContour` separation and leaves it
 * unprinted must not find a white hairline knocked out of the artwork beneath it. `OPM 1` keeps the
 * process inks under the line as they are.
 */
const CUT_GRAPHICS_STATE = "GSCut";
/** Coordinates are written to 1/10000 pt (~3.5 nm): exact for printing, and short in the stream. */
const COORDINATE_SCALE = 1e4;

/**
 * Plain objects, no object streams: older prepress RIPs and preflight tools that cannot open
 * compressed object streams still read the file, and the spot colour name stays visible in the raw bytes.
 */
const SAVE_OPTIONS = { useObjectStreams: false } as const;

/** Appends a page `widthMm × heightMm` (in pt) with `png` stretched over all of it. */
async function addPngPage(
  pdf: PdfDocument,
  png: Uint8Array,
  widthMm: number,
  heightMm: number,
): Promise<PDFPage> {
  const [width, height] = [mmToPt(widthMm), mmToPt(heightMm)];
  const page = pdf.addPage([width, height]);
  page.drawImage(await pdf.embedPng(png), { x: 0, y: 0, width, height });
  return page;
}

/**
 * A page `widthMm × heightMm` (in pt) with the bands stacked over it from the top, each as wide as
 * the page and as tall as its share of the rows: the page and its raster are those of one PNG. A
 * band's overlap rows reach into the next band's share, which is drawn after it, over them.
 */
async function addBandedPage(
  pdf: PdfDocument,
  bands: PrintBand[],
  widthMm: number,
  heightMm: number,
): Promise<PDFPage> {
  const [width, height] = [mmToPt(widthMm), mmToPt(heightMm)];
  const page = pdf.addPage([width, height]);
  const rows = bands.reduce((sum, band) => sum + band.heightPx, 0);
  let top = 0;
  for (const band of bands) {
    const share = (height * band.heightPx) / rows;
    const drawn = (height * (band.heightPx + (band.overlapPx ?? 0))) / rows;
    // PDF y grows upwards: a band's bottom edge is the page height less its top and its height.
    page.drawImage(await pdf.embedPng(band.png), {
      x: 0,
      y: height - top - drawn,
      width,
      height: drawn,
    });
    top += share;
  }
  return page;
}

/** One page per print area, each `widthMm × heightMm` with its raster over it and the cut line on top. */
export async function buildPrintPdf(pages: PrintPage[]): Promise<Uint8Array> {
  if (pages.length === 0) throw new Error("A print PDF needs at least one page");
  const { PDFDocument, PDFName, PDFNumber, PDFOperator, PDFOperatorNames, PDFDict } =
    await import("pdf-lib");

  const pdf = await PDFDocument.create();
  const { context } = pdf;
  const cutColorSpace = context.register(
    context.obj([
      "Separation",
      CUT_COLOR_NAME,
      "DeviceCMYK",
      { FunctionType: 2, Domain: [0, 1], C0: [0, 0, 0, 0], C1: [0, 1, 0, 0], N: 1 },
    ]),
  );
  const cutGraphicsState = context.register(
    context.obj({ Type: "ExtGState", OP: true, op: true, OPM: 1 }),
  );
  const num = (value: number) =>
    PDFNumber.of(Math.round(value * COORDINATE_SCALE) / COORDINATE_SCALE);
  const op = PDFOperator.of;
  const names = PDFOperatorNames;
  const pathOperators = {
    m: names.MoveTo,
    l: names.LineTo,
    c: names.AppendBezierCurve,
    h: names.ClosePath,
  };

  for (const { widthMm, heightMm, bands, cutPath } of pages) {
    if (bands.length === 0) throw new Error("A print page needs its raster");
    const page = await addBandedPage(pdf, bands, widthMm, heightMm);

    // `/Resources /ColorSpace` and `/ExtGState` are not dictionaries pdf-lib creates on demand.
    const { Resources: resources } = page.node.normalizedEntries();
    const resourceDict = (key: string) => {
      const existing = resources.lookupMaybe(PDFName.of(key), PDFDict);
      if (existing) return existing;
      const created = context.obj({});
      resources.set(PDFName.of(key), created);
      return created;
    };
    resourceDict("ColorSpace").set(PDFName.of(CUT_COLOR_NAME), cutColorSpace);
    resourceDict("ExtGState").set(PDFName.of(CUT_GRAPHICS_STATE), cutGraphicsState);

    page.pushOperators(
      op(names.PushGraphicsState),
      op(names.SetGraphicsStateParams, [PDFName.of(CUT_GRAPHICS_STATE)]),
      op(names.StrokingColorspace, [PDFName.of(CUT_COLOR_NAME)]),
      op(names.StrokingColorN, [num(1)]),
      op(names.SetLineWidth, [num(CUT_LINE_PT)]),
      ...pathToPdf(cutPath, heightMm).map(({ op: name, args }) =>
        op(pathOperators[name], args.map(num)),
      ),
      op(names.StrokePath),
      op(names.PopGraphicsState),
    );
  }
  return pdf.save(SAVE_OPTIONS);
}

/**
 * A single page `widthMm × heightMm` (A4 by default) with `png` over all of it: the technical-spec
 * sheet, rasterised by the caller at the page's aspect ratio.
 */
export async function buildSheetPdf(
  png: Uint8Array,
  widthMm = A4_WIDTH_MM,
  heightMm = A4_HEIGHT_MM,
): Promise<Uint8Array> {
  const { PDFDocument } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  await addPngPage(pdf, png, widthMm, heightMm);
  return pdf.save(SAVE_OPTIONS);
}
