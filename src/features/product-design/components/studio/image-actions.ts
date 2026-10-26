import {
  addElement,
  clampPlacement,
  containmentPoints,
  elementOutline,
  MAX_ELEMENTS_PER_SURFACE,
  mmToPx,
  surfaceSnapTargets,
  type DesignElement,
  type ImageElement,
  type Placement,
  type PrintSurface,
  type RectMm,
} from "../../engine";
import type { DesignAsset } from "../../types";
import { SCALE_RANGE } from "./element-actions";
import { STUDIO_ANNOUNCEMENTS } from "./studio-announcer";
import type { StudioServices } from "./studio-context";

/** What of the safe width a new image takes: room left around a logo to move and resize it. */
const NEW_IMAGE_SAFE_WIDTH_SHARE = 0.6;
/** Print resolution an SVG logo is rasterised for, and the least width it is drawn at. */
const SVG_PRINT_DPI = 300;
export const SVG_MIN_RASTER_WIDTH_PX = 2000;
const FIT_STEPS = 30;

/** The safe area of a surface as the studio reads it: its centre and its extent in `u` and `v`. */
export type SafeBox = { u: number; v: number; width: number; height: number };

/**
 * `surfaceSnapTargets` lists the centre lines (across, down), then the safe edges (left, right,
 * top, bottom), measured along the surface's own centre lines, so a cup's seam flap is outside.
 */
export function safeBox(surface: PrintSurface): SafeBox {
  const targets = surfaceSnapTargets(surface, []);
  const at = (index: number, axis: "u" | "v") => targets[index]?.[axis] ?? 0;
  return {
    u: at(0, "u"),
    v: at(1, "v"),
    width: at(3, "u") - at(2, "u"),
    height: at(5, "v") - at(4, "v"),
  };
}

/** The width an SVG logo is drawn at for the surface: 300 DPI over 60 % of its safe width, ≥ 2000 px. */
export function svgRasterWidthPx(surface: PrintSurface): number {
  const printMm = NEW_IMAGE_SAFE_WIDTH_SHARE * safeBox(surface).width;
  return Math.max(SVG_MIN_RASTER_WIDTH_PX, Math.ceil(mmToPx(printMm, SVG_PRINT_DPI)));
}

/** The local box of an image: its frame, centred on the origin. */
const frameOf = (element: ImageElement): RectMm => ({
  x: -element.widthMm / 2,
  y: -element.heightMm / 2,
  width: element.widthMm,
  height: element.heightMm,
});

/**
 * The largest scale in `[low, high]` at which the element, whose local `box` is given, centred and
 * upright on the safe area, has its whole outline inside it: `high` when that fits, else found by
 * halving (`low` when nothing larger does). Halving, not arithmetic, because a cup's safe area is a
 * sector: a flat box as wide as the safe width at its middle sticks out at the bottom corners, and
 * one as tall as the safe height at the top ones; and the middle of its bottom edge leaves the
 * concave foot before its corners do, so the test reads `containmentPoints`, not only corners. A
 * text's box grows with its font size, so the scale found for a text is the factor to shrink its
 * size by.
 */
export function largestScaleInSafe(
  element: DesignElement,
  box: RectMm,
  surface: PrintSurface,
  low: number,
  high: number,
): number {
  const safe = safeBox(surface);
  const centre = { u: safe.u, v: safe.v, rotationDeg: 0 };
  const fits = (scale: number) => {
    const placed = { ...element, placement: { ...centre, scale } };
    const outline = elementOutline(placed, surface, box);
    return containmentPoints(placed, surface, outline).every((point) =>
      surface.contains(point, "safe"),
    );
  };

  if (fits(high)) return high;
  for (let step = 0; step < FIT_STEPS; step++) {
    const middle = (low + high) / 2;
    if (fits(middle)) low = middle;
    else high = middle;
  }
  return low;
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
 * nothing was added: the design is read-only or the surface already holds the most it may.
 */
export function placeImage({ editor, surfaces, announce }: Services, asset: DesignAsset): boolean {
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
  };
  // Then shrunk, ratio and all, until its whole outline is inside the safe area: a tall frame on
  // the cup would poke its top corners past the outer arc. The placement scale stays 1, so the DPI
  // reading is the frame's own.
  const shrink = largestScaleInSafe(sized, frameOf(sized), surface, SCALE_RANGE.min, 1);
  const element: ImageElement =
    shrink === 1
      ? sized
      : { ...sized, widthMm: sized.widthMm * shrink, heightMm: sized.heightMm * shrink };
  editor.apply((doc) => addElement(doc, code, element));
  editor.select(element.id);
  editor.setTool("select");
  announce(STUDIO_ANNOUNCEMENTS.imageAdded);
  return true;
}

/**
 * The placement that fits the image in the safe area: centred, upright, and as large as keeps its
 * whole outline inside (found by halving, because a cup's safe area is a sector: a flat image as
 * wide as the safe width at its middle would stick out at the bottom corners). Within the scale
 * range the handles allow.
 */
export function fitPlacement(element: ImageElement, surface: PrintSurface): Placement {
  const safe = safeBox(surface);
  const high = Math.max(
    SCALE_RANGE.min,
    Math.min(SCALE_RANGE.max, safe.width / element.widthMm, safe.height / element.heightMm),
  );
  return {
    u: safe.u,
    v: safe.v,
    rotationDeg: 0,
    scale: largestScaleInSafe(element, frameOf(element), surface, SCALE_RANGE.min, high),
  };
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
