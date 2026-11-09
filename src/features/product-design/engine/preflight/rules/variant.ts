import type { PreflightIssue, PreflightVariant } from "../types";

// docs 12 BR-05 and B25 (spec §7): a design is submitted for a variant that is still `ACTIVE` and
// has a carton spec. Document-level issues: they carry neither surface nor element.

/** A variant with nothing in the way: what the studio passes until it reads the print configuration. */
export const VARIANT_OK: PreflightVariant = { usable: true, hasCartonSpec: true };

export function variantIssues(variant: PreflightVariant): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  if (!variant.usable) {
    issues.push({
      ruleId: "VARIANT_UNAVAILABLE",
      level: "fail",
      message: "Quy cách này hiện không còn nhận thiết kế.",
    });
  }
  if (!variant.hasCartonSpec) {
    issues.push({
      ruleId: "NO_CARTON_SPEC",
      level: "fail",
      message: "Quy cách chưa có quy cách thùng, chưa gửi duyệt được.",
    });
  }
  return issues;
}
