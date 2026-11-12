import { warpBounds, warpToLocal, type PolarWarp } from "../geometry/polar-warp";
import type { RectMm } from "../geometry/types";
import type { Ctx2D, RenderEnv } from "./execute";
import { keptLayers, recallLayer, rememberSigned, signatureOf } from "./layer-cache";
import type { WarpedImageOp } from "./ops";
import { fitGrid, type Grid, type PxRect } from "./raster";
import { remapRaster, type Raster } from "./remap";
import { madeFrom, sourcePlan, sourceRaster, type SourcePlan } from "./warp-source";

/** A destination layer and the grid rectangle it covers. */
type Placed = { layer: CanvasImageSource; grid: Grid };

/**
 * Most pixels of a wrapped image's remap on the stage or a texture: the stage canvas's own area
 * budget, which a picture covering the whole sheet fills at the stage's finest resolution.
 */
export const MAX_WARP_AREA_PX = 16_000_000;

/** The remap reads the source in its own pixels: `toLocal` answers source px, not local mm. */
const SOURCE_PX = { x: 0, y: 0, pxPerMm: 1 };

const rectKey = ({ x, y, width, height }: PxRect) => `${x},${y},${width},${height}`;

const grownBy = ({ x, y, width, height }: RectMm, by: number): RectMm => ({
  x: x - by,
  y: y - by,
  width: width + 2 * by,
  height: height + 2 * by,
});

/** `w.box` cut to the rows within radii `[inner, outer]` about the apex (`r = R − y′·s`). */
function radialClip(w: PolarWarp, [inner, outer]: readonly [number, number]): RectMm | undefined {
  const { box, radiusMm, scale, flipY } = w;
  const [near, far] = [(radiusMm - outer) / scale, (radiusMm - inner) / scale];
  const [lo, hi] = flipY ? [-far, -near] : [near, far];
  const top = Math.max(box.y, lo);
  const bottom = Math.min(box.y + box.height, hi);
  return bottom > top ? { ...box, y: top, height: bottom - top } : undefined;
}

/**
 * `src` remapped through `w` onto `grid`, as a new layer: each destination pixel centre is taken back
 * to the element's local mm (`warpToLocal`), then into the source's own pixels.
 */
function remapped(w: PolarWarp, src: Raster, grid: Grid, env: RenderEnv): CanvasImageSource {
  const { box } = w;
  const kx = src.width / box.width;
  const ky = src.height / box.height;
  const raster = remapRaster(src, SOURCE_PX, grid, (px, py) => {
    const local = warpToLocal(w, (grid.x + px) / grid.k, (grid.y + py) / grid.k);
    return { x: (local.x - box.x) * kx, y: (local.y - box.y) * ky };
  });
  const { source, ctx } = env.createLayer(grid.width, grid.height);
  const pixels = ctx.createImageData(grid.width, grid.height);
  pixels.data.set(raster.data);
  ctx.putImageData(pixels, 0, 0);
  return source;
}

/** Print: remapped at every paint on the output's own grid, over the target canvas only. */
function exactPlacement(
  op: WarpedImageOp,
  image: CanvasImageSource | undefined,
  plan: SourcePlan,
  env: RenderEnv,
): Placed | undefined {
  const bounds = warpBounds({ ...op.warp, box: grownBy(op.warp.box, 1 / plan.k) });
  const grid = fitGrid(bounds, env.pxPerMm, { target: env.targetPx });
  if (grid === undefined) return undefined;
  return { layer: remapped(op.warp, sourceRaster(op, image, plan, env), grid, env), grid };
}

/**
 * Stage and texture: remapped as if at the top of the arc (`angleRad` 0), so sliding along the arc
 * (`u`) only turns it. Only the rows within the sheet's radii are remapped (that does not depend on
 * `u`), no finer than the source holds where it is most squeezed, within `warpBudgetPx` while a
 * gesture lasts and `MAX_WARP_AREA_PX` always. One cache entry per element and resolution (none
 * mid-zoom), reused while its picture, warp, source and grid are the same. Mid-gesture the sharp
 * entry is reused as it is when its element did not change (the gesture is elsewhere on the
 * surface); only a changed element is remapped within the budget. The radius is rounded: it is
 * measured from the placement and its last bits change with `u`.
 */
function stagePlacement(
  op: WarpedImageOp,
  image: CanvasImageSource | undefined,
  plan: SourcePlan,
  env: RenderEnv,
): Placed | undefined {
  const upright = { ...op.warp, angleRad: 0 };
  const box = radialClip(upright, op.sheetRadiiMm);
  if (box === undefined) return undefined;
  const { radiusMm, scale, flipX, flipY, apex } = upright;
  // Source px per flat mm: ky / s down a column, kx · R / (s · r) across at radius r.
  const [kx, ky] = [plan.width / upright.box.width, plan.height / upright.box.height];
  const innermost = radiusMm - scale * (flipY ? -box.y : box.y + box.height);
  const sourceLimit = Math.max((kx * radiusMm) / (scale * innermost), ky / scale);
  const bounds = warpBounds({ ...upright, box: grownBy(box, 1 / plan.k) });
  const within = (budgetPx: number) =>
    fitGrid(bounds, Math.min(env.pxPerMm, sourceLimit), {
      maxAreaPx: Math.min(budgetPx, MAX_WARP_AREA_PX),
    });
  const sharp = within(Infinity);
  if (sharp === undefined) return undefined;

  const cache = keptLayers(env);
  const key = `warp-image:${op.id}@${env.pxPerMm}`;
  const madeOf = [
    madeFrom(op, image, env),
    rectKey(upright.box),
    Math.round(radiusMm * 1e6) / 1e6,
    scale,
    flipX,
    flipY,
    `${apex.x},${apex.y}`,
    `${plan.width}x${plan.height}`,
  ].join("|");
  const signatureAt = (grid: Grid) => `${madeOf}|${rectKey(grid)}@${grid.k}`;
  const kept = cache === undefined ? undefined : recallLayer(cache, key);
  const keptAs = kept === undefined ? undefined : signatureOf(kept);
  if (kept !== undefined && keptAs === signatureAt(sharp)) return { layer: kept, grid: sharp };

  const grid = env.warpBudgetPx === undefined ? sharp : within(env.warpBudgetPx);
  if (grid === undefined) return undefined;
  const signature = signatureAt(grid);
  if (kept !== undefined && keptAs === signature) return { layer: kept, grid };
  const layer = remapped(upright, sourceRaster(op, image, plan, env), grid, env);
  rememberSigned(cache, key, signature, layer);
  return { layer, grid };
}

/**
 * Draws a wrapped image exactly as it prints (spec §5.1): its source rasterised once, remapped pixel
 * by pixel through the polar warp (no strips, no seams), and drawn once at the element's opacity. An
 * image not decoded yet is the placeholder colour over the same region. With `env.exactWarp` the
 * remap lies on the output's pixel grid; otherwise it is turned about the apex into place.
 */
export function drawWarpedImage(ctx: Ctx2D, op: WarpedImageOp, env: RenderEnv): void {
  const { source, warp } = op;
  if (!(warp.box.width > 0 && warp.box.height > 0)) return;
  const image = env.image(source.assetId);
  const exact = env.exactWarp === true;
  const plan = sourcePlan(warp, image, env.pxPerMm, !exact);
  if (plan === undefined) return;
  const placed = exact
    ? exactPlacement(op, image, plan, env)
    : stagePlacement(op, image, plan, env);
  if (placed === undefined) return;

  const { layer, grid } = placed;
  ctx.save();
  ctx.globalAlpha = source.opacity;
  if (!exact) {
    const { apex, angleRad } = warp;
    ctx.translate(apex.x, apex.y);
    ctx.rotate(angleRad);
    ctx.translate(-apex.x, -apex.y);
  }
  ctx.drawImage(layer, grid.x / grid.k, grid.y / grid.k, grid.width / grid.k, grid.height / grid.k);
  ctx.restore();
}
