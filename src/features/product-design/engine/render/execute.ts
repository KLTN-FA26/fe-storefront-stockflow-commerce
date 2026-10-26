import type { Stroke } from "../document/schema";
import type { PathCmd } from "../geometry/types";
import type { Guide } from "../surfaces/types";
import { strokePolygon } from "./brush";
import { contentHash, recallLayer, rememberLayer } from "./layer-cache";
import type { DrawOp } from "./ops";
import { paintImage, paintText, placed } from "./paint";
import { drawPattern } from "./patterns";
import { drawWarped, layerPx, rasterScale } from "./warped";

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
> & {
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: number;
  font: string;
  textBaseline: CanvasTextBaseline;
  globalAlpha: number;
  globalCompositeOperation: GlobalCompositeOperation;
  lineJoin: CanvasLineJoin;
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
   * A transparent surface of `widthPx × heightPx` like `createLayer`'s, but the same one each time
   * (cleared): for a composite that is drawn out at once, so a paint every frame does not allocate
   * a canvas every frame. Without it `createLayer` is used.
   */
  scratchLayer?(widthPx: number, heightPx: number): { source: CanvasImageSource; ctx: Ctx2D };
  /**
   * Rasterised wrapped elements and drawings, so one is painted once until its picture, text,
   * strokes or resolution changes (moving or fading it does not). The executor keeps at most 64
   * entries, least recently used out first.
   */
  layerCache?: Map<string, CanvasImageSource>;
};

/** Reach of the outside-the-trim shade: far beyond any surface, the canvas clips the rest. */
const SHADE_EXTENT_MM = 10_000;

function tracePath(ctx: Ctx2D, path: PathCmd[]): void {
  ctx.beginPath();
  for (const cmd of path) {
    switch (cmd.c) {
      case "M":
        ctx.moveTo(cmd.x, cmd.y);
        break;
      case "L":
        ctx.lineTo(cmd.x, cmd.y);
        break;
      case "A":
        // PathCmd arcs are canvas arcs: angle 0 is +x, positive turns clockwise on screen.
        ctx.arc(cmd.cx, cmd.cy, cmd.r, cmd.start, cmd.end, cmd.ccw);
        break;
      case "Z":
        ctx.closePath();
        break;
    }
  }
}

function paintStroke(ctx: Ctx2D, stroke: Stroke): void {
  const [first, ...rest] = strokePolygon(stroke);
  if (first === undefined) return;
  ctx.globalCompositeOperation = stroke.mode === "erase" ? "destination-out" : "source-over";
  ctx.fillStyle = stroke.color;
  ctx.beginPath();
  ctx.moveTo(first[0], first[1]);
  for (const [x, y] of rest) ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fill();
}

type DrawingOp = Extract<DrawOp, { op: "drawing" }>;

/** What a drawing's raster depends on besides its resolution, by stroke list (documents are immutable). */
const strokeSignatures = new WeakMap<readonly Stroke[], string>();
/** The content each cached drawing raster was painted from. */
const layerSignatures = new WeakMap<object, string>();

function drawingSignature({ strokes, box }: DrawingOp): string {
  let strokesHash = strokeSignatures.get(strokes);
  if (strokesHash === undefined) {
    strokesHash = contentHash(JSON.stringify(strokes));
    strokeSignatures.set(strokes, strokesHash);
  }
  return `${strokesHash}|${box.x},${box.y},${box.width},${box.height}`;
}

/**
 * The drawing's strokes rasterised at `k` px per local mm. Cached per element and resolution (one
 * entry, replaced while a stroke grows), and reused while its strokes and box are the same: a paint
 * every frame of a drag elsewhere does not rasterise every drawing again.
 */
function drawingLayer(op: DrawingOp, k: number, env: RenderEnv): CanvasImageSource {
  const key = `drawing:${op.id}@${k}`;
  const signature = drawingSignature(op);
  const cached = env.layerCache === undefined ? undefined : recallLayer(env.layerCache, key);
  if (cached !== undefined && layerSignatures.get(cached) === signature) return cached;

  const { box } = op;
  const layer = env.createLayer(layerPx(box.width, k), layerPx(box.height, k));
  layer.ctx.scale(k, k);
  layer.ctx.translate(-box.x, -box.y);
  for (const stroke of op.strokes) paintStroke(layer.ctx, stroke);
  if (env.layerCache !== undefined) {
    layerSignatures.set(layer.source, signature);
    rememberLayer(env.layerCache, key, layer.source);
  }
  return layer.source;
}

/**
 * Strokes go to their own layer so an eraser cuts this drawing only, never the artwork below it.
 * The layer is rasterised at the element's scale (a drawing scaled 2× stays sharp) and drawn back
 * into the same box, so the matrix needs no compensation.
 */
function drawDrawing(ctx: Ctx2D, op: DrawingOp, env: RenderEnv): void {
  const { box, strokes, matrix, opacity } = op;
  if (strokes.length === 0 || box.width <= 0 || box.height <= 0) return;
  const k = rasterScale(env.pxPerMm, Math.hypot(matrix[0], matrix[1]), box);
  if (k === undefined) return;

  const layer = drawingLayer(op, k, env);
  placed(ctx, matrix, opacity, () => {
    ctx.drawImage(layer, 0, 0, box.width * k, box.height * k, box.x, box.y, box.width, box.height);
  });
}

function guideColor(chrome: ChromeColors, kind: Guide["kind"]): string {
  return kind === "trim" ? chrome.guide : chrome[kind];
}

function drawGuides(ctx: Ctx2D, op: Extract<DrawOp, { op: "guides" }>, env: RenderEnv): void {
  ctx.save();
  if (op.shadeOutside.length > 0) {
    const e = SHADE_EXTENT_MM;
    const everything: PathCmd[] = [
      { c: "M", x: -e, y: -e },
      { c: "L", x: e, y: -e },
      { c: "L", x: e, y: e },
      { c: "L", x: -e, y: e },
      { c: "Z" },
    ];
    ctx.fillStyle = env.chrome.shade;
    tracePath(ctx, [...everything, ...op.shadeOutside]);
    ctx.fill("evenodd");
  }
  ctx.lineWidth = 1 / env.pxPerMm;
  for (const guide of op.guides) {
    ctx.strokeStyle = guideColor(env.chrome, guide.kind);
    tracePath(ctx, guide.path);
    ctx.stroke();
  }
  ctx.restore();
}

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
    case "warped":
      drawWarped(ctx, op, env);
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

/**
 * Replays composed ops (flat mm) onto a 2D context at `env.pxPerMm`, on top of the context's
 * current transform. Never throws for missing assets: an image that is not decoded yet is a
 * placeholder rectangle.
 */
export function execute(ops: DrawOp[], ctx: Ctx2D, env: RenderEnv): void {
  ctx.save();
  ctx.scale(env.pxPerMm, env.pxPerMm);
  for (const op of ops) run(op, ctx, env);
  ctx.restore();
}
