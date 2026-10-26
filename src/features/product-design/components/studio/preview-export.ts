import { isWebGLAvailable, printUnderlay, ProductViewer } from "../../engine";
import { blobBytes, canvasOf, EXPORT_MESSAGES, ExportError, pngOf } from "./export-canvas";
import type { StudioServices } from "./studio-context";
import { materialOf, paintSurface } from "./studio-paint";
import { IDLE_TEXTURE_PX } from "./use-surface-renderer";

/** What the preview export uses of a 3D viewer. */
export type PreviewViewer = Pick<
  ProductViewer,
  "setModel" | "setSurfaceTexture" | "resetView" | "screenshot" | "dispose"
>;

export type PreviewDeps = Pick<
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
  | "viewerRef"
> & {
  /**
   * A 3D viewer drawing into `canvas`, which is not on screen; `null` where there is no WebGL.
   * Test seam (default: a `ProductViewer` once WebGL is probed).
   */
  offscreenViewer?: (canvas: HTMLCanvasElement) => PreviewViewer | null;
};

const defaultOffscreenViewer = (canvas: HTMLCanvasElement): PreviewViewer | null =>
  isWebGLAvailable() ? new ProductViewer(canvas) : null;

/** Hands a WebGL context back now: a browser allows only a few at a time. */
function loseContext(canvas: HTMLCanvasElement) {
  try {
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    // Nothing to give back.
  }
}

/**
 * The model in a viewer of its own, on a canvas that is never shown: textured from the editor's
 * document like the on-screen one (at the sharp texture size), screenshot at its home angle, then
 * disposed with its WebGL context. `null` where there is no WebGL.
 */
async function offscreenPreview(deps: PreviewDeps, size: number) {
  const { template, surfaces } = deps;
  const canvas = canvasOf(size, size);
  const viewer = (deps.offscreenViewer ?? defaultOffscreenViewer)(canvas);
  if (viewer === null) return null;
  const textures: HTMLCanvasElement[] = [];
  try {
    viewer.setModel(template, surfaces);
    const underlay = printUnderlay(materialOf(template));
    for (const code of surfaces.order) {
      const surface = surfaces.byCode[code];
      if (!surface) continue;
      const texture = document.createElement("canvas");
      textures.push(texture);
      const { width, height } = surface.flatBounds;
      paintSurface(
        texture,
        deps,
        code,
        "texture",
        IDLE_TEXTURE_PX / Math.max(width, height),
        underlay,
      );
      viewer.setSurfaceTexture(code, texture);
    }
    viewer.resetView();
    return await blobBytes(await viewer.screenshot({ width: size, height: size }));
  } finally {
    viewer.dispose();
    loseContext(canvas);
    for (const texture of textures) {
      texture.width = 0;
      texture.height = 0;
    }
  }
}

/** The first print area (the cup body, the bag's front) drawn as on the product, centred. */
async function flatPreview(deps: PreviewDeps, size: number) {
  const code = deps.surfaces.order[0];
  const bounds = code === undefined ? undefined : deps.surfaces.byCode[code]?.flatBounds;
  const out = canvasOf(size, size);
  const ctx = out.getContext("2d");
  if (code === undefined || !bounds || !ctx) throw new ExportError(EXPORT_MESSAGES.canvas);
  const art = document.createElement("canvas");
  paintSurface(art, deps, code, "preview", size / Math.max(bounds.width, bounds.height));
  ctx.drawImage(art, (size - art.width) / 2, (size - art.height) / 2);
  return pngOf(out);
}

/**
 * The customer preview, `size` × `size` px PNG: the 3D model at its home angle, from the viewer on
 * screen or else from a short-lived offscreen one (when the preview fell back to its flat view); the
 * flat front only where there is no WebGL, or the 3D render fails.
 */
export async function exportPreview(deps: PreviewDeps, size: number): Promise<Uint8Array> {
  const viewer = deps.viewerRef.current;
  try {
    if (viewer) {
      viewer.resetView();
      return await blobBytes(await viewer.screenshot({ width: size, height: size }));
    }
    const offscreen = await offscreenPreview(deps, size);
    if (offscreen) return offscreen;
  } catch {
    // A failed render or a lost context: the flat preview stands in, as on screen.
  }
  return flatPreview(deps, size);
}
