import { applyToPoint } from "../geometry/affine";
import type { RectMm } from "../geometry/types";
import type { Ctx2D, RenderEnv } from "./execute";
import { recallLayer, rememberLayer } from "./layer-cache";
import type { DrawOp, Strip, WarpableOp } from "./ops";
import { paintImage, paintText } from "./paint";

type WarpedOp = Extract<DrawOp, { op: "warped" }>;

/** Longest edge of any layer the executor allocates, in px. */
export const MAX_LAYER_EDGE_PX = 8192;

/** Room above and below wrapped text for tall glyphs (stacked Vietnamese diacritics), in em. */
const TEXT_OVERHANG_EM = 0.25;

/** The layer's size in px for `mm` at `pxPerMm`, at least 1 and at most `MAX_LAYER_EDGE_PX`. */
export function layerPx(mm: number, pxPerMm: number): number {
  return Math.min(MAX_LAYER_EDGE_PX, Math.max(1, Math.ceil(mm * pxPerMm)));
}

/**
 * px per local mm to rasterise an element at: the output resolution times the element's own scale
 * (a logo scaled 2× prints at full DPI, not upscaled), reduced if that would make a layer longer
 * than `MAX_LAYER_EDGE_PX`. Rounded so the float noise of a matrix's rotation does not make two
 * placements of one element look like two resolutions. `undefined` for a degenerate scale.
 */
export function rasterScale(
  pxPerMm: number,
  elementScale: number,
  frame: { width: number; height: number },
): number | undefined {
  const wanted = Math.round(pxPerMm * elementScale * 1e6) / 1e6;
  if (!(wanted > 0) || !Number.isFinite(wanted)) return undefined;
  return Math.min(wanted, MAX_LAYER_EDGE_PX / Math.max(frame.width, frame.height));
}

/** The rectangle (element-local mm) a wrapped element is rasterised over. */
function layerFrame(source: WarpableOp): RectMm {
  if (source.op === "image") return source.box;
  const { widthMm, heightMm, fontSizeMm } = source.layout;
  const pad = fontSizeMm * TEXT_OVERHANG_EM + (source.outline?.widthMm ?? 0);
  return { x: -widthMm / 2, y: -heightMm / 2 - pad, width: widthMm, height: heightMm + 2 * pad };
}

/**
 * The source painted once, at full alpha, in its own local frame. `source.matrix` is the rigid
 * placement (flip too) and is deliberately not applied: the strips carry the placement and the
 * flip. The cache key leaves out `matrix` and `opacity`, which the raster does not depend on, so
 * moving or fading an element reuses its layer; `k` (px per local mm) is part of it.
 */
function warpLayer(
  source: WarpableOp,
  frame: RectMm,
  k: number,
  env: RenderEnv,
): CanvasImageSource {
  const { matrix: _matrix, opacity: _opacity, ...stable } = source;
  const key = `${JSON.stringify(stable)}@${k}`;
  const cached = env.layerCache === undefined ? undefined : recallLayer(env.layerCache, key);
  if (cached !== undefined) return cached;

  const layer = env.createLayer(layerPx(frame.width, k), layerPx(frame.height, k));
  layer.ctx.scale(k, k);
  layer.ctx.translate(-frame.x, -frame.y);
  const complete =
    source.op === "image"
      ? paintImage(layer.ctx, source, env)
      : (paintText(layer.ctx, source), true);
  // A placeholder is not worth keeping: the image will decode and the layer must be painted again.
  if (complete && env.layerCache !== undefined) rememberLayer(env.layerCache, key, layer.source);
  return layer.source;
}

/**
 * The source columns (element-local mm) a strip draws: its own, widened by one device pixel (half
 * on each side, but never past the layer) so neighbouring strips overlap instead of leaving
 * hairline seams. `undefined` when nothing is left.
 */
function stripColumns(strip: Strip, frame: RectMm, pxPerMm: number): [number, number] | undefined {
  const [a, b] = strip.matrix;
  const half = 0.5 / (pxPerMm * (Math.hypot(a, b) || 1));
  const x0 = Math.max(frame.x, strip.srcX - half);
  const x1 = Math.min(frame.x + frame.width, strip.srcX + strip.srcWidth + half);
  return x1 > x0 ? [x0, x1] : undefined;
}

/**
 * One strip of the layer through its matrix. The destination is in element-local mm (so it does not
 * depend on the layer's resolution `k`); the source rectangle is the same columns in layer px.
 */
function drawStrip(
  ctx: Ctx2D,
  layer: CanvasImageSource,
  frame: RectMm,
  strip: Strip,
  env: RenderEnv,
  k: number,
) {
  const columns = stripColumns(strip, frame, env.pxPerMm);
  if (columns === undefined) return;
  const [x0, x1] = columns;
  ctx.save();
  ctx.transform(...strip.matrix);
  ctx.drawImage(
    layer,
    (x0 - frame.x) * k,
    0,
    (x1 - x0) * k,
    frame.height * k,
    x0,
    frame.y,
    x1 - x0,
    frame.height,
  );
  ctx.restore();
}

/** The flat-mm box that holds every strip, one device pixel of slack around it. */
function stripsBounds(strips: Strip[], frame: RectMm, pxPerMm: number): RectMm | undefined {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const strip of strips) {
    const columns = stripColumns(strip, frame, pxPerMm);
    if (columns === undefined) continue;
    for (const x of columns) {
      for (const y of [frame.y, frame.y + frame.height]) {
        const p = applyToPoint(strip.matrix, { x, y });
        xs.push(p.x);
        ys.push(p.y);
      }
    }
  }
  if (xs.length === 0) return undefined;
  const slack = 1 / pxPerMm;
  const [x, y] = [Math.min(...xs) - slack, Math.min(...ys) - slack];
  return { x, y, width: Math.max(...xs) + slack - x, height: Math.max(...ys) + slack - y };
}

/**
 * Draws a wrapped element: its layer, strip by strip, through each strip's matrix. A translucent
 * element is first drawn at full alpha into one flat-sized composite and that is blended once, so
 * the one-pixel overlap between strips does not show as darker seams. The composite is the env's
 * reusable `scratchLayer` when it has one (no new canvas per paint), else a new layer.
 */
export function drawWarped(ctx: Ctx2D, op: WarpedOp, env: RenderEnv): void {
  const { source, strips } = op;
  const first = strips[0];
  const frame = layerFrame(source);
  if (first === undefined || frame.width <= 0 || frame.height <= 0) return;
  const k = rasterScale(env.pxPerMm, Math.hypot(first.matrix[0], first.matrix[1]), frame);
  if (k === undefined) return;
  const layer = warpLayer(source, frame, k, env);

  if (source.opacity >= 1) {
    for (const strip of strips) drawStrip(ctx, layer, frame, strip, env, k);
    return;
  }
  const { pxPerMm } = env;
  const bounds = stripsBounds(strips, frame, pxPerMm);
  if (bounds === undefined) return;
  const [w, h] = [layerPx(bounds.width, pxPerMm), layerPx(bounds.height, pxPerMm)];
  const group = env.scratchLayer ? env.scratchLayer(w, h) : env.createLayer(w, h);
  group.ctx.scale(pxPerMm, pxPerMm);
  group.ctx.translate(-bounds.x, -bounds.y);
  for (const strip of strips) drawStrip(group.ctx, layer, frame, strip, env, k);

  ctx.save();
  ctx.globalAlpha = source.opacity;
  const [sw, sh] = [bounds.width * pxPerMm, bounds.height * pxPerMm];
  ctx.drawImage(group.source, 0, 0, sw, sh, bounds.x, bounds.y, bounds.width, bounds.height);
  ctx.restore();
}
