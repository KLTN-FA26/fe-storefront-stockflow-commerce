import type { DesignElement } from "../../document/schema";
import { containmentPoints, elementOutline } from "../../geometry/element";
import { alongEdges, pointInPolygon } from "../../geometry/polygon";
import type { PointMm } from "../../geometry/types";
import type { PrintSurface } from "../../surfaces/types";
import type { PreflightIssue, SurfaceScope } from "../types";

// BR-02 (docs 12 §6): content must not leave the print area. CROSSES_SAFE_AREA and ON_SEAM are the
// layout warnings of docs 12 §3 step 4 (spec §8).

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
 * Whether the element covers any of the trim. A full-bleed background has every corner in the
 * bleed strip yet covers the whole trim, so corners alone are not enough: the element also
 * overlaps the trim when an edge runs through it, or when it encloses the trim (the trim's
 * centre is inside the outline).
 */
function overlapsTrim(surface: PrintSurface, outline: PointMm[]): boolean {
  const [u0, u1] = surface.uRange;
  const [v0, v1] = surface.vRange;
  const centre = surface.toFlat((u0 + u1) / 2, (v0 + v1) / 2);
  return (
    alongEdges(outline).some((p) => surface.contains(p, "trim")) || pointInPolygon(centre, outline)
  );
}

/**
 * Where an element sits on its surface. `OUTSIDE_PRINT_AREA` when it passes the bleed or lies
 * completely outside the trim. Otherwise `CROSSES_SAFE_AREA` when any of it is outside the safe
 * line: in the band between safe line and trim, or past the trim into the bleed, where it is cut
 * off. `ON_SEAM` when any of it is on the cup's glue flap (which may also cross the safe line).
 * "Any of it" is read off `containmentPoints`: on the cup the middle of an edge counts too.
 */
export function areaIssues(scope: SurfaceScope, el: DesignElement): PreflightIssue[] {
  const { input, surface, code } = scope;
  const outline = pulledIn(elementOutline(el, surface, input.sizer(el)));
  const points = containmentPoints(el, surface, outline);
  const at = { surfaceCode: code, elementId: el.id };
  const issues: PreflightIssue[] = [];

  const pastBleed = points.some((p) => !surface.contains(p, "bleed"));
  if (pastBleed || !overlapsTrim(surface, outline)) {
    issues.push({
      ruleId: "OUTSIDE_PRINT_AREA",
      level: "fail",
      message: "Phần tử nằm ngoài vùng in và sẽ bị cắt mất.",
      ...at,
    });
  } else if (points.some((p) => !surface.contains(p, "safe"))) {
    issues.push({
      ruleId: "CROSSES_SAFE_AREA",
      level: "warning",
      message: "Phần tử vượt vùng an toàn, có thể bị xén khi cắt.",
      ...at,
    });
  }

  if (points.some((p) => surface.inSeam(p))) {
    issues.push({
      ruleId: "ON_SEAM",
      level: "warning",
      message: "Phần tử nằm trên mép dán của ly và sẽ bị che.",
      ...at,
    });
  }

  return issues;
}
