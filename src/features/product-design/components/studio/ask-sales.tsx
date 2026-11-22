"use client";

import { isWordedBeRule } from "../../preflight-messages";
import { isEngineRule } from "../../schemas";
import type { ReportedPreflightIssue } from "../../types";
import { ChatAboutButton } from "../chat-about-button";
import { useStudio } from "./studio-context";

type Issue = Pick<ReportedPreflightIssue, "ruleId" | "level">;

/**
 * The failures the customer cannot clear by editing the design (SF-UX-12, docs 12 §4.8: "khách liên
 * hệ Sale"), each with what Sale does about it: the variant has no carton spec yet, takes no designs
 * any more, or a check this build has no words for (its code is not shown to the customer).
 */
const SALE_LINE: Readonly<Record<string, string>> = {
  NO_CARTON_SPEC: "Sale sẽ bổ sung quy cách thùng cho bạn.",
  VARIANT_UNAVAILABLE: "Sale sẽ giúp bạn chọn quy cách khác.",
};
const UNKNOWN_LINE = "Sale sẽ xem lỗi này và hướng dẫn bạn.";

const isUnknown = (ruleId: string) => !isEngineRule(ruleId) && !isWordedBeRule(ruleId);

/** The lines to show, once each, in the order the failures come. */
function saleLines(issues: readonly Issue[]): string[] {
  const lines = issues
    .filter((issue) => issue.level === "fail")
    .map((issue) => SALE_LINE[issue.ruleId] ?? (isUnknown(issue.ruleId) ? UNKNOWN_LINE : null))
    .filter((line): line is string => line !== null);
  return [...new Set(lines)];
}

export const needsSale = (issues: readonly Issue[]) => saleLines(issues).length > 0;

/**
 * What Sale will do, and "Chat với Sale" about this design (`DESIGN` context), whatever its status.
 * PO 2026-11-22 (Q7): as the BE — staff see a design's name, status and return reason, never the content of a draft
 * (`CustomerDesignRules.requireReader`), and a customer may open a `DESIGN` conversation on any design of theirs
 * (`ContextResolver`). The button hides itself without `chat-conversations:CREATE`.
 */
export function AskSales({ issues }: { issues: readonly Issue[] }) {
  const { design } = useStudio();
  return (
    <div className="flex flex-col items-start gap-2 px-2">
      {saleLines(issues).map((line) => (
        <p key={line} className="text-ink-secondary text-sm">
          {line}
        </p>
      ))}
      <ChatAboutButton kind="DESIGN" id={design.id} name={design.name} />
    </div>
  );
}
