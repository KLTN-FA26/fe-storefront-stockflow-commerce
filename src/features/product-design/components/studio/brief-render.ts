import { BRIEF_PAGE_MM, briefPages, drawBriefPage, mmToPx, type DesignBrief } from "../../engine";
import { canvasOf, EXPORT_MESSAGES, ExportError, pngOf } from "./export-canvas";
import type { PreviewDeps } from "./preview-export";
import { paintSurface, readChromeColors } from "./studio-paint";

/** The brief's raster: sharp enough to read and print, small enough to send. */
const BRIEF_DPI = 150;
/** Each area's artwork on the brief: about 150 DPI at the size it is drawn there. */
const ART_PX_PER_MM = 6;

async function decode(png: Uint8Array): Promise<ImageBitmap | undefined> {
  if (typeof createImageBitmap !== "function") return undefined;
  try {
    return await createImageBitmap(
      new Blob([png as Uint8Array<ArrayBuffer>], { type: "image/png" }),
    );
  } catch {
    // The brief is still complete without the picture: its overview leaves the frame empty.
    return undefined;
  }
}

/**
 * The design brief's pages as PNG bytes, A4 landscape: the overview with the 3D `preview`, each print
 * area's flat artwork with its guides and numbered elements, the colours, the notes and sign-off.
 * `ink` is the text colour (the theme's darkest ink); the guides take the editor's own colours.
 */
export async function renderDesignBrief(
  deps: PreviewDeps,
  brief: DesignBrief,
  preview: Uint8Array,
  ink: string,
): Promise<Uint8Array[]> {
  const chrome = readChromeColors();
  const style = {
    ink,
    guides: { trim: chrome.guide, safe: chrome.safe, seam: chrome.seam, crease: chrome.crease },
  };
  const previewImage = await decode(preview);
  const arts = new Map<string, HTMLCanvasElement>();
  for (const area of brief.areas) {
    const canvas = document.createElement("canvas");
    paintSurface(canvas, deps, area.surface.code, "print", ART_PX_PER_MM);
    arts.set(area.code, canvas);
  }
  const pxPerMm = mmToPx(1, BRIEF_DPI);
  const pages = briefPages(brief);
  const out: Uint8Array[] = [];
  try {
    for (let index = 0; index < pages.length; index++) {
      const canvas = canvasOf(
        Math.round(BRIEF_PAGE_MM.width * pxPerMm),
        Math.round(BRIEF_PAGE_MM.height * pxPerMm),
      );
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new ExportError(EXPORT_MESSAGES.canvas);
      drawBriefPage(ctx, brief, pages, index, pxPerMm, style, {
        ...(previewImage ? { preview: previewImage } : {}),
        art: (code) => arts.get(code),
      });
      try {
        out.push(await pngOf(canvas));
      } finally {
        canvas.width = 0;
        canvas.height = 0;
      }
    }
    return out;
  } finally {
    previewImage?.close();
    for (const canvas of arts.values()) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}
