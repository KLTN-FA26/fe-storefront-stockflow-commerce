import { drawArcText } from "./arc-text";
import { drawDrawing } from "./drawing-layer";
import { drawGuides } from "./guides";
import type { DrawOp } from "./ops";
import { paintImage, paintText, placed, tracePath } from "./paint";
import { drawPattern } from "./patterns";
import { drawWarpedImage } from "./warped-image";

/** The slice of the canvas 2D API the executor uses, so a recording fake (or a PDF shim) can stand in. */
export type Ctx2D = Pick<
  CanvasRenderingContext2D,
  | "save"
  | "restore"
  | "setTransform"
  | "transform"
  | "beginPath"
  | "moveTo"
  | "lineTo"
  | "arc"
  | "closePath"
  | "clip"
  | "fill"
  | "stroke"
  | "fillRect"
  | "drawImage"
  | "fillText"
  | "strokeText"
  | "measureText"
  | "rotate"
  | "translate"
  | "scale"
  | "getImageData"
  | "putImageData"
  | "createImageData"
> & {
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: number;
  font: string;
  textBaseline: CanvasTextBaseline;
  globalAlpha: number;
  globalCompositeOperation: GlobalCompositeOperation;
  lineJoin: CanvasLineJoin;
  imageSmoothingQuality: ImageSmoothingQuality;
  /** Absent where the browser has no canvas `letterSpacing`: spaced text is then placed glyph by glyph. */
  letterSpacing?: string;
};

/**
 * Colours of the editor's own overlay, as canvas colour strings. A canvas cannot resolve the page's
 * CSS custom properties, so the studio reads them from the theme and passes them in; the executor
 * owns no colour of its own. `guide` is the trim line.
 */
export type ChromeColors = {
  guide: string;
  safe: string;
  bleed: string;
  seam: string;
  crease: string;
  /** Veil over everything outside the trim. */
  shade: string;
  /** Fill of an image that is not decoded yet. */
  placeholder: string;
};

export type RenderEnv = {
  /** Output resolution: the executor scales mm to px by this. */
  pxPerMm: number;
  chrome: ChromeColors;
  /** The decoded image of an asset, or `undefined` while it loads (a placeholder is drawn). */
  image(assetId: string): CanvasImageSource | undefined;
  /** An offscreen transparent surface, `widthPx × heightPx`, and a context to paint it with. */
  createLayer(widthPx: number, heightPx: number): { source: CanvasImageSource; ctx: Ctx2D };
  /**
   * A transparent surface of `widthPx × heightPx` like `createLayer`'s, but the same one each time:
   * for a composite that is drawn out at once (a translucent wrapped text), so a paint every frame
   * does not allocate a canvas every frame. Without it `createLayer` is used.
   *
   * Contract: it is handed back like a new layer, cleared over `[0, 0, widthPx, heightPx]`, with an
   * identity transform, full alpha and `source-over`, so the caller sets its own transform without
   * a reset. It may be larger than asked, so only that part is read back, and it is drawn out before
   * the next composite asks for it.
   */
  scratchLayer?(widthPx: number, heightPx: number): { source: CanvasImageSource; ctx: Ctx2D };
  /**
   * Rasterised wrapped images and drawings, so one is painted once until its picture, strokes or
   * resolution changes (moving or fading it does not; a wrapped image is remapped again when it
   * moves up or down the cup or is scaled). Wrapped text is drawn as vectors and never kept here.
   * The executor keeps at most 64 entries, least recently used out first.
   */
  layerCache?: Map<string, CanvasImageSource>;
  /**
   * The stage mid-zoom: this resolution is passing, the next paint asks for another. Nothing
   * rasterised at it (a remap, a drawing, a pattern tile) is kept in `layerCache`, so a zoom does not
   * crowd the cache. A wrapped image's source raster still is, in one more slot per element: it
   * depends on its size in px, which a zoom changes only when it crosses a step (spec §5.1).
   */
  transientResolution?: boolean;
  /**
   * Lay wrapped images on this output's own pixel grid (the print): each is remapped at every paint
   * and drawn pixel-aligned. Without it (stage, 3D texture) one is remapped once as if at the top of
   * the arc and drawn turned about the apex, so sliding it along the arc reuses it (spec §5.1).
   */
  exactWarp?: boolean;
  /**
   * The stage and texture while the customer drags, scales or draws: the most pixels a wrapped
   * image's remap may have. It is remapped coarser to fit and drawn scaled up, and painted sharp
   * again once the gesture ends. Ignored with `exactWarp`: the print is always exact.
   */
  warpBudgetPx?: number;
  /**
   * The pixels of the flat grid at `pxPerMm` (origin at flat 0, 0) the target canvas holds, set by
   * `renderSurface`: an exact warp remaps only these, and a translucent wrapped text composites only
   * these (a print band, only its own rows).
   */
  targetPx?: { x: number; y: number; width: number; height: number };
};

function run(op: DrawOp, ctx: Ctx2D, env: RenderEnv): void {
  switch (op.op) {
    case "save":
      ctx.save();
      break;
    case "restore":
      ctx.restore();
      break;
    case "clip":
      tracePath(ctx, op.path);
      ctx.clip();
      break;
    case "fill":
      ctx.fillStyle = op.color;
      tracePath(ctx, op.path);
      ctx.fill();
      break;
    case "pattern":
      drawPattern(ctx, op, env);
      break;
    case "image":
      placed(ctx, op.matrix, op.opacity, () => paintImage(ctx, op, env));
      break;
    case "text":
      placed(ctx, op.matrix, op.opacity, () => paintText(ctx, op));
      break;
    case "drawing":
      drawDrawing(ctx, op, env);
      break;
    case "arcText":
      drawArcText(ctx, op, env);
      break;
    case "warpedImage":
      drawWarpedImage(ctx, op, env);
      break;
    case "multiply":
      ctx.save();
      ctx.globalCompositeOperation = "multiply";
      ctx.fillStyle = op.color;
      tracePath(ctx, op.path);
      ctx.fill();
      ctx.restore();
      break;
    case "guides":
      drawGuides(ctx, op, env);
      break;
  }
}

/** Wraps the drawing of one op: a PDF context uses it to put each element on its own layer. */
export type AroundOp = (op: DrawOp, index: number, draw: () => void) => void;

/**
 * Replays composed ops (flat mm) onto a 2D context at `env.pxPerMm`, on top of the context's
 * current transform. Never throws for missing assets: an image that is not decoded yet is a
 * placeholder rectangle. `around`, when given, runs each op through it.
 */
export function execute(ops: DrawOp[], ctx: Ctx2D, env: RenderEnv, around?: AroundOp): void {
  ctx.save();
  ctx.scale(env.pxPerMm, env.pxPerMm);
  ops.forEach((op, index) => {
    const draw = () => run(op, ctx, env);
    if (around) around(op, index, draw);
    else draw();
  });
  ctx.restore();
}
