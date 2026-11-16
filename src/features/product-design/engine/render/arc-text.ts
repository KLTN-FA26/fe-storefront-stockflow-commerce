import type { TextElement } from "../document/schema";
import { applyToPoint, type Mat2D } from "../geometry/affine";
import { wrapColumnMatrix } from "../geometry/element";
import { boundsOf } from "../geometry/polygon";
import type { RectMm } from "../geometry/types";
import type { PrintSurface } from "../surfaces/types";
import type { Ctx2D, RenderEnv } from "./execute";
import type { FontRegistry, TextMeasurer } from "./fonts";
import { shapedGraphemes, type ShapedGrapheme } from "./graphemes";
import type { DrawOp } from "./ops";
import { applyTextStyle } from "./paint";
import { fitGrid } from "./raster";
import { REFERENCE_SIZE_PX, referenceFont, type TextLayout, type TextLine } from "./text-layout";

/**
 * One grapheme of a wrapped text: `text` drawn at element-local (`xMm`, `baselineMm`) through
 * `matrix`, which turns it to its own place on the arc. `widthMm` is its own advance.
 */
export type ArcGlyph = {
  text: string;
  xMm: number;
  widthMm: number;
  baselineMm: number;
  matrix: Mat2D;
};

type ArcTextOp = Extract<DrawOp, { op: "arcText" }>;

/** Lines kept measured for each measurer; the least recently used goes first. */
const MAX_MEASURED_LINES = 256;
const measuredLines = new WeakMap<TextMeasurer, Map<string, ShapedGrapheme[]>>();

/** Room beside a glyph's advance for its ink (italics, swashes), in em. */
const INK_OVERHANG_EM = 0.25;

/**
 * `line`'s graphemes measured at the reference size, kept for the measurer (its last
 * `MAX_MEASURED_LINES` lines), so a text composed every frame of a drag, or resized or spaced
 * with a slider, is measured once per line and face. The key holds the line's own width at the
 * reference size, one measure per line: it does not change with the size or the letter spacing,
 * and it does change when a face finishes loading after a paint, so the line is measured again in
 * the face it is now drawn in.
 */
function measuredLine(line: TextLine, css: string, measure: TextMeasurer): ShapedGrapheme[] {
  let kept = measuredLines.get(measure);
  if (kept === undefined) {
    kept = new Map();
    measuredLines.set(measure, kept);
  }
  const key = `${css}|${measure(line.text, css).width}|${line.text}`;
  const glyphs = kept.get(key) ?? shapedGraphemes(line.text, (text) => measure(text, css).width);
  kept.delete(key);
  kept.set(key, glyphs);
  for (const oldest of kept.keys()) {
    if (kept.size <= MAX_MEASURED_LINES) break;
    kept.delete(oldest);
  }
  return glyphs;
}

/**
 * Where each grapheme of a wrapped text goes (spec §5.2). Its local x is where it starts in the
 * shaped line (kerned to the grapheme before it, `shapedGraphemes`) plus one letter spacing after
 * each grapheme before it, the sum `layoutText` makes of a whole line, so the last glyph ends
 * exactly where the line does and the bent text keeps the spacing of the same text unbent. Its
 * matrix is `wrapColumnMatrix` at the grapheme's middle: every glyph stands upright at its own angle
 * on the arc. Graphemes, not code points, so "ệ" typed as `e` and two combining marks stays one
 * glyph. An empty line has none. For a line measured before, only the matrices are computed anew.
 */
export function arcGlyphs(
  el: TextElement,
  layout: TextLayout,
  surface: PrintSurface,
  fonts: FontRegistry,
  measure: TextMeasurer,
): ArcGlyph[] {
  const css = referenceFont(el, fonts);
  const mmPerPx = layout.fontSizeMm / REFERENCE_SIZE_PX;
  return layout.lines.flatMap((line) =>
    measuredLine(line, css, measure).map((glyph, i): ArcGlyph => {
      const xMm = line.xMm + glyph.start * mmPerPx + i * layout.letterSpacingMm;
      const widthMm = glyph.width * mmPerPx;
      return {
        text: glyph.text,
        xMm,
        widthMm,
        baselineMm: line.baselineMm,
        matrix: wrapColumnMatrix(el.placement, surface, xMm + widthMm / 2),
      };
    }),
  );
}

/** Runs `draw` with the context turned to `glyph`'s place on the arc. */
function onArc(ctx: Ctx2D, glyph: ArcGlyph, draw: (text: string, x: number, y: number) => void) {
  ctx.save();
  ctx.transform(...glyph.matrix);
  draw(glyph.text, glyph.xMm, glyph.baselineMm);
  ctx.restore();
}

/**
 * Every glyph's outline, then every glyph's fill, each through its own matrix, styled as
 * `paintText` styles the rigid text. The letter spacing is in the glyphs' positions already, so
 * the context adds none.
 */
function paintGlyphs(ctx: Ctx2D, { source, glyphs }: ArcTextOp): void {
  applyTextStyle(ctx, source);
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  if (source.outline) {
    for (const glyph of glyphs) onArc(ctx, glyph, (text, x, y) => ctx.strokeText(text, x, y));
  }
  for (const glyph of glyphs) onArc(ctx, glyph, (text, x, y) => ctx.fillText(text, x, y));
}

/**
 * The flat-mm box of every glyph's ink: its advance grown sideways by `INK_OVERHANG_EM`, from the
 * font's measured ascent above its baseline to its descent below (stacked capital marks included,
 * at any line height), and the outline around all of it.
 */
function inkBounds({ source, glyphs }: ArcTextOp): RectMm | undefined {
  if (glyphs.length === 0) return undefined;
  const { layout, outline } = source;
  const outlineMm = outline?.widthMm ?? 0;
  const side = layout.fontSizeMm * INK_OVERHANG_EM + outlineMm;
  return boundsOf(
    glyphs.flatMap(({ xMm, widthMm, baselineMm, matrix }) => {
      const ys = [
        baselineMm - layout.ascentMm - outlineMm,
        baselineMm + layout.descentMm + outlineMm,
      ];
      return [xMm - side, xMm + widthMm + side].flatMap((x) =>
        ys.map((y) => applyToPoint(matrix, { x, y })),
      );
    }),
  );
}

/**
 * A translucent text: every glyph drawn at full alpha into one layer on the output's own pixel grid
 * over the text's bounds (cut to the target's rows, so a print band builds only its own), then
 * drawn back pixel for pixel at the element's opacity. The outlines of neighbouring glyphs overlap,
 * so drawn one by one at the opacity they would show darker where they do. The layer is the env's
 * scratch layer when it has one: handed back cleared with an identity transform (the
 * `RenderEnv.scratchLayer` contract), so its transform is set here without a reset, and only the
 * part asked for is read back, before the next text asks for it.
 */
function drawTranslucent(ctx: Ctx2D, op: ArcTextOp, env: RenderEnv): void {
  const bounds = inkBounds(op);
  const grid = bounds && fitGrid(bounds, env.pxPerMm, { target: env.targetPx });
  if (grid === undefined) return;
  const { x, y, width, height, k } = grid;
  const group = env.scratchLayer ? env.scratchLayer(width, height) : env.createLayer(width, height);
  group.ctx.translate(-x, -y);
  group.ctx.scale(k, k);
  paintGlyphs(group.ctx, op);

  ctx.save();
  ctx.globalAlpha = op.source.opacity;
  ctx.drawImage(group.source, 0, 0, width, height, x / k, y / k, width / k, height / k);
  ctx.restore();
}

/**
 * Draws a wrapped text as vector glyphs at the output resolution, each through its own matrix, no
 * resample (spec §5.2). An opaque text goes straight onto the context; a translucent one through
 * one composite (`drawTranslucent`).
 */
export function drawArcText(ctx: Ctx2D, op: ArcTextOp, env: RenderEnv): void {
  if (op.source.opacity < 1) {
    drawTranslucent(ctx, op, env);
    return;
  }
  ctx.save();
  ctx.globalAlpha = op.source.opacity;
  paintGlyphs(ctx, op);
  ctx.restore();
}
