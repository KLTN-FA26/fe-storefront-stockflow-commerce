import {
  compose,
  renderSurface,
  type ChromeColors,
  type ComposeTarget,
  type CustomizationTemplate,
  type MaterialKind,
  type PrintAreaCode,
  type RenderEnv,
  type SurfaceContent,
} from "../../engine";
import type { StudioServices } from "./studio-context";

type PaintServices = Pick<
  StudioServices,
  | "editor"
  | "template"
  | "surfaces"
  | "sizer"
  | "fonts"
  | "measure"
  | "images"
  | "layerCache"
  | "livePreview"
>;

const NO_CONTENT: SurfaceContent = { background: { kind: "none" }, elements: [] };

/**
 * Theme token behind each overlay colour, and the opacity of the veil outside the trim (it fades
 * the bleed into the stage instead of hiding it). A canvas cannot read CSS custom properties.
 */
const CHROME_TOKENS: Record<keyof ChromeColors, { token: string; alpha?: number }> = {
  guide: { token: "--accent" },
  safe: { token: "--positive" },
  bleed: { token: "--danger" },
  seam: { token: "--warning" },
  crease: { token: "--ink-tertiary" },
  shade: { token: "--bg-subtle", alpha: 0.72 },
  placeholder: { token: "--bg-muted" },
};

/** `#rgb` / `#rrggbb` with an opacity, as `rgba()`; any other colour string is returned as is. */
function withAlpha(color: string, alpha: number): string {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color)?.[1];
  if (hex === undefined) return color;
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
  const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** The overlay colours from the current theme; empty strings where nothing is styled (a test DOM). */
export function readChromeColors(): ChromeColors {
  const style = typeof document === "undefined" ? null : getComputedStyle(document.documentElement);
  const read = ({ token, alpha }: { token: string; alpha?: number }) => {
    const value = style?.getPropertyValue(token).trim() ?? "";
    return alpha === undefined || value === "" ? value : withAlpha(value, alpha);
  };
  return {
    guide: read(CHROME_TOKENS.guide),
    safe: read(CHROME_TOKENS.safe),
    bleed: read(CHROME_TOKENS.bleed),
    seam: read(CHROME_TOKENS.seam),
    crease: read(CHROME_TOKENS.crease),
    shade: read(CHROME_TOKENS.shade),
    placeholder: read(CHROME_TOKENS.placeholder),
  };
}

/** A glTF template never reaches the studio (no surfaces are built for it); paper is a neutral default. */
export const materialOf = (template: CustomizationTemplate): MaterialKind =>
  template.model.kind === "gltf" ? "paper-white" : template.model.material;

function newCanvas(widthPx: number, heightPx: number) {
  const canvas = document.createElement("canvas");
  canvas.width = widthPx;
  canvas.height = heightPx;
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("The browser gave no 2D context for an offscreen layer");
  return { canvas, ctx };
}

/** An offscreen canvas layer for the executor (`RenderEnv.createLayer`). */
export function createLayer(
  widthPx: number,
  heightPx: number,
): ReturnType<RenderEnv["createLayer"]> {
  const { canvas, ctx } = newCanvas(widthPx, heightPx);
  return { source: canvas, ctx };
}

/** The one composite canvas the studio's paints share (`RenderEnv.scratchLayer`). */
let scratch: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null = null;

/**
 * `RenderEnv.scratchLayer` for the paints that run every frame (editor, textures): one canvas that
 * grows to the largest composite asked for and is cleared over the part asked for each time, so a
 * translucent wrapped element does not allocate a canvas per paint. A paint is synchronous, so two
 * composites never use it at once; the executor draws one out before asking for the next.
 */
export function scratchLayer(
  widthPx: number,
  heightPx: number,
): ReturnType<RenderEnv["createLayer"]> {
  if (scratch === null) {
    scratch = newCanvas(widthPx, heightPx);
    return { source: scratch.canvas, ctx: scratch.ctx };
  }
  const { canvas, ctx } = scratch;
  if (canvas.width < widthPx || canvas.height < heightPx) {
    // Resizing clears the bitmap and resets the context.
    canvas.width = Math.max(canvas.width, widthPx);
    canvas.height = Math.max(canvas.height, heightPx);
  } else {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, widthPx, heightPx);
  }
  return { source: canvas, ctx };
}

/**
 * Lets the shared composite go when the studio closes (N2): it lives at module level and holds the
 * largest composite the studio drew, so without this its bitmap outlives the studio.
 */
export function releaseScratchLayer(): void {
  if (scratch === null) return;
  scratch.canvas.width = 0;
  scratch.canvas.height = 0;
  scratch = null;
}

/** Fills what the artwork left transparent with `color` (painted behind it, over the whole canvas). */
function paintUnderlay(canvas: HTMLCanvasElement, color: string) {
  const ctx = canvas.getContext("2d");
  if (ctx === null) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "destination-over";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

/**
 * Composes one surface of the editor's current document (or the live preview's, while a stroke is
 * being drawn) for `target` and paints it onto `canvas` at `pxPerMm` (proxy images; not decoded
 * yet = placeholder), over `underlay` when one is given (an opaque stock's texture). No-op without
 * a 2D context.
 */
export function paintSurface(
  canvas: HTMLCanvasElement,
  services: PaintServices,
  code: PrintAreaCode,
  target: ComposeTarget,
  pxPerMm: number,
  underlay: string | null = null,
): void {
  const surface = services.surfaces.byCode[code];
  if (surface === undefined || !(pxPerMm > 0)) return;
  const ops = compose({
    surface,
    content:
      (services.livePreview.document ?? services.editor.store.getState().document).surfaces[code] ??
      NO_CONTENT,
    target,
    material: materialOf(services.template),
    sizer: services.sizer,
    fonts: services.fonts,
    measure: services.measure,
  });
  const env: RenderEnv = {
    pxPerMm,
    chrome: readChromeColors(),
    image: (assetId) => services.images.get(assetId, "proxy"),
    createLayer,
    scratchLayer,
    layerCache: services.layerCache,
  };
  renderSurface(canvas, ops, env, surface.flatBounds);
  if (underlay !== null) paintUnderlay(canvas, underlay);
}
