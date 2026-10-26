import type { BandRows } from "../export/print-bands";
import type { RectMm } from "../geometry/types";
import { execute, type RenderEnv } from "./execute";
import type { DrawOp } from "./ops";

/** The raster size of `flatBounds` at `pxPerMm`: what `renderSurface` sizes a whole canvas to. */
export function surfacePx(flatBounds: RectMm, pxPerMm: number): { width: number; height: number } {
  return {
    width: Math.ceil(flatBounds.width * pxPerMm),
    height: Math.ceil(flatBounds.height * pxPerMm),
  };
}

/**
 * Paints composed ops onto a canvas sized to `flatBounds` at `env.pxPerMm`, or to the `rows` of
 * that raster only (a print band: the canvas is as tall as the band and the ops are shifted up by
 * its top). The canvas is only resized when its size changes (assigning a size reallocates the
 * bitmap, which would cost a frame while dragging) and is cleared before every paint. Does nothing
 * where the canvas has no 2D context (an unsupported browser, a context lost, a test DOM).
 */
export function renderSurface(
  canvas: HTMLCanvasElement,
  ops: DrawOp[],
  env: RenderEnv,
  flatBounds: RectMm,
  rows?: Pick<BandRows, "y0Px" | "heightPx">,
): void {
  const ctx = canvas.getContext("2d");
  if (ctx === null) return;

  const { width, height: fullHeight } = surfacePx(flatBounds, env.pxPerMm);
  const height = rows?.heightPx ?? fullHeight;
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  if (rows !== undefined) ctx.setTransform(1, 0, 0, 1, 0, -rows.y0Px);
  execute(ops, ctx, env);
}
