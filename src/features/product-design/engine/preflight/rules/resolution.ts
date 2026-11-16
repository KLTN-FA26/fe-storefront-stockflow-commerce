import type { DesignElement, ImageElement } from "../../document/schema";
import { polarWarp, warpStretch } from "../../geometry/polar-warp";
import { effectiveDpi } from "../../geometry/units";
import type { PrintSurface } from "../../surfaces/types";
import type { PreflightIssue, SurfaceScope } from "../types";

// BR-DSG-001 (BE) and docs 12 §3 step 3 / edge cases (spec §7): below `minDpi` fails. There is no
// warning band any more (no warning level in the 2026-11 docs); the print raster stays at
// `printDpi(minDpi)`.

/** The print file's floor: its raster is `printDpi(minDpi)` DPI. */
export const PRINT_DPI_FLOOR = 300;

/** The DPI the print file is rendered at: `max(minDpi, 300)`. */
export const printDpi = (minDpi: number): number => Math.max(minDpi, PRINT_DPI_FLOOR);

/**
 * The DPI the image reaches once placed: the worse of its two axes, at the placed (scaled) size.
 * Bent around the cup on `surface`, its outer edge is stretched by `warpStretch` (spec §4), so the
 * horizontal DPI is divided by it.
 */
export function placedDpi(el: ImageElement, surface?: PrintSurface): number {
  const { scale } = el.placement;
  const warp =
    surface &&
    polarWarp(el, surface, {
      x: -el.widthMm / 2,
      y: -el.heightMm / 2,
      width: el.widthMm,
      height: el.heightMm,
    });
  const stretch = warp ? warpStretch(warp) : 1;
  return Math.min(
    effectiveDpi(el.naturalWidthPx, el.widthMm * scale) / stretch,
    effectiveDpi(el.naturalHeightPx, el.heightMm * scale),
  );
}

/** Where `dpi` stands against the template's `minDpi`: under it, or fine. */
export function dpiTier(dpi: number, minDpi: number): "below-min" | "ok" {
  return dpi < minDpi ? "below-min" : "ok";
}

/** `DPI_BELOW_MIN` for an image; nothing for the other element kinds. */
export function resolutionIssues(scope: SurfaceScope, el: DesignElement): PreflightIssue[] {
  if (el.type !== "image") return [];

  const { minDpi } = scope.input.template;
  const dpi = placedDpi(el, scope.surface);
  if (dpiTier(dpi, minDpi) === "ok") return [];
  return [
    {
      ruleId: "DPI_BELOW_MIN",
      level: "fail",
      message: `Ảnh chỉ đạt ${Math.round(dpi)} DPI, thấp hơn mức tối thiểu ${minDpi} DPI.`,
      surfaceCode: scope.code,
      elementId: el.id,
    },
  ];
}
