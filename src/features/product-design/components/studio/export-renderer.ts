import type { QueryClient } from "@tanstack/react-query";

import {
  A4_HEIGHT_MM,
  A4_WIDTH_MM,
  compose,
  drawSpecSheet,
  ImageCache,
  mmToPx,
  printBands,
  relativeLuminance,
  renderSurface,
  surfacePx,
  type DesignDocument,
  type Hex,
  type PrintAreaCode,
  type PrintBand,
  type SpecSummary,
  type SurfaceContent,
} from "../../engine";
import { canvasOf, EXPORT_MESSAGES as MESSAGES, ExportError, pngOf } from "./export-canvas";
import { exportPreview, type PreviewDeps } from "./preview-export";
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
  preview(size: number): Promise<Uint8Array>;
  /**
   * One print area over its bleed box at `pxPerMm`, with every image at full resolution: its
   * bands, top to bottom (one, unless the page is more than a canvas may hold).
   */
  printSurface(
    code: PrintAreaCode,
    document: DesignDocument,
    pxPerMm: number,
  ): Promise<PrintBand[]>;
  /** The technical-spec sheet, A4 portrait. */
  specSheet(summary: SpecSummary): Promise<Uint8Array>;
  /** Lets go of what the print surfaces loaded (the full-resolution images and their layers). */
  release(): void;
};

/**
 * Full-resolution images of one surface may exceed this; they stay while that surface is drawn and
 * are let go once it is (the next surface loads its own).
 */
const FULL_IMAGE_BYTES = 512 * 1024 * 1024;
/** The spec sheet's raster: sharp enough to read and print, small enough to send. */
const SHEET_DPI = 200;
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

  return {
    preview: (size) => exportPreview(deps, size),

    async printSurface(code, doc, pxPerMm) {
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
      };
      const { width, height } = surfacePx(surface.flatBounds, pxPerMm);
      try {
        const bands: PrintBand[] = [];
        for (const { y0Px, heightPx, overlapPx } of printBands(width, height)) {
          const canvas = document.createElement("canvas");
          if (!canvas.getContext("2d")) throw new ExportError(MESSAGES.canvas);
          // The band's own rows and the overlap the next band repeats (no hairline between them).
          renderSurface(canvas, ops, env, surface.flatBounds, {
            y0Px,
            heightPx: heightPx + overlapPx,
          });
          try {
            bands.push({ png: await pngOf(canvas), heightPx, overlapPx });
          } finally {
            // Up to 16 MP per band: hand the bitmap back now rather than at the next collection.
            canvas.width = 0;
            canvas.height = 0;
          }
        }
        return bands;
      } finally {
        // This surface's full images and print layers can be hundreds of MB: let them go now.
        full?.clear();
        layers = new Map();
      }
    },

    async specSheet(summary) {
      const pxPerMm = mmToPx(1, SHEET_DPI);
      const canvas = canvasOf(
        Math.round(A4_WIDTH_MM * pxPerMm),
        Math.round(A4_HEIGHT_MM * pxPerMm),
      );
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new ExportError(MESSAGES.canvas);
      drawSpecSheet(ctx, summary, pxPerMm, { ink: paperInk() });
      return pngOf(canvas);
    },

    release() {
      full?.clear();
      full = null;
      drawing = new Set();
      layers = new Map();
    },
  };
}
