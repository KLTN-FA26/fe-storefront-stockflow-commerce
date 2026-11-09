import type { DesignElement, ImageElement } from "../../document/schema";
import { effectiveDpi } from "../../geometry/units";
import type { PreflightIssue, SurfaceScope } from "../types";

// BR-DSG-001 (BE) and docs 12 §3 step 3 / edge cases (spec §7): below `minDpi` fails. There is no
// warning band any more (no warning level in the 2026-11 docs); the print raster stays at
// `printDpi(minDpi)`.

/** The print file's floor: its raster is `printDpi(minDpi)` DPI. */
export const PRINT_DPI_FLOOR = 300;

/** The DPI the print file is rendered at: `max(minDpi, 300)`. */
export const printDpi = (minDpi: number): number => Math.max(minDpi, PRINT_DPI_FLOOR);

/** The DPI the image reaches once placed: the worse of its two axes, at the placed (scaled) size. */
export function placedDpi(el: ImageElement): number {
  const { scale } = el.placement;
  return Math.min(
    effectiveDpi(el.naturalWidthPx, el.widthMm * scale),
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
  const dpi = placedDpi(el);
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
