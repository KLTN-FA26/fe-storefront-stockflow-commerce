import type { SurfaceContent } from "../document/schema";
import type { PrintAreaCode } from "../template/schema";
import { areaIssues } from "./rules/area";
import { colorModeIssues, elementColorIssues, surfaceColorIssues } from "./rules/color";
import { elementContentIssues, emptyDesignIssues } from "./rules/content";
import { resolutionIssues } from "./rules/resolution";
import type {
  PreflightInput,
  PreflightIssue,
  PreflightLevel,
  PreflightReport,
  SurfaceScope,
} from "./types";

const NO_CONTENT: SurfaceContent = { background: { kind: "none" }, elements: [] };

/** Most severe first, so the panel lists the worst problems at the top. */
const SEVERITY: Record<PreflightLevel, number> = { fail: 0, warning: 1, info: 2 };

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
 * Client-side print checks (spec §8): advisory, the backend QC review stays the gate. The result
 * is the highest level present (info never changes a `Pass`).
 */
export function runPreflight(input: PreflightInput): PreflightReport {
  const issues = [
    ...emptyDesignIssues(input),
    ...input.surfaces.order.flatMap((code) => surfaceIssues(input, code)),
    ...colorModeIssues(input.template),
  ].toSorted((a, b) => SEVERITY[a.level] - SEVERITY[b.level]);

  // Not read off the sort: a Fail blocks confirming (BR-01), so it must not depend on list order.
  const has = (level: PreflightLevel) => issues.some((issue) => issue.level === level);
  return { result: has("fail") ? "Fail" : has("warning") ? "Warning" : "Pass", issues };
}
