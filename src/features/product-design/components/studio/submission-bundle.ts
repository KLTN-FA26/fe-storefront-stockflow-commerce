import { formatDateTime } from "@/lib/format";

import {
  BRIEF_PAGE_MM,
  buildDesignBrief,
  buildPrintPdf,
  buildSheetPdf,
  mmToPx,
  pathBounds,
  printDpi,
  printGuides,
  printSlugLines,
  type CustomizationTemplate,
  type DesignDocument,
  type ElementSizer,
  type FontRegistry,
  type PreflightReport,
  type PrintJobInfo,
  type PrintPage,
  type SurfaceSet,
} from "../../engine";
import type { ExportRenderer } from "./export-renderer";
import { loadPrintProfiles } from "./print-profiles";

export type BundleRole = "CUSTOMER_PREVIEW" | "PRINT_READY" | "TECHNICAL_SPEC";
export type SubmissionBundle = Record<
  BundleRole,
  { name: string; type: string; bytes: Uint8Array }
>;
export type BundleStep = "preview" | "print" | "spec";

/** Spec §9: the preview is 1600 × 1600; the print raster is `printDpi(minDpi)` = `max(minDpi, 300)`. */
const PREVIEW_PX = 1600;

/** One macrotask: lets the screen paint (and stay responsive) between heavy steps. */
const breathe = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * The three files of a submission (spec §6.4), drawn from plain inputs: the customer preview PNG,
 * the print-ready PDF/X-4 (one page per print area at `max(minDpi, 300)` DPI: its artwork as
 * vectors, each element on its own layer, where the page allows, else its raster; its cut path,
 * guides and slug) and the design brief (the TECHNICAL_SPEC file: what the customer meant, element
 * by element, beside the print file).
 * `onStep` says where the work is (`fraction` 0–1 within the step). The renderer lets go of the
 * print images when the print step ends, however it ends.
 */
export async function buildSubmissionBundle(input: {
  name: string;
  /** The design's version, named in the print file's slug. */
  version: number;
  document: DesignDocument;
  template: CustomizationTemplate;
  surfaces: SurfaceSet;
  /** How big each element is, and the fonts by code: the design brief measures with them. */
  sizer: ElementSizer;
  fonts: FontRegistry;
  report: PreflightReport;
  checksum: string;
  renderer: ExportRenderer;
  onStep?: (step: BundleStep, fraction: number) => void;
  /** "Hủy": ends the preview's wait for the 3D model at once (rejects with the signal's reason). */
  signal?: AbortSignal;
}): Promise<SubmissionBundle> {
  const { name, document, template, surfaces, report, checksum, renderer, onStep, signal } = input;

  onStep?.("preview", 0);
  const preview = await (signal
    ? renderer.preview(PREVIEW_PX, signal)
    : renderer.preview(PREVIEW_PX));

  onStep?.("print", 0);
  const pxPerMm = mmToPx(1, printDpi(template.minDpi));
  const profiles = await loadPrintProfiles();
  const createdAt = new Date();
  const title = name.trim() || template.name;
  const info: PrintJobInfo = {
    title,
    sku: template.sku,
    version: input.version,
    exportedAt: formatDateTime(createdAt.toISOString()),
    checksum,
    profileName: profiles.output.info,
  };
  const areaNames = new Map(template.printAreas.map((area) => [area.code, area.name]));
  const seamMm = template.model.kind === "parametric-cup" ? template.model.seamMm : undefined;
  const pages: PrintPage[] = [];
  try {
    for (const [i, code] of surfaces.order.entries()) {
      onStep?.("print", i / surfaces.order.length);
      await breathe();
      const surface = surfaces.byCode[code]!;
      // Vectors, each element on its own layer, where the page allows; else the raster.
      const vector = await renderer.printVector(code, document, pxPerMm);
      const bands = vector ? [] : await renderer.printSurface(code, document, pxPerMm);
      const { width: widthMm, height: heightMm } = surface.flatBounds;
      const guides = printGuides(surface.guides());
      const cutPath = surface.outline("trim");
      const slugLines = printSlugLines(info, {
        code,
        name: areaNames.get(code) ?? code,
        page: i + 1,
        pages: surfaces.order.length,
        trimMm: pathBounds(cutPath),
        bleedMm: surface.bleedMm,
        ...(seamMm !== undefined && guides.some((guide) => guide.kind === "seam")
          ? { seamMm }
          : {}),
        guideKinds: guides.map((guide) => guide.kind),
      });
      const slug = await renderer.printSlug(slugLines, widthMm, pxPerMm);
      pages.push({
        code,
        widthMm,
        heightMm,
        bands,
        ...(vector ? { vector } : {}),
        cutPath,
        guides,
        slug,
      });
    }
  } finally {
    renderer.release();
  }
  onStep?.("print", 1);
  await breathe();
  const printReady = await buildPrintPdf({
    title,
    // The same design exports to the same file id (trailer /ID, XMP DocumentID).
    documentId: checksum.slice(0, 32),
    createdAt,
    profiles,
    pages,
  });

  onStep?.("spec", 0);
  // The design brief: what the producer prepresses from, beside the print file.
  const brief = buildDesignBrief({
    title,
    template,
    surfaces,
    document,
    report,
    sizer: input.sizer,
    fonts: input.fonts,
    version: input.version,
    exportedAt: formatDateTime(createdAt.toISOString()),
    checksum,
  });
  const briefPages = await renderer.designBrief(brief, preview);
  await breathe();
  const spec = await buildSheetPdf(briefPages, BRIEF_PAGE_MM.width, BRIEF_PAGE_MM.height);

  return {
    CUSTOMER_PREVIEW: { name: "preview.png", type: "image/png", bytes: preview },
    PRINT_READY: { name: "print-ready.pdf", type: "application/pdf", bytes: printReady },
    TECHNICAL_SPEC: { name: "technical-spec.pdf", type: "application/pdf", bytes: spec },
  };
}
