import { warpStretch, type PolarWarp } from "../geometry/polar-warp";
import type { RenderEnv } from "./execute";
import { recallLayer, rememberSigned, signatureOf } from "./layer-cache";
import type { WarpedImageOp } from "./ops";
import { layerPx, MAX_LAYER_EDGE_PX, rasterScale } from "./raster";
import type { Raster } from "./remap";

/**
 * The source raster's size in px, and `k`: px per local mm along its coarser axis over the box (one
 * source px is at most `1 / k` local mm).
 */
export type SourcePlan = { width: number; height: number; k: number };

/**
 * Longest side of a placeholder's source on the stage: it is one colour, so only its edges need
 * pixels, and a picture loading (or failed) is never rasterised larger than this.
 */
export const PLACEHOLDER_MAX_SIDE_PX = 512;
const PLACEHOLDER_SIZE = { width: PLACEHOLDER_MAX_SIDE_PX, height: PLACEHOLDER_MAX_SIDE_PX };

/** The pixels each kept source stands for: the cache holds a 1 px layer, these are what is read. */
const sourcePixels = new WeakMap<CanvasImageSource, Raster>();

/** `px` rounded up to the next power of √2, as whole px. */
const stepUpPx = (px: number) =>
  Math.ceil(2 ** (Math.ceil(2 * Math.log2(Math.max(1, px)) - 1e-9) / 2));

/** What a source is painted from: the picture, or the placeholder colour while it is not decoded. */
export const madeFrom = (
  op: WarpedImageOp,
  image: CanvasImageSource | undefined,
  env: RenderEnv,
) => (image === undefined ? `placeholder:${env.chrome.placeholder}` : `asset:${op.source.assetId}`);

/** The image's own size in px; `undefined` when it is unknown. */
function imageSize(image: CanvasImageSource): { width: number; height: number } | undefined {
  if (!("width" in image) || typeof image.width !== "number" || typeof image.height !== "number") {
    return undefined;
  }
  const { width, height } = image;
  return width > 0 && height > 0 ? { width, height } : undefined;
}

/**
 * The source raster (spec §5.1): enough px per local mm for the most stretched column at this
 * output (`pxPerMm · scale · warpStretch`), within the layer edge limit, never finer than the image's
 * own pixels. Print: the box at exactly that resolution. Stage (`stepped`): each side rounded up to
 * a step of √2 px, at most the image's px on that side (`PLACEHOLDER_MAX_SIDE_PX` for a placeholder),
 * so dragging the scale, the radius or a side keeps the same raster until a side crosses a step; the
 * remap reads it over the current box. `undefined` for a degenerate scale.
 */
export function sourcePlan(
  w: PolarWarp,
  image: CanvasImageSource | undefined,
  pxPerMm: number,
  stepped: boolean,
): SourcePlan | undefined {
  const { box } = w;
  const k = rasterScale(pxPerMm, w.scale * warpStretch(w), box);
  if (k === undefined) return undefined;
  if (!stepped) {
    const own = image === undefined ? undefined : imageSize(image);
    const native = own && Math.max(own.width / box.width, own.height / box.height);
    const exact = native === undefined ? k : Math.min(k, native);
    return { width: layerPx(box.width, exact), height: layerPx(box.height, exact), k: exact };
  }
  const own = image === undefined ? PLACEHOLDER_SIZE : imageSize(image);
  const side = (mm: number, ownPx = Infinity) =>
    Math.min(MAX_LAYER_EDGE_PX, ownPx, stepUpPx(mm * k));
  const width = side(box.width, own?.width);
  const height = side(box.height, own?.height);
  return { width, height, k: Math.min(width / box.width, height / box.height) };
}

/**
 * The source filling a `width × height` layer edge to edge, so the remap's out-of-source neighbours
 * lie exactly outside the box (each axis then has its own px per mm): the image, smoothed, or the
 * placeholder colour while it is not decoded. Unflipped: the warp mirrors it. Only its pixels are
 * kept; the layer is let go.
 */
function paintSource(
  env: RenderEnv,
  image: CanvasImageSource | undefined,
  width: number,
  height: number,
): Raster {
  const { ctx } = env.createLayer(width, height);
  if (image === undefined) {
    ctx.fillStyle = env.chrome.placeholder;
    ctx.fillRect(0, 0, width, height);
  } else {
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, 0, 0, width, height);
  }
  return { data: ctx.getImageData(0, 0, width, height).data, width, height };
}

/**
 * The slot a new source is kept in: one per element and resolution, and one more per element for
 * the resolutions a zoom passes (`RenderEnv.transientResolution`), so a pinch keeps one entry rather
 * than one per frame.
 */
const sourceSlot = (op: WarpedImageOp, env: RenderEnv) =>
  `warp-source:${op.id}@${env.transientResolution === true ? "transient" : env.pxPerMm}`;

/**
 * The pixels of element `id`'s kept source made from `signature`, in whichever of its slots: one
 * picture at one size is the same raster for every output, so a zoom frame reuses the stage's and
 * the sharp paint after a zoom the zoom's. Found counts as a use.
 */
function recallSource(
  cache: Map<string, CanvasImageSource>,
  id: string,
  signature: string,
): Raster | undefined {
  const slots = `warp-source:${id}@`;
  for (const [key, handle] of cache) {
    if (key.startsWith(slots) && signatureOf(handle) === signature) {
      recallLayer(cache, key);
      return sourcePixels.get(handle);
    }
  }
  return undefined;
}

/**
 * The picture (or the placeholder colour) at `plan`'s size in px. It depends on nothing else, so a
 * kept one is reused while picture and size are the same (a resize or a zoom within a step), and its
 * slot is replaced when either changes (a step crossed, a new picture, the picture decoded). The
 * cache holds a 1 px layer standing for the pixels.
 */
export function sourceRaster(
  op: WarpedImageOp,
  image: CanvasImageSource | undefined,
  { width, height }: SourcePlan,
  env: RenderEnv,
): Raster {
  const cache = env.layerCache;
  const signature = `${madeFrom(op, image, env)}@${width}x${height}`;
  const kept = cache === undefined ? undefined : recallSource(cache, op.id, signature);
  if (kept !== undefined) return kept;

  const raster = paintSource(env, image, width, height);
  if (cache !== undefined) {
    const handle = env.createLayer(1, 1).source;
    sourcePixels.set(handle, raster);
    rememberSigned(cache, sourceSlot(op, env), signature, handle);
  }
  return raster;
}
