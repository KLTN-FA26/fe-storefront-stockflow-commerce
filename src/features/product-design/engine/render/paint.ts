import type { Mat2D } from "../geometry/affine";
import type { PathCmd } from "../geometry/types";
import type { Ctx2D, RenderEnv } from "./execute";
import { fontCss } from "./fonts";
import { shapedGraphemes } from "./graphemes";
import type { ImageOp, TextOp } from "./ops";

/** Starts a new path and traces `path` (flat mm) into it; the caller fills, strokes or clips. */
export function tracePath(ctx: Ctx2D, path: PathCmd[]): void {
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

/** Runs `paint` in the element's local frame: `matrix` applied, `opacity` set, state restored after. */
export function placed(ctx: Ctx2D, matrix: Mat2D, opacity: number, paint: () => void): void {
  ctx.save();
  ctx.transform(...matrix);
  ctx.globalAlpha = opacity;
  paint();
  ctx.restore();
}

/** Paints the image into its box, or a muted placeholder when it is not decoded yet. */
export function paintImage(ctx: Ctx2D, op: ImageOp, env: RenderEnv): void {
  const { x, y, width, height } = op.box;
  const image = env.image(op.assetId);
  if (image === undefined) {
    ctx.fillStyle = env.chrome.placeholder;
    ctx.fillRect(x, y, width, height);
    return;
  }
  ctx.drawImage(image, x, y, width, height);
}

/**
 * Each grapheme of `text` with its x: where it starts in the line as the context shapes it
 * (`shapedGraphemes`, kerned to the one before it, measured in mm like the font), plus
 * `spacingMm` after each grapheme before it. The same placement as the arc text's.
 */
function spacedGlyphs(ctx: Ctx2D, text: string, x0: number, spacingMm: number) {
  const shaped = shapedGraphemes(text, (part) => ctx.measureText(part).width);
  return shaped.map(({ text: glyph, start }, i): [string, number] => [
    glyph,
    x0 + start + i * spacingMm,
  ]);
}

/**
 * Sets `ctx` up to draw `op`'s text: its font, the alphabetic baseline, the fill and the outline's
 * stroke. The font is sized in mm, so the context's px-per-mm scale makes it the right size. A
 * centred stroke is half covered by the fill, so the stroke is twice as wide as the outline the
 * customer asked for.
 */
export function applyTextStyle(ctx: Ctx2D, op: TextOp): void {
  const { layout, outline } = op;
  ctx.font = fontCss(layout, layout.fontSizeMm);
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = op.color;
  if (outline) {
    ctx.strokeStyle = outline.color;
    ctx.lineWidth = outline.widthMm * 2;
    ctx.lineJoin = "round";
  }
}

/**
 * Paints the text lines (outline first, then fill), styled by `applyTextStyle`. The letter spacing
 * is sized in mm, like the font.
 *
 * Letter spacing goes through the context's own `letterSpacing` where it has one (that keeps
 * kerning and ligatures); otherwise every grapheme is placed by hand where the context's own
 * shaping puts it (`spacedGlyphs`, kerning kept), so a combining mark stays on its letter.
 */
export function paintText(ctx: Ctx2D, op: TextOp): void {
  const { layout, outline } = op;
  const spacing = layout.letterSpacingMm;
  applyTextStyle(ctx, op);
  const native = spacing !== 0 && "letterSpacing" in ctx;
  if (native) ctx.letterSpacing = `${spacing}px`;

  for (const { text, xMm, baselineMm } of layout.lines) {
    if (text === "") continue;
    if (spacing === 0 || native) {
      if (outline) ctx.strokeText(text, xMm, baselineMm);
      ctx.fillText(text, xMm, baselineMm);
      continue;
    }
    const glyphs = spacedGlyphs(ctx, text, xMm, spacing);
    if (outline) for (const [glyph, x] of glyphs) ctx.strokeText(glyph, x, baselineMm);
    for (const [glyph, x] of glyphs) ctx.fillText(glyph, x, baselineMm);
  }
}
