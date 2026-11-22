import type { DesignElement } from "../../document/schema";
import { containmentPoints, elementOutline } from "../../geometry/element";
import { alongEdges, pointInPolygon } from "../../geometry/polygon";
import type { PointMm } from "../../geometry/types";
import type { PrintSurface } from "../../surfaces/types";
import type { PreflightIssue, SurfaceScope } from "../types";

// BR-02 (docs 12 §6): content must not leave the print area + bleed. CROSSES_SAFE_AREA and ON_SEAM
// fail text, images and drawings (docs 12 §3 step 4: text and logos stay inside the safe zone,
// spec §7; BE `LayoutPreflight.areaIssue` checks "an image or a drawing"). An image or a drawing
// that covers the whole trim is a background and may run into the bleed (PO 2026-11-22, Q5 / SD-2,
// SD-3: as the BE); the surface background, which is not an element, always may.

/**
 * Outline points are tested this far (mm) inside the outline, so float noise on an element laid
 * exactly on a boundary (a background sized to the bleed box) is not read as crossing it.
 */
const EDGE_TOLERANCE_MM = 0.001;

/** `outline` with every point moved `EDGE_TOLERANCE_MM` towards the outline's centre. */
function pulledIn(outline: PointMm[]): PointMm[] {
  const cx = outline.reduce((sum, p) => sum + p.x, 0) / outline.length;
  const cy = outline.reduce((sum, p) => sum + p.y, 0) / outline.length;
  return outline.map((p) => {
    const distance = Math.hypot(cx - p.x, cy - p.y);
    if (distance <= EDGE_TOLERANCE_MM) return p;
    const k = EDGE_TOLERANCE_MM / distance;
    return { x: p.x + (cx - p.x) * k, y: p.y + (cy - p.y) * k };
  });
}

/**
 * Whether the element covers any of the trim: an edge runs through it, or it encloses the surface's
 * centre (BE `LayoutPreflight.overlapsTrim`). A full-bleed background has every corner in the bleed
 * strip yet covers the whole trim, so the corners alone are not enough.
 */
function overlapsTrim(surface: PrintSurface, outline: PointMm[]): boolean {
  const centre = surface.toFlat(
    (surface.uRange[0] + surface.uRange[1]) / 2,
    (surface.vRange[0] + surface.vRange[1]) / 2,
  );
  return (
    alongEdges(outline).some((p) => surface.contains(p, "trim")) || pointInPolygon(centre, outline)
  );
}

/**
 * Whether the outline encloses every sample of the trim (BE `areaIssue`:
 * `surface.trimSamples().stream().allMatch(p -> inPolygon(p, outline))`): a background.
 */
const coversTrim = (surface: PrintSurface, outline: PointMm[]) =>
  surface.trimSamples().every((p) => pointInPolygon(p, outline));

/**
 * Where an element sits on its surface. `OUTSIDE_PRINT_AREA` when any of it passes the bleed or it
 * covers none of the trim (BE `LayoutPreflight.areaIssue`). Otherwise an image or a drawing that
 * covers the whole trim (`coversTrim`) is a background: nothing more is checked, as the BE returns
 * nothing for it (it reaches the bleed and the glue flap on purpose). For any other element:
 * `CROSSES_SAFE_AREA` when any of it is outside the safe line (between safe line and trim, or in
 * the bleed, where it is cut off), and `ON_SEAM` when any of it is on the cup's glue flap (the BE's
 * safe line stops at the flap too). `CROSSES_SAFE_AREA` is not reported for an element that already
 * got `OUTSIDE_PRINT_AREA` (it would say the same thing twice); `ON_SEAM` may still be reported with
 * either. "Any of it" is read off `containmentPoints`: on the cup the middle of an edge counts too.
 */
export function areaIssues(scope: SurfaceScope, el: DesignElement): PreflightIssue[] {
  const { input, surface, code } = scope;
  const outline = pulledIn(elementOutline(el, surface, input.sizer(el)));
  const points = containmentPoints(el, surface, outline);
  const at = { surfaceCode: code, elementId: el.id };

  const issues: PreflightIssue[] = [];
  // BE `anchorIssue`: a text anchored outside the trim is outside the print area, wherever its lines reach (C11).
  const anchor = el.type === "text" ? surface.toFlat(el.placement.u, el.placement.v) : null;
  if (
    points.some((p) => !surface.contains(p, "bleed")) ||
    !overlapsTrim(surface, outline) ||
    (anchor !== null && !surface.contains(anchor, "trim"))
  ) {
    issues.push({
      ruleId: "OUTSIDE_PRINT_AREA",
      level: "fail",
      message: "Phần tử nằm ngoài vùng in và sẽ bị cắt mất.",
      ...at,
    });
  }
  if (el.type !== "text" && coversTrim(surface, outline)) return issues;

  if (issues.length === 0 && points.some((p) => !surface.contains(p, "safe"))) {
    issues.push({
      ruleId: "CROSSES_SAFE_AREA",
      level: "fail",
      message: "Phần tử vượt vùng an toàn, có thể bị xén khi cắt.",
      ...at,
    });
  }
  if (points.some((p) => surface.inSeam(p))) {
    issues.push({
      ruleId: "ON_SEAM",
      level: "fail",
      message: "Phần tử nằm trên mép dán của ly và sẽ bị che.",
      ...at,
    });
  }
  return issues;
}
