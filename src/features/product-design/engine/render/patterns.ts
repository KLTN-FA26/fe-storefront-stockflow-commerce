import type { Ctx2D, RenderEnv } from "./execute";
import { recallLayer, rememberLayer } from "./layer-cache";
import type { DrawOp } from "./ops";

type PatternOp = Extract<DrawOp, { op: "pattern" }>;

/**
 * Smallest pitch drawn. A pattern is made of one motif per pitch over the whole surface, so a
 * `scale` of a few hundredths of a millimetre would ask for millions of them (and an invalid one,
 * `NaN` or negative, for none): such a value draws as this pitch instead.
 */
const MIN_PITCH_MM = 1;

const TAU = Math.PI * 2;

/**
 * Each motif paints a lattice centred on the origin of the (rotated) pattern frame and reaching at
 * least `reach` mm in every direction, with a repeat distance of `pitch` mm. The context's fill and
 * stroke style are already the motif colour.
 */
type Motif = (ctx: Ctx2D, reach: number, pitch: number) => void;

/** Lattice indices that cover `[-reach, reach]`. */
function indices(reach: number, pitch: number): number[] {
  const n = Math.ceil(reach / pitch);
  return Array.from({ length: 2 * n + 1 }, (_, i) => i - n);
}

/** Polka dots on a half-drop lattice: one path, one fill. */
const dots: Motif = (ctx, reach, pitch) => {
  const r = pitch * 0.2;
  const range = indices(reach, pitch);
  ctx.beginPath();
  for (const j of range) {
    const shift = Math.abs(j) % 2 === 1 ? pitch / 2 : 0;
    for (const i of range) {
      const x = i * pitch + shift;
      ctx.moveTo(x + r, j * pitch);
      ctx.arc(x, j * pitch, r, 0, TAU, false);
    }
  }
  ctx.fill();
};

/** Vertical bars as wide as the gaps between them. */
const stripes: Motif = (ctx, reach, pitch) => {
  for (const i of indices(reach, pitch)) {
    ctx.fillRect(i * pitch - pitch / 4, -reach, pitch / 2, 2 * reach);
  }
};

/** Squares of half a pitch on a two-colour board. */
const checker: Motif = (ctx, reach, pitch) => {
  const cell = pitch / 2;
  const n = Math.ceil(reach / cell);
  for (let j = -n; j < n; j++) {
    for (let i = -n; i < n; i++) {
      if ((i + j) % 2 === 0) ctx.fillRect(i * cell, j * cell, cell, cell);
    }
  }
};

/** Thin lines every pitch, both ways. */
const grid: Motif = (ctx, reach, pitch) => {
  ctx.lineWidth = pitch * 0.06;
  ctx.beginPath();
  for (const k of indices(reach, pitch)) {
    ctx.moveTo(k * pitch, -reach);
    ctx.lineTo(k * pitch, reach);
    ctx.moveTo(-reach, k * pitch);
    ctx.lineTo(reach, k * pitch);
  }
  ctx.stroke();
};

/** A row of wavy lines every pitch, `y(x)` away from the row's centre line. */
function rows(
  ctx: Ctx2D,
  reach: number,
  pitch: number,
  step: number,
  y: (x: number) => number,
): void {
  ctx.lineWidth = pitch * 0.12;
  ctx.beginPath();
  for (const j of indices(reach, pitch)) {
    const x0 = -Math.ceil(reach / step) * step;
    ctx.moveTo(x0, j * pitch + y(x0));
    for (let x = x0 + step; x <= reach + step; x += step) ctx.lineTo(x, j * pitch + y(x));
  }
  ctx.stroke();
}

/** Sine waves of two pitches' wavelength. */
const waves: Motif = (ctx, reach, pitch) => {
  ctx.lineJoin = "round";
  rows(ctx, reach, pitch, pitch / 4, (x) => pitch * 0.25 * Math.sin((x / (2 * pitch)) * TAU));
};

/** Zig-zags: a vertex every half pitch, alternating up and down. */
const chevron: Motif = (ctx, reach, pitch) => {
  ctx.lineJoin = "miter";
  const half = pitch / 2;
  rows(ctx, reach, pitch, half, (x) => (Math.round(x / half) % 2 === 0 ? -1 : 1) * pitch * 0.25);
};

/** How many pitches each motif repeats after, across and down (dots are a half-drop, waves span two). */
const PERIOD: Record<PatternOp["patternId"], [number, number]> = {
  dots: [1, 2],
  stripes: [1, 1],
  checker: [1, 1],
  waves: [2, 1],
  grid: [1, 1],
  chevron: [1, 1],
};

/** Largest tile (px) a pattern is filled from; a bigger motif has few repeats and is drawn as is. */
const MAX_TILE_PIXELS = 2048 * 2048;

type PatternCtx = Ctx2D & Pick<CanvasRenderingContext2D, "createPattern">;
const canPattern = (ctx: Ctx2D): ctx is PatternCtx =>
  typeof (ctx as Partial<PatternCtx>).createPattern === "function";

/**
 * One repeat of the motif (`tw × th` mm) rasterised at the env's resolution: the lattice drawn past
 * the tile's edges, so what the canvas keeps is exactly one period, edges included. Kept in the
 * layer cache by motif, colour, pitch and resolution.
 */
function motifTile(
  op: PatternOp,
  pitch: number,
  [tw, th]: [number, number],
  [w, h]: [number, number],
  env: Pick<RenderEnv, "pxPerMm" | "createLayer" | "layerCache">,
): CanvasImageSource {
  const key = `pattern:${op.patternId}:${op.colors[1]}:${pitch}@${env.pxPerMm}`;
  const cached = env.layerCache === undefined ? undefined : recallLayer(env.layerCache, key);
  if (cached !== undefined) return cached;
  const tile = env.createLayer(w, h);
  tile.ctx.scale(w / tw, h / th);
  tile.ctx.fillStyle = op.colors[1];
  tile.ctx.strokeStyle = op.colors[1];
  MOTIFS[op.patternId](tile.ctx, Math.max(tw, th) + pitch, pitch);
  if (env.layerCache !== undefined) rememberLayer(env.layerCache, key, tile.source);
  return tile.source;
}

/**
 * Fills `[-reach, reach]²` of the (rotated) pattern frame from one motif tile repeated by the
 * canvas, instead of drawing every motif (a 2 mm checker on a bag face is some 125 000 squares).
 * The tile is scaled so it spans exactly one period in mm, and anchored at the frame's origin like
 * the lattice. `false` where it cannot (a recording or PDF context without `createPattern`, a tile
 * too big): the caller draws the lattice.
 */
function tiledFill(
  ctx: Ctx2D,
  op: PatternOp,
  reach: number,
  pitch: number,
  env: Pick<RenderEnv, "pxPerMm" | "createLayer" | "layerCache"> | undefined,
): boolean {
  if (env === undefined || !canPattern(ctx) || !(env.pxPerMm > 0)) return false;
  const [across, down] = PERIOD[op.patternId];
  const period: [number, number] = [across * pitch, down * pitch];
  const px: [number, number] = [
    Math.max(1, Math.ceil(period[0] * env.pxPerMm)),
    Math.max(1, Math.ceil(period[1] * env.pxPerMm)),
  ];
  if (px[0] * px[1] > MAX_TILE_PIXELS) return false;
  const pattern = ctx.createPattern(motifTile(op, pitch, period, px, env), "repeat");
  if (pattern === null || typeof pattern.setTransform !== "function") return false;
  pattern.setTransform({ a: period[0] / px[0], b: 0, c: 0, d: period[1] / px[1], e: 0, f: 0 });
  ctx.fillStyle = pattern;
  ctx.fillRect(-reach, -reach, 2 * reach, 2 * reach);
  return true;
}

const MOTIFS: Record<PatternOp["patternId"], Motif> = {
  dots,
  stripes,
  checker,
  waves,
  grid,
  chevron,
};

/**
 * Paints a procedural background over `op.bounds` (flat mm): `colors[0]` is the ground, `colors[1]`
 * the motif, `scale` the motif pitch in mm, and the whole lattice turns by `rotationDeg` about the
 * centre of the bounds. Clipped to the bounds so a rotated lattice never spills over the edge.
 * With an `env` (its resolution and layers) and a context that makes patterns, the motif is drawn
 * once and repeated by the canvas; otherwise motif by motif.
 */
export function drawPattern(
  ctx: Ctx2D,
  op: PatternOp,
  env?: Pick<RenderEnv, "pxPerMm" | "createLayer" | "layerCache">,
): void {
  const { bounds, patternId, colors, rotationDeg } = op;
  const pitch = Number.isFinite(op.scale) ? Math.max(op.scale, MIN_PITCH_MM) : MIN_PITCH_MM;
  const { x, y, width, height } = bounds;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + width, y);
  ctx.lineTo(x + width, y + height);
  ctx.lineTo(x, y + height);
  ctx.closePath();
  ctx.clip();

  ctx.fillStyle = colors[0];
  ctx.fillRect(x, y, width, height);

  ctx.translate(x + width / 2, y + height / 2);
  ctx.rotate((rotationDeg * Math.PI) / 180);
  const reach = Math.hypot(width, height) / 2;
  if (!tiledFill(ctx, op, reach, pitch, env)) {
    ctx.fillStyle = colors[1];
    ctx.strokeStyle = colors[1];
    MOTIFS[patternId](ctx, reach, pitch);
  }
  ctx.restore();
}
