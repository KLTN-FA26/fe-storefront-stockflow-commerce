import type { DesignElement, ImageElement } from "../../document/schema";
import { effectiveDpi } from "../../geometry/units";
import type { PreflightIssue, SurfaceScope } from "../types";

// BR-DSG-001 (BE) and docs 12 §3 step 3 / edge cases (spec §8). Low-DPI policy (spec §2.4, BE
// proposal Q9, decided 2026-10-26, BA sign-off pending): below `minDpi` fails ("thiếu DPI" blocks
// confirmation), below the print file's DPI warns ("ảnh độ phân giải thấp" may go on, accepted).

/** The print file's floor (spec §9): its raster is `printDpi(minDpi)` DPI. */
export const PRINT_DPI_FLOOR = 300;

/**
 * The DPI the print file is rendered at: `max(minDpi, 300)`. An image under it is upscaled in the
 * print file, so it prints soft even when it meets the template's minimum.
 */
export const printDpi = (minDpi: number): number => Math.max(minDpi, PRINT_DPI_FLOOR);

/** The DPI the image reaches once placed: the worse of its two axes, at the placed (scaled) size. */
export function placedDpi(el: ImageElement): number {
  const { scale } = el.placement;
  return Math.min(
    effectiveDpi(el.naturalWidthPx, el.widthMm * scale),
    effectiveDpi(el.naturalHeightPx, el.heightMm * scale),
  );
}

/**
 * Where `dpi` stands against the template's `minDpi`: under it, under the print file's DPI
 * (`printDpi(minDpi)`: upscaled when printed), or fine. A template whose `minDpi` is 300 or more has
 * no "low" band: everything it accepts prints at full resolution.
 */
export function dpiTier(dpi: number, minDpi: number): "below-min" | "low" | "ok" {
  if (dpi < minDpi) return "below-min";
  return dpi < printDpi(minDpi) ? "low" : "ok";
}

/** `DPI_BELOW_MIN` or `DPI_LOW` for an image; nothing for the other element kinds. */
export function resolutionIssues(scope: SurfaceScope, el: DesignElement): PreflightIssue[] {
  if (el.type !== "image") return [];

  const { minDpi } = scope.input.template;
  const dpi = placedDpi(el);
  const at = { surfaceCode: scope.code, elementId: el.id };

  const tier = dpiTier(dpi, minDpi);
  if (tier === "below-min") {
    return [
      {
        ruleId: "DPI_BELOW_MIN",
        level: "fail",
        message: `Ảnh chỉ đạt ${Math.round(dpi)} DPI, thấp hơn mức tối thiểu ${minDpi} DPI.`,
        ...at,
      },
    ];
  }
  if (tier === "low") {
    return [
      {
        ruleId: "DPI_LOW",
        level: "warning",
        message: `Ảnh đạt ${Math.round(dpi)} DPI, bản in có thể hơi mờ.`,
        ...at,
      },
    ];
  }
  return [];
}
