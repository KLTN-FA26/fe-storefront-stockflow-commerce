import type { SurfaceContent } from "../document/schema";
import type { PrintAreaCode } from "../template/schema";
import { areaIssues } from "./rules/area";
import { colorModeIssues, elementColorIssues, surfaceColorIssues } from "./rules/color";
import { elementContentIssues, emptyDesignIssues } from "./rules/content";
import { resolutionIssues } from "./rules/resolution";
import { variantIssues } from "./rules/variant";
import type {
  PreflightInput,
  PreflightIssue,
  PreflightLevel,
  PreflightReport,
  SurfaceScope,
} from "./types";

const NO_CONTENT: SurfaceContent = { background: { kind: "none" }, elements: [] };

/** Fails first, so the panel lists the blocking problems at the top. */
const SEVERITY: Record<PreflightLevel, number> = { fail: 0, note: 1 };

function surfaceIssues(input: PreflightInput, code: PrintAreaCode): PreflightIssue[] {
  const surface = input.surfaces.byCode[code];
  if (surface === undefined) return [];

  const content = input.document.surfaces[code] ?? NO_CONTENT;
  const scope: SurfaceScope = {
    input,
    code,
    surface,
    content,
    elements: content.elements.filter((el) => !el.hidden),
  };
  return [
    ...scope.elements.flatMap((el) => [
      ...areaIssues(scope, el),
      ...resolutionIssues(scope, el),
      ...elementContentIssues(scope, el),
      ...elementColorIssues(scope, el),
    ]),
    ...surfaceColorIssues(scope),
  ];
}

/**
 * Client-side print checks (spec §7): a `Fail` blocks submitting (docs 12 §4.3, BR-05), and the
 * server re-checks what it can see on submit (`422 PREFLIGHT_FAILED`); the Sales Manager reviews
 * after that. The result is `Fail` when any issue fails, else `Pass`: a note never changes a
 * `Pass`.
 */
export function runPreflight(input: PreflightInput): PreflightReport {
  const issues = [
    ...emptyDesignIssues(input),
    ...variantIssues(input.variant),
    ...input.surfaces.order.flatMap((code) => surfaceIssues(input, code)),
    ...colorModeIssues(input.template),
  ].toSorted((a, b) => SEVERITY[a.level] - SEVERITY[b.level]);

  // Not read off the sort: a Fail blocks submitting, so it must not depend on list order.
  return { result: issues.some((issue) => issue.level === "fail") ? "Fail" : "Pass", issues };
}
