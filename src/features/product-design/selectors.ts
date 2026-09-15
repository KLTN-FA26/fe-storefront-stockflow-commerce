import type { DesignDto } from "./types";

export function computeDesignStats(design: DesignDto) {
  const failCount = design.preflightIssues.filter((issue) => issue.level === "fail").length;
  const warningCount = design.preflightIssues.filter((issue) => issue.level === "warning").length;
  const outsideCount = design.elements.filter((element) => element.outsidePrintArea).length;

  return {
    elementCount: design.elements.length,
    failCount,
    warningCount,
    outsideCount,
    isReady: design.preflightResult !== "Fail" && outsideCount === 0,
  };
}

export function hasPreflightFail(design: DesignDto): boolean {
  return design.preflightResult === "Fail" || design.preflightIssues.some((issue) => issue.level === "fail");
}
