import type { Mat2D } from "../geometry/affine";
import type { Ctx2D, RenderEnv } from "./execute";
import { fontCss } from "./fonts";
import type { WarpableOp } from "./ops";

export type ImageOp = Extract<WarpableOp, { op: "image" }>;
export type TextOp = Extract<WarpableOp, { op: "text" }>;

/** Runs `paint` in the element's local frame: `matrix` applied, `opacity` set, state restored after. */
export function placed(ctx: Ctx2D, matrix: Mat2D, opacity: number, paint: () => void): void {
  ctx.save();
  ctx.transform(...matrix);
  ctx.globalAlpha = opacity;
  paint();
  ctx.restore();
}

/** Paints the image into its box, or a muted placeholder when it is not decoded yet. Returns whether the image was drawn. */
export function paintImage(ctx: Ctx2D, op: ImageOp, env: RenderEnv): boolean {
  const { x, y, width, height } = op.box;
  const image = env.image(op.assetId);
  if (image === undefined) {
    ctx.fillStyle = env.chrome.placeholder;
    ctx.fillRect(x, y, width, height);
    return false;
  }
  ctx.drawImage(image, x, y, width, height);
  return true;
}

/** Each code point of `text` with its x, advancing by the measured glyph width plus `spacingMm`. */
function spacedGlyphs(ctx: Ctx2D, text: string, x0: number, spacingMm: number) {
  let x = x0;
  return [...text].map((glyph): [string, number] => {
    const at = x;
    x += ctx.measureText(glyph).width + spacingMm;
    return [glyph, at];
  });
}

/**
 * Paints the text lines (outline first, then fill). The font and the letter spacing are sized in
 * mm, so the context's px-per-mm scale makes them the right size. A centred stroke is half covered
 * by the fill, so the stroke is twice as wide as the outline the customer asked for.
 *
 * Letter spacing goes through the context's own `letterSpacing` where it has one (that keeps
 * kerning and ligatures); otherwise every code point is placed by hand, `measureText` apart.
 */
export function paintText(ctx: Ctx2D, op: TextOp): void {
  const { layout, outline } = op;
  const spacing = layout.letterSpacingMm;
  ctx.font = fontCss(layout, layout.fontSizeMm);
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = op.color;
  if (outline) {
    ctx.strokeStyle = outline.color;
    ctx.lineWidth = outline.widthMm * 2;
    ctx.lineJoin = "round";
  }
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
