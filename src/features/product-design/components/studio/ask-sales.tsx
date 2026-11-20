"use client";

import Link from "next/link";
import { MessageCircle } from "lucide-react";

import { STORE_ROUTES } from "@/constants";
import { Button } from "@/components/ui/button";
import { PERM } from "@/lib/auth/permission-codes";
import { useHasPermission } from "@/lib/auth/my-permissions";

import type { ReportedPreflightIssue } from "../../types";
import { ChatAboutButton } from "../chat-about-button";
import { ACTION_BUTTON } from "../quote-request-parts";
import { useStudio } from "./studio-context";

/**
 * The failures only Sale can clear: the variant takes no designs any more, or has no carton spec
 * yet (docs 12 §4.8: "khách liên hệ Sale"). Nothing the customer edits in the design fixes them.
 */
const SALE_RULES: ReadonlySet<string> = new Set(["VARIANT_UNAVAILABLE", "NO_CARTON_SPEC"]);

export const needsSale = (issues: readonly Pick<ReportedPreflightIssue, "ruleId" | "level">[]) =>
  issues.some((issue) => issue.level === "fail" && SALE_RULES.has(issue.ruleId));

/**
 * "Sale sẽ bổ sung quy cách cho bạn." and "Chat với Sale". The conversation is about the design's
 * product (`PRODUCT`) where the studio knows it: a `DESIGN` context on a draft never sent would
 * show Sale the draft before the customer submitted it (open question Q7). Without a product id
 * it is the plain chat, no context.
 */
export function AskSales() {
  const { design } = useStudio();
  const allowed = useHasPermission(PERM.chatCreate);
  const productId = design.product.id;
  return (
    <div className="flex flex-col items-start gap-2 px-2">
      <p className="text-ink-secondary text-sm">Sale sẽ bổ sung quy cách cho bạn.</p>
      {productId ? (
        <ChatAboutButton kind="PRODUCT" id={productId} name={design.product.title} />
      ) : allowed ? (
        <Button asChild variant="outline" className={ACTION_BUTTON}>
          <Link href={STORE_ROUTES.chat.new} aria-label="Chat với Sale">
            <MessageCircle aria-hidden className="size-4" />
            Chat với Sale
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
