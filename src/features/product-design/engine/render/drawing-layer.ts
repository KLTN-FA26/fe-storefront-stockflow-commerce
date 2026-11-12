import type { Stroke } from "../document/schema";
import { strokePolygon } from "./brush";
import type { Ctx2D, RenderEnv } from "./execute";
import { contentHash, keptLayers, recallLayer, rememberSigned, signatureOf } from "./layer-cache";
import type { DrawOp } from "./ops";
import { placed } from "./paint";
import { layerPx, rasterScale } from "./raster";

type DrawingOp = Extract<DrawOp, { op: "drawing" }>;

/** What a drawing's raster depends on besides its resolution, by stroke list (documents are immutable). */
const strokeSignatures = new WeakMap<readonly Stroke[], string>();

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
  const cache = keptLayers(env);
  const key = `drawing:${op.id}@${k}`;
  const signature = drawingSignature(op);
  const cached = cache === undefined ? undefined : recallLayer(cache, key);
  if (cached !== undefined && signatureOf(cached) === signature) return cached;

  const { box } = op;
  const layer = env.createLayer(layerPx(box.width, k), layerPx(box.height, k));
  layer.ctx.scale(k, k);
  layer.ctx.translate(-box.x, -box.y);
  for (const stroke of op.strokes) paintStroke(layer.ctx, stroke);
  rememberSigned(cache, key, signature, layer.source);
  return layer.source;
}

/**
 * Strokes go to their own layer so an eraser cuts this drawing only, never the artwork below it.
 * The layer is rasterised at the element's scale (a drawing scaled 2× stays sharp) and drawn back
 * into the same box, so the matrix needs no compensation.
 */
export function drawDrawing(ctx: Ctx2D, op: DrawingOp, env: RenderEnv): void {
  const { box, strokes, matrix, opacity } = op;
  if (strokes.length === 0 || box.width <= 0 || box.height <= 0) return;
  const k = rasterScale(env.pxPerMm, Math.hypot(matrix[0], matrix[1]), box);
  if (k === undefined) return;

  const layer = drawingLayer(op, k, env);
  placed(ctx, matrix, opacity, () => {
    ctx.drawImage(layer, 0, 0, box.width * k, box.height * k, box.x, box.y, box.width, box.height);
  });
}
