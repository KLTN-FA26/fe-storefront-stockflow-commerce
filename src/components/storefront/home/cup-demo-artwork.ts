/**
 * The demo print of the home page's cup demo: the cup's unrolled print band drawn on a canvas. The same drawing is the
 * "2D" sheet and the texture wrapped on the "3D" cup, so a change shows on both. Colours come from theme tokens at run
 * time (`readToken`), never typed here.
 */

/** Width : height of the unrolled band of the 12oz sample cup (≈ 235 mm around × 96 mm high). */
export const ARTWORK_ASPECT = 2.45;

/** What the badge says until the visitor types a name. */
export const DEFAULT_BADGE_TEXT = "LOGO";
export const BADGE_TEXT_MAX = 14;

/** Paper stays white in both themes: it is the cup's material, not a surface of the page. */
const PAPER = "white";

/** The print colours a visitor can try, each a theme token. */
export const DEMO_SWATCHES = [
  { name: "Xanh dương", token: "--accent" },
  { name: "Xanh lá", token: "--positive-ink" },
  { name: "Tím", token: "--special-ink" },
  { name: "Cam đất", token: "--warning-ink" },
] as const;

/** A token's colour as the browser resolves it; empty on the server or when the token is missing. */
export function readToken(token: string): string {
  if (typeof window === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim();
}

/** One round badge with the shop's name, centred at (cx, cy); the text shrinks to stay inside. */
function drawBadge(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, ink: string, text: string) {
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = ink;
  ctx.lineWidth = r * 0.04;
  ctx.setLineDash([r * 0.04, r * 0.08]);
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.86, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let size = r * 0.5;
  ctx.font = `800 ${Math.round(size)}px system-ui, sans-serif`;
  const room = r * 1.5;
  const width = ctx.measureText(text).width;
  if (width > room) {
    size *= room / width;
    ctx.font = `800 ${Math.round(size)}px system-ui, sans-serif`;
  }
  ctx.fillText(text, cx, cy - r * 0.06);
  ctx.font = `600 ${Math.round(r * 0.17)}px system-ui, sans-serif`;
  ctx.fillText("COFFEE & TEA", cx, cy + r * 0.4);
}

/**
 * Draws the band: white paper, a coloured sleeve across the middle and two badges, a quarter of the way round on each
 * side of the glue seam (as many shops print them), so a turning cup always shows one; the size under the sleeve.
 */
export function drawCupArtwork(canvas: HTMLCanvasElement, ink: string, text: string): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const label = text.trim().toUpperCase() || DEFAULT_BADGE_TEXT;
  const { width: w, height: h } = canvas;
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = ink;
  ctx.fillRect(0, h * 0.24, w, h * 0.52);

  const cy = h * 0.5;
  const r = h * 0.22;
  drawBadge(ctx, w * 0.25, cy, r, ink, label);
  drawBadge(ctx, w * 0.75, cy, r, ink, label);

  ctx.fillStyle = ink;
  ctx.font = `600 ${Math.round(h * 0.06)}px system-ui, sans-serif`;
  ctx.fillText("12oz – 360 ml", w * 0.25, h * 0.87);
  ctx.fillText("12oz – 360 ml", w * 0.75, h * 0.87);
}
