import {
  createPdfCanvas,
  execute,
  FALLBACK_FONT_FAMILY,
  mmToPt,
  printLayerNames,
  type DrawOp,
  type FontRegistry,
  type PrintSurface,
  type RenderEnv,
  type SurfaceContent,
  type VectorPage,
} from "../../engine";
import { canvasOf, pngOf } from "./export-canvas";
import { createGlyphOutliner, type GlyphStyle } from "./glyph-fonts";

/** The text styles a surface prints, as `layoutText` resolves them. */
function textStyles(content: SurfaceContent, fonts: FontRegistry): GlyphStyle[] {
  return content.elements.flatMap((el) => {
    if (el.type !== "text" || el.hidden) return [];
    const font = fonts[el.fontCode];
    return [
      {
        family: font?.family ?? FALLBACK_FONT_FAMILY,
        bold: el.bold,
        italic: el.italic && (font?.italic ?? false),
      },
    ];
  });
}

/** An image source as PNG bytes at its own size (a canvas layer as it is, a decoded asset redrawn). */
async function pngOfSource(source: CanvasImageSource): Promise<Uint8Array> {
  if (source instanceof HTMLCanvasElement) return pngOf(source);
  const sized = source as {
    naturalWidth?: number;
    naturalHeight?: number;
    width: number;
    height: number;
  };
  const canvas = canvasOf(sized.naturalWidth || sized.width, sized.naturalHeight || sized.height);
  try {
    canvas.getContext("2d")?.drawImage(source, 0, 0);
    return await pngOf(canvas);
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

/**
 * One print area as vectors: the studio's own executor replays `ops` onto a PDF recorder, each
 * element on its own layer (named as the design brief numbers them), text as glyph outlines from
 * the page's fonts, images and raster layers as PNG. `null` where the page holds something a PDF
 * cannot draw the same way: the caller rasterises that page instead.
 */
export async function printVectorArt(
  ops: DrawOp[],
  surface: PrintSurface,
  content: SurfaceContent,
  env: RenderEnv,
  fonts: FontRegistry,
): Promise<VectorPage | null> {
  const outline = await createGlyphOutliner(textStyles(content, fonts));
  // Canvas px (the executor scales mm by `env.pxPerMm`) to page pt, y up from the bleed box's foot.
  const k = mmToPt(1) / env.pxPerMm;
  const recorder = createPdfCanvas([k, 0, 0, -k, 0, mmToPt(surface.flatBounds.height)], outline);
  const names = printLayerNames(content);
  execute(ops, recorder.ctx, env, (_op, index, draw) => {
    const name = names[index];
    if (name !== undefined) recorder.beginLayer(name);
    draw();
    if (name !== undefined) recorder.endLayer();
  });
  const art = recorder.finish();
  if (art.unsupported !== undefined) return null;
  const images: Uint8Array[] = [];
  for (const source of art.images) images.push(await pngOfSource(source));
  return { content: art.content, images, alphas: art.alphas, layers: art.layers };
}
