import {
  addElement,
  clampPlacement,
  MAX_ELEMENTS_PER_SURFACE,
  mmToPx,
  type ImageElement,
  type PrintSurface,
} from "../../engine";
import type { DesignAsset } from "../../types";
import { SCALE_RANGE } from "./element-actions";
import { frameOf, largestScaleInSafe, pullIntoSafe, safeBox, type SafeBox } from "./safe-fit";
import { STUDIO_ANNOUNCEMENTS } from "./studio-announcer";
import type { StudioServices } from "./studio-context";

/** What of the safe width a new image takes: room left around a logo to move and resize it. */
const NEW_IMAGE_SAFE_WIDTH_SHARE = 0.6;
/** Print resolution an SVG logo is rasterised for, and the least width it is drawn at. */
const SVG_PRINT_DPI = 300;
export const SVG_MIN_RASTER_WIDTH_PX = 2000;

/**
 * A new text or image on the cup bends along its body ("Uốn theo thân ly"): drawn straight on the
 * fan-shaped dieline it would come out curved once the dieline is rolled into a cup. A flat face
 * keeps it rigid. The customer can still switch the bend off to turn the element freely.
 */
export const bendOnSurface = (surface: PrintSurface): { wrap?: true } =>
  surface.kind === "sector" ? { wrap: true } : {};

/** The width an SVG logo is drawn at for the surface: 300 DPI over 60 % of its safe width, ≥ 2000 px. */
export function svgRasterWidthPx(surface: PrintSurface): number {
  const printMm = NEW_IMAGE_SAFE_WIDTH_SHARE * safeBox(surface).width;
  return Math.max(SVG_MIN_RASTER_WIDTH_PX, Math.ceil(mmToPx(printMm, SVG_PRINT_DPI)));
}

/** A new image's frame: 60 % of the safe width, its ratio kept, no taller than the safe height. */
function newImageSize(asset: DesignAsset, safe: SafeBox) {
  const ratio = asset.heightPx / asset.widthPx;
  const widthMm = Math.min(NEW_IMAGE_SAFE_WIDTH_SHARE * safe.width, safe.height / ratio);
  return { widthMm, heightMm: widthMm * ratio };
}

type Services = Pick<StudioServices, "editor" | "surfaces" | "announce">;

/**
 * Adds the stored image to the active surface, centred on its safe area and selected, as one undo
 * step, and hands the pointer back to the select tool (only it moves and resizes). `false` when
 * nothing was added: the design is read-only or the surface already holds the most it may. With
 * `at` (a point of the surface, `u` and `v`) it is centred there instead, pulled in as far as its
 * whole outline needs to stay inside the safe area.
 */
export function placeImage(
  { editor, surfaces, announce }: Services,
  asset: DesignAsset,
  at?: { u: number; v: number },
): boolean {
  const { activeSurface: code, readOnly, document } = editor.store.getState();
  const surface = surfaces.byCode[code];
  if (!surface || readOnly) return false;
  if ((document.surfaces[code]?.elements.length ?? 0) >= MAX_ELEMENTS_PER_SURFACE) return false;

  const safe = safeBox(surface);
  const sized: ImageElement = {
    id: editor.newId(),
    type: "image",
    name: asset.originalName,
    hidden: false,
    locked: false,
    opacity: 1,
    placement: clampPlacement({ u: safe.u, v: safe.v, rotationDeg: 0, scale: 1 }, surface),
    assetId: asset.assetId,
    naturalWidthPx: asset.widthPx,
    naturalHeightPx: asset.heightPx,
    ...newImageSize(asset, safe),
    flipX: false,
    flipY: false,
    ...bendOnSurface(surface),
  };
  // Then shrunk, ratio and all, until its whole outline is inside the safe area: a tall frame on
  // the cup would poke its top corners past the outer arc. The placement scale stays 1, so the DPI
  // reading is the frame's own.
  const shrink = largestScaleInSafe(sized, frameOf(sized), surface, SCALE_RANGE.min, 1);
  const fitted: ImageElement =
    shrink === 1
      ? sized
      : { ...sized, widthMm: sized.widthMm * shrink, heightMm: sized.heightMm * shrink };
  const element: ImageElement = at
    ? {
        ...fitted,
        placement: pullIntoSafe(
          fitted,
          surface,
          clampPlacement({ ...fitted.placement, ...at }, surface),
        ),
      }
    : fitted;
  editor.apply((doc) => addElement(doc, code, element));
  editor.select(element.id);
  editor.setTool("select");
  announce(STUDIO_ANNOUNCEMENTS.imageAdded);
  return true;
}

/**
 * What changes when `asset` replaces the element's image: the file and its pixel size, and a size
 * with the new ratio that fills as much of the old frame as it can, so the image stays where it is.
 */
export function replacementPatch(element: ImageElement, asset: DesignAsset): Partial<ImageElement> {
  const ratio = asset.heightPx / asset.widthPx;
  const widthMm = Math.min(element.widthMm, element.heightMm / ratio);
  return {
    name: asset.originalName,
    assetId: asset.assetId,
    naturalWidthPx: asset.widthPx,
    naturalHeightPx: asset.heightPx,
    widthMm,
    heightMm: widthMm * ratio,
  };
}
