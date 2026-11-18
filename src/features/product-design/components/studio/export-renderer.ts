import type { QueryClient } from "@tanstack/react-query";

import {
  compose,
  drawSlug,
  ImageCache,
  printBands,
  relativeLuminance,
  renderSurface,
  SLUG_HEIGHT_MM,
  surfacePx,
  type DesignDocument,
  type Hex,
  type PrintAreaCode,
  type PrintBand,
  type DesignBrief,
  type SurfaceContent,
  type VectorPage,
} from "../../engine";
import { canvasOf, EXPORT_MESSAGES as MESSAGES, ExportError, pngOf } from "./export-canvas";
import { renderDesignBrief } from "./brief-render";
import { exportPreview, type PreviewDeps } from "./preview-export";
import { printVectorArt } from "./print-vector";
import { createLayer, materialOf, readChromeColors } from "./studio-paint";
import { downloadAsset } from "./use-asset-images";

export { ExportError } from "./export-canvas";
export type { PreviewViewer } from "./preview-export";

/**
 * Draws the pictures of the files sent for review, as PNG bytes. The studio's default draws on real
 * canvases; a test hands the studio its own (jsdom has no 2D context and no `toBlob`).
 */
export type ExportRenderer = {
  /**
   * The customer preview, `size` × `size` px: the 3D model at its home angle (the one on screen,
   * else a short-lived offscreen one when the preview fell back to its flat view), else, where there
   * is no WebGL, the flat front.
   */
  preview(size: number, signal?: AbortSignal): Promise<Uint8Array>;
  /**
   * One print area over its bleed box at `pxPerMm`, with every image at full resolution: its
   * bands, top to bottom (one, unless the page is more than a canvas may hold).
   */
  printSurface(
    code: PrintAreaCode,
    document: DesignDocument,
    pxPerMm: number,
  ): Promise<PrintBand[]>;
  /**
   * The same print area as vectors, each element on its own layer, or `null` where the page holds
   * something a PDF cannot draw the same way (the caller then uses `printSurface`).
   */
  printVector(
    code: PrintAreaCode,
    document: DesignDocument,
    pxPerMm: number,
  ): Promise<VectorPage | null>;
  /** The print file's slug under a page `widthMm` wide: `lines` on a transparent strip. */
  printSlug(lines: readonly string[], widthMm: number, pxPerMm: number): Promise<Uint8Array>;
  /** The design brief's pages (the TECHNICAL_SPEC file), A4 landscape, with the 3D `preview` on its overview. */
  designBrief(brief: DesignBrief, preview: Uint8Array): Promise<Uint8Array[]>;
  /** Lets go of what the print surfaces loaded (the full-resolution images and their layers). */
  release(): void;
};

/**
 * Full-resolution images of one surface may exceed this; they stay while that surface is drawn and
 * are let go once it is (the next surface loads its own).
 */
const FULL_IMAGE_BYTES = 512 * 1024 * 1024;
const NO_CONTENT: SurfaceContent = { background: { kind: "none" }, elements: [] };

type RendererDeps = PreviewDeps & { designId: string; client: QueryClient };

/** The images a surface prints: those of its visible image elements. */
const printedImages = (content: SurfaceContent) => [
  ...new Set(
    content.elements.flatMap((el) => (el.type === "image" && !el.hidden ? [el.assetId] : [])),
  ),
];

/**
 * Ink for the sheet's paper: the darker of the theme's primary and inverse ink tokens (in the dark
 * theme the primary ink is the light one). Empty where nothing is styled; the canvas then keeps black.
 */
function paperInk(): string {
  const style = getComputedStyle(document.documentElement);
  const inks = ["--ink-primary", "--ink-inverse"]
    .map((token) => style.getPropertyValue(token).trim())
    .filter((value): value is Hex => /^#[0-9a-f]{6}$/i.test(value));
  return inks.toSorted((a, b) => relativeLuminance(a) - relativeLuminance(b))[0] ?? "";
}

/** The studio's export renderer over real canvases. */
export function createCanvasExportRenderer(deps: RendererDeps): ExportRenderer {
  const { surfaces, template } = deps;
  // The print's own images and layers, never the screen proxies: a surface's images are pinned while
  // it is drawn so a big one loaded after them cannot evict them.
  let drawing = new Set<string>();
  let full: ImageCache | null = null;
  let layers = new Map<string, CanvasImageSource>();
  const fullImages = () =>
    (full ??= new ImageCache({
      maxBytes: FULL_IMAGE_BYTES,
      isPinned: (assetId) => drawing.has(assetId),
    }));

  async function loadFull(assetIds: string[]) {
    const cache = fullImages();
    try {
      await Promise.all(
        assetIds.map(async (assetId) => {
          if (cache.get(assetId, "full")) return;
          const blob = await downloadAsset(deps.client, deps.designId, assetId);
          await cache.load(assetId, blob, "full");
        }),
      );
    } catch {
      throw new ExportError(MESSAGES.image);
    }
    return cache;
  }

  /** A surface's print ops and the env to draw them with, its images loaded at full resolution. */
  async function prepare(code: PrintAreaCode, doc: DesignDocument, pxPerMm: number) {
    const surface = surfaces.byCode[code];
    if (!surface) throw new ExportError(MESSAGES.canvas);
    const content = doc.surfaces[code] ?? NO_CONTENT;
    const assetIds = printedImages(content);
    drawing = new Set(assetIds);
    const cache = await loadFull(assetIds);
    // Never a placeholder in a print file: every image must be there.
    if (assetIds.some((assetId) => !cache.get(assetId, "full"))) {
      throw new ExportError(MESSAGES.image);
    }
    const ops = compose({
      surface,
      content,
      target: "print",
      material: materialOf(template),
      sizer: deps.sizer,
      fonts: deps.fonts,
      measure: deps.measure,
    });
    const env = {
      pxPerMm,
      chrome: readChromeColors(),
      image: (assetId: string) => cache.get(assetId, "full"),
      createLayer,
      layerCache: layers,
      // Wrapped images on the page's own pixel grid: each original is rasterised once at the
      // source resolution (capped at its own, so a finer photo is scaled down first), then that
      // raster is remapped once.
      exactWarp: true,
    };
    return { surface, content, ops, env };
  }

  /** This surface's full images and print layers can be hundreds of MB: let them go now. */
  function letGo() {
    full?.clear();
    layers = new Map();
  }

  return {
    preview: (size, signal) => exportPreview(deps, size, signal),

    async printSurface(code, doc, pxPerMm) {
      const { surface, ops, env } = await prepare(code, doc, pxPerMm);
      const { width, height } = surfacePx(surface.flatBounds, pxPerMm);
      try {
        const bands: PrintBand[] = [];
        for (const { y0Px, heightPx } of printBands(width, height)) {
          const canvas = document.createElement("canvas");
          if (!canvas.getContext("2d")) throw new ExportError(MESSAGES.canvas);
          // The band's own rows only: no row is painted twice in the PDF (`BandRows`).
          renderSurface(canvas, ops, env, surface.flatBounds, { y0Px, heightPx });
          try {
            bands.push({ png: await pngOf(canvas), heightPx });
          } finally {
            // Up to 16 MP per band: hand the bitmap back now rather than at the next collection.
            canvas.width = 0;
            canvas.height = 0;
          }
        }
        return bands;
      } finally {
        letGo();
      }
    },

    async printVector(code, doc, pxPerMm) {
      const { surface, content, ops, env } = await prepare(code, doc, pxPerMm);
      try {
        return await printVectorArt(ops, surface, content, env, deps.fonts);
      } finally {
        letGo();
      }
    },

    async printSlug(lines, widthMm, pxPerMm) {
      const canvas = canvasOf(Math.round(widthMm * pxPerMm), Math.round(SLUG_HEIGHT_MM * pxPerMm));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new ExportError(MESSAGES.canvas);
      drawSlug(ctx, lines, widthMm, pxPerMm, { ink: paperInk() });
      try {
        return await pngOf(canvas);
      } finally {
        canvas.width = 0;
        canvas.height = 0;
      }
    },

    designBrief: (brief, preview) => renderDesignBrief(deps, brief, preview, paperInk()),

    release() {
      full?.clear();
      full = null;
      drawing = new Set();
      layers = new Map();
    },
  };
}
