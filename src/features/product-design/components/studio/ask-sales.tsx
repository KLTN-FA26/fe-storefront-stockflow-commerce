"use client";

import type { ReportedPreflightIssue } from "../../types";
import { ChatAboutButton } from "../chat-about-button";
import { useStudio } from "./studio-context";

/**
 * The failures only Sale can clear: the variant takes no designs any more, or has no carton spec
 * yet (docs 12 §4.8: "khách liên hệ Sale"). Nothing the customer edits in the design fixes them.
 */
const SALE_RULES: ReadonlySet<string> = new Set(["VARIANT_UNAVAILABLE", "NO_CARTON_SPEC"]);

export const needsSale = (issues: readonly Pick<ReportedPreflightIssue, "ruleId" | "level">[]) =>
  issues.some((issue) => issue.level === "fail" && SALE_RULES.has(issue.ruleId));

/**
 * "Sale sẽ bổ sung quy cách cho bạn." and "Chat với Sale" about this design (`DESIGN` context), whatever its status.
 * PO 2026-11-22 (Q7): as the BE — staff see a design's name, status and return reason, never the content of a draft
 * (`CustomerDesignRules.requireReader`), and a customer may open a `DESIGN` conversation on any design of theirs
 * (`ContextResolver`). The button hides itself without `chat-conversations:CREATE`.
 */
export function AskSales() {
  const { design } = useStudio();
  return (
    <div className="flex flex-col items-start gap-2 px-2">
      <p className="text-ink-secondary text-sm">Sale sẽ bổ sung quy cách cho bạn.</p>
      <ChatAboutButton kind="DESIGN" id={design.id} name={design.name} />
    </div>
  );
}
