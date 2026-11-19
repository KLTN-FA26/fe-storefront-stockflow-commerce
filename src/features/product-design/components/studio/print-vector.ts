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
  type AlphaMask,
  type Mat2D,
  type RectMm,
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

/** A picture's alpha channel at its own size: the shape of the white ink under it. */
function alphaOfSource(source: CanvasImageSource): AlphaMask {
  const sized = source as {
    naturalWidth?: number;
    naturalHeight?: number;
    width: number;
    height: number;
  };
  const width = sized.naturalWidth || sized.width;
  const height = sized.naturalHeight || sized.height;
  const canvas = canvasOf(width, height);
  try {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("The browser gave no 2D context for an alpha mask");
    ctx.drawImage(source, 0, 0);
    const rgba = ctx.getImageData(0, 0, width, height).data;
    const alpha = new Uint8Array(width * height);
    for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3] ?? 0;
    return { width, height, alpha };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

/**
 * Where a surface goes on a page it shares (a bag's side on its flat sheet): the page's base
 * transform with the side's offset already in it, the part of the surface that shows (its flat mm),
 * and the side's name, put before each of its layers.
 */
export type SheetPlacement = { base: Mat2D; clipMm: RectMm; layerPrefix: string };

/** Clips `ctx` (canvas px) to `rect` (flat mm) until the caller's `restore`. */
function clipTo(ctx: ReturnType<typeof createPdfCanvas>["ctx"], rect: RectMm, pxPerMm: number) {
  const [x, y, w, h] = [rect.x, rect.y, rect.width, rect.height].map((v) => v * pxPerMm) as [
    number,
    number,
    number,
    number,
  ];
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
  ctx.clip();
}

/**
 * A surface drawn as one picture on a shared page (a side that could not be drawn as vectors): the
 * raster over its flat bounds, clipped like its vectors would be, on one layer.
 */
export async function rasterSheetArt(
  raster: HTMLCanvasElement,
  surface: PrintSurface,
  pxPerMm: number,
  { base, clipMm, layerPrefix }: SheetPlacement,
): Promise<VectorPage> {
  const recorder = createPdfCanvas(base, () => null);
  recorder.beginLayer(`${layerPrefix} · Ảnh (không vẽ được dạng vector)`);
  clipTo(recorder.ctx, clipMm, pxPerMm);
  const { width, height } = surface.flatBounds;
  recorder.ctx.drawImage(raster, 0, 0, width * pxPerMm, height * pxPerMm);
  recorder.ctx.restore();
  recorder.endLayer();
  const art = recorder.finish();
  return {
    content: art.content,
    images: [await pngOf(raster)],
    alphas: art.alphas,
    layers: art.layers,
  };
}

/**
 * One print area as vectors: the studio's own executor replays `ops` onto a PDF recorder, each
 * element on its own layer (named as the design brief numbers them), text as glyph outlines from
 * the page's fonts, images and raster layers as PNG. With `underlay` (clear stock) the same ops are
 * replayed once more as the white ink under them, every image as the shape of its alpha. `null`
 * where the page holds something a PDF cannot draw the same way: the caller rasterises it instead.
 */
export async function printVectorArt(
  ops: DrawOp[],
  surface: PrintSurface,
  content: SurfaceContent,
  env: RenderEnv,
  fonts: FontRegistry,
  { underlay = false, placement }: { underlay?: boolean; placement?: SheetPlacement } = {},
): Promise<VectorPage | null> {
  const outline = await createGlyphOutliner(textStyles(content, fonts));
  // Canvas px (the executor scales mm by `env.pxPerMm`) to page pt, y up from the bleed box's foot.
  const k = mmToPt(1) / env.pxPerMm;
  const base = placement?.base ?? ([k, 0, 0, -k, 0, mmToPt(surface.flatBounds.height)] as const);
  const recorder = createPdfCanvas(base, outline);
  const names = printLayerNames(content).map((name) =>
    name !== undefined && placement ? `${placement.layerPrefix} · ${name}` : name,
  );
  if (placement) clipTo(recorder.ctx, placement.clipMm, env.pxPerMm);
  execute(ops, recorder.ctx, env, (_op, index, draw) => {
    const name = names[index];
    if (name !== undefined) recorder.beginLayer(name);
    draw();
    if (name !== undefined) recorder.endLayer();
  });
  if (placement) recorder.ctx.restore();
  const art = recorder.finish();
  if (art.unsupported !== undefined) return null;
  const images: Uint8Array[] = [];
  for (const source of art.images) images.push(await pngOfSource(source));
  const page: VectorPage = { content: art.content, images, alphas: art.alphas, layers: art.layers };
  if (!underlay) return page;

  const white = createPdfCanvas(base, outline, "underlay");
  if (placement) clipTo(white.ctx, placement.clipMm, env.pxPerMm);
  execute(ops, white.ctx, env);
  if (placement) white.ctx.restore();
  const ink = white.finish();
  if (ink.unsupported !== undefined) return null;
  const masks = ink.images.map(alphaOfSource);
  return { ...page, underlay: { content: ink.content, alphas: ink.alphas, masks } };
}
