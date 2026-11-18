import type { PDFDocument as PdfDocument, PDFPage, PDFRef } from "pdf-lib";

import type { PathCmd } from "../geometry/types";
import { mmToPt } from "../geometry/units";
import type { Guide } from "../surfaces/types";
import type { PrintAreaCode } from "../template/schema";
import { pathBounds, pathToPdf } from "./pdf-path";
import {
  asPdf16,
  makePdfx,
  srgbColorSpace,
  tagSrgb,
  type PdfxInfo,
  type PrintProfiles,
} from "./pdfx";
import { GUIDES_LAYER_NAME, SLUG_HEIGHT_MM, type PrintGuideKind } from "./slug";
import { A4_HEIGHT_MM, A4_WIDTH_MM } from "./spec-sheet";
import { addVectorArt, resourceDict, type VectorPage } from "./vector-page";

/** A horizontal slice of a page's raster, as a PNG of its own `heightPx` rows (`printBands`). */
export type PrintBand = { png: Uint8Array; heightPx: number };

/** A guide line on the non-printing layer, in the raster's flat mm. */
export type PrintGuide = { kind: PrintGuideKind; path: PathCmd[] };

/** One print area ready for the press: its raster, the die-cut line over it, its guides and slug. */
export type PrintPage = {
  code: PrintAreaCode;
  /** The bleed box of the surface, in mm: the raster covers all of it. */
  widthMm: number;
  heightMm: number;
  /**
   * The raster, top to bottom (one band, or several where a canvas could not hold the whole page):
   * each spans the page's width and a share of its height in proportion to its rows. Unused (and
   * may be empty) when the page has `vector` art.
   */
  bands: PrintBand[];
  /** The artwork as vectors, each element on its own layer: drawn instead of `bands`. */
  vector?: VectorPage;
  /** The trim outline in the same flat mm space as the raster (`PrintSurface.outline("trim")`). */
  cutPath: PathCmd[];
  /** Safe area, seam and creases (`PrintSurface.guides()` without bleed and trim). */
  guides: PrintGuide[];
  /** The slug, a PNG `widthMm × SLUG_HEIGHT_MM` drawn under the bleed box. */
  slug: Uint8Array;
};

/** The whole print file: its pages, the profiles it embeds and what identifies it. */
export type PrintJob = PdfxInfo & { profiles: PrintProfiles; pages: PrintPage[] };

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
/**
 * Blank paper around the bleed box on the left, right and top (the slug strip is the bottom
 * margin): the page is not cut to the artwork, and the press has room for its own marks. The press
 * sheet itself is the printer's (imposition onto its die layout); the file stays one-up.
 */
export const PAGE_MARGIN_MM = 5;
/** The guides' optional-content tag in a page's `/Properties`. */
const GUIDES_TAG = "OCGuides";
const GUIDE_LINE_PT = 0.5;
/** Guides are 100 % cyan, told apart by their dash (pt): the slug's legend names them. */
const GUIDE_CMYK = [1, 0, 0, 0];
const GUIDE_DASH: Record<PrintGuideKind, number[]> = {
  safe: [4, 2],
  seam: [],
  crease: [6, 2, 1, 2],
};
/** Coordinates are written to 1/10000 pt (~3.5 nm): exact for printing, and short in the stream. */
const COORDINATE_SCALE = 1e4;

/**
 * Plain objects, no object streams: older prepress RIPs and preflight tools that cannot open
 * compressed object streams still read the file, and the spot colour name stays visible in the raw bytes.
 */
const SAVE_OPTIONS = { useObjectStreams: false } as const;

type PdfLib = typeof import("pdf-lib");

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
 * A page whose BleedBox is `widthMm × heightMm` (in pt) from the origin, with `PAGE_MARGIN_MM` of
 * blank paper on the left, right and top, the slug strip under it (the MediaBox reaches down to
 * `−SLUG_HEIGHT_MM`) and the TrimBox around the cut path. The artwork is the page's vectors, else its
 * bands stacked from the top, each as wide as the bleed box and as tall as its share of the rows;
 * bands meet edge to edge and never cover each other, so every row is painted once (`BandRows`).
 * Returns the page and the optional-content groups of its vector layers.
 */
async function addPrintPage(
  pdf: PdfDocument,
  lib: PdfLib,
  srgb: PDFRef,
  { bands, vector, widthMm, heightMm, cutPath, slug }: PrintPage,
): Promise<{ page: PDFPage; layers: PDFRef[] }> {
  const [width, height, slugHeight, margin] = [
    widthMm,
    heightMm,
    SLUG_HEIGHT_MM,
    PAGE_MARGIN_MM,
  ].map(mmToPt) as [number, number, number, number];
  const page = pdf.addPage([width, height]);
  page.setMediaBox(-margin, -slugHeight, width + 2 * margin, height + margin + slugHeight);
  page.setBleedBox(0, 0, width, height);
  const trim = pathBounds(cutPath);
  page.setTrimBox(
    mmToPt(trim.x),
    height - mmToPt(trim.y + trim.height),
    mmToPt(trim.width),
    mmToPt(trim.height),
  );

  const draw = async (png: Uint8Array, y: number, h: number) => {
    const image = await pdf.embedPng(png);
    await tagSrgb(pdf, lib, image, srgb);
    page.drawImage(image, { x: 0, y, width, height: h });
  };
  let layers: PDFRef[] = [];
  if (vector) {
    layers = await addVectorArt(pdf, lib, page, srgb, vector);
  } else {
    const rows = bands.reduce((sum, band) => sum + band.heightPx, 0);
    let top = 0;
    for (const band of bands) {
      const share = (height * band.heightPx) / rows;
      // PDF y grows upwards: a band's bottom edge is the page height less its top and its height.
      await draw(band.png, height - top - share, share);
      top += share;
    }
  }
  await draw(slug, -slugHeight, slugHeight);
  return { page, layers };
}

/**
 * The print file (PDF/X-4, ISO 15930-7): one page per print area, each with its raster over the
 * bleed box (sRGB, converted by the RIP to the OutputIntent), the slug under it, the guides on a
 * layer that is off (so never printed) and the `CutContour` line on top.
 */
export async function buildPrintPdf(job: PrintJob): Promise<Uint8Array> {
  const { pages, profiles } = job;
  if (pages.length === 0) throw new Error("A print PDF needs at least one page");
  const lib = await import("pdf-lib");
  const { PDFDocument, PDFHexString, PDFName, PDFNumber, PDFOperator, PDFOperatorNames } = lib;

  const pdf = await PDFDocument.create();
  makePdfx(pdf, lib, job, profiles.output);
  const { context } = pdf;
  const srgb = srgbColorSpace(pdf, lib, profiles.rgb);
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
  // The guides' layer is listed but off in the default configuration: viewers can show it, and a
  // PDF/X RIP (which prints the default configuration) leaves it out. The artwork's layers are on.
  const hasGuides = pages.some((page) => page.guides.length > 0);
  const guidesLayer = hasGuides
    ? context.register(context.obj({ Type: "OCG", Name: PDFHexString.fromText(GUIDES_LAYER_NAME) }))
    : null;
  const artLayers: PDFRef[] = [];

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
  const pathOps = (path: PathCmd[], heightMm: number) =>
    pathToPdf(path, heightMm).map(({ op: name, args }) => op(pathOperators[name], args.map(num)));

  for (const printPage of pages) {
    const { bands, vector, heightMm, cutPath, guides } = printPage;
    if (bands.length === 0 && !vector) throw new Error("A print page needs its raster");
    const { page, layers } = await addPrintPage(pdf, lib, srgb, printPage);
    artLayers.push(...layers);

    // `/Resources /ColorSpace`, `/ExtGState` and `/Properties` are not created on demand by pdf-lib.
    const resources = (key: string) => resourceDict(pdf, lib, page, key);
    resources("ColorSpace").set(PDFName.of(CUT_COLOR_NAME), cutColorSpace);
    resources("ExtGState").set(PDFName.of(CUT_GRAPHICS_STATE), cutGraphicsState);

    if (guidesLayer && guides.length > 0) {
      resources("Properties").set(PDFName.of(GUIDES_TAG), guidesLayer);
      page.pushOperators(
        op(names.BeginMarkedContentSequence, [PDFName.of("OC"), PDFName.of(GUIDES_TAG)]),
        op(names.PushGraphicsState),
        op(names.StrokingColorCmyk, GUIDE_CMYK.map(num)),
        op(names.SetLineWidth, [num(GUIDE_LINE_PT)]),
        ...guides.flatMap(({ kind, path }) => [
          op(names.SetLineDashPattern, [context.obj(GUIDE_DASH[kind]), num(0)]),
          ...pathOps(path, heightMm),
          op(names.StrokePath),
        ]),
        op(names.PopGraphicsState),
        op(names.EndMarkedContent),
      );
    }

    page.pushOperators(
      op(names.PushGraphicsState),
      op(names.SetGraphicsStateParams, [PDFName.of(CUT_GRAPHICS_STATE)]),
      op(names.StrokingColorspace, [PDFName.of(CUT_COLOR_NAME)]),
      op(names.StrokingColorN, [num(1)]),
      op(names.SetLineWidth, [num(CUT_LINE_PT)]),
      ...pathOps(cutPath, heightMm),
      op(names.StrokePath),
      op(names.PopGraphicsState),
    );
  }
  const layers = guidesLayer ? [...artLayers, guidesLayer] : artLayers;
  if (layers.length > 0) {
    pdf.catalog.set(
      PDFName.of("OCProperties"),
      context.obj({
        OCGs: layers,
        D: {
          Name: PDFHexString.fromText("Mặc định"),
          Order: layers,
          ...(guidesLayer ? { OFF: [guidesLayer] } : {}),
        },
      }),
    );
  }
  return asPdf16(await pdf.save(SAVE_OPTIONS));
}

/** The guides of a surface that go on the print file's guide layer (not bleed or trim). */
export const printGuides = (guides: Guide[]): PrintGuide[] =>
  guides.flatMap(({ kind, path }) => (kind === "bleed" || kind === "trim" ? [] : [{ kind, path }]));

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
