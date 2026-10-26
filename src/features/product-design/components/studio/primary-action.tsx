"use client";

import { BadgeCheck, Hourglass, MessagesSquare, Send } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";

import { STORE_ROUTES } from "@/constants";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import { allowedActions } from "../../lifecycle";
import { FinalizeDialog, type FinalizeMode } from "./finalize-dialog";
import { ReviewSubmitDialog } from "./review-submit-dialog";
import { useStudio } from "./studio-context";
import { useWorkflow } from "./workflow-context";

const BUTTON = "min-h-11 min-w-11 shrink-0 rounded-[var(--r-md)] px-3 sm:px-4";

/** The action's words: read out everywhere, shown from `sm` (a phone's header has room for the icon). */
const ActionLabel = ({ children }: { children: string }) => (
  <span className="sr-only sm:not-sr-only sm:ml-1.5">{children}</span>
);

/** Why "Gửi QC kiểm tra" cannot be used yet: the BE has no review request (P5). */
const REVIEW_UNAVAILABLE =
  "Gửi QC kiểm tra chưa mở trực tuyến. Hãy nhắn Sales để được kiểm tra thiết kế.";

/**
 * "Gửi QC kiểm tra" while the BE cannot take the request: still in its place and focusable (so its
 * reason is read), marked unavailable, and it says why on hover and focus.
 */
function ReviewUnavailable() {
  const reasonId = useId();
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            aria-disabled
            aria-describedby={reasonId}
            className={`${BUTTON} aria-disabled:cursor-not-allowed aria-disabled:opacity-50`}
          >
            <Send aria-hidden className="size-4" />
            <ActionLabel>Gửi QC kiểm tra</ActionLabel>
          </Button>
        </TooltipTrigger>
        <TooltipContent>{REVIEW_UNAVAILABLE}</TooltipContent>
      </Tooltip>
      <span id={reasonId} className="sr-only">
        {REVIEW_UNAVAILABLE}
      </span>
    </>
  );
}

/**
 * The header's primary lifecycle action (`allowedActions(uiState)`): "Gửi QC kiểm tra", a disabled
 * "Đang chờ QC" while QC looks, "Chốt thiết kế" once QC passed it, "Xác nhận thiết kế" for what
 * Sales sent, "Yêu cầu báo giá" once confirmed. The dialogs stay mounted across a state change, so
 * the one in use is not torn down when its own step moves the design on. "Gửi QC kiểm tra" waits
 * for the BE's review request (`capabilities.reviewRequest`) and says so until it is there.
 */
export function PrimaryAction() {
  const { uiState } = useWorkflow();
  const { capabilities } = useStudio();
  const actions = allowedActions(uiState);
  const [open, setOpen] = useState<"review" | "finalize" | null>(null);
  // Kept apart from `open`, so the closing dialog keeps its title while it fades out.
  const [mode, setMode] = useState<FinalizeMode>("finalize");
  const closeOn = (next: boolean) => {
    if (!next) setOpen(null);
  };

  let control = null;
  if (actions.includes("requestReview") && !capabilities.reviewRequest) {
    control = <ReviewUnavailable />;
  } else if (actions.includes("requestReview")) {
    control = (
      <Button type="button" className={BUTTON} onClick={() => setOpen("review")}>
        <Send aria-hidden className="size-4" />
        <ActionLabel>Gửi QC kiểm tra</ActionLabel>
      </Button>
    );
  } else if (uiState === "awaitingReview") {
    control = (
      <Button type="button" variant="outline" className={BUTTON} disabled>
        <Hourglass aria-hidden className="size-4" />
        <ActionLabel>Đang chờ QC</ActionLabel>
      </Button>
    );
  } else if (actions.includes("finalize") || actions.includes("confirm")) {
    const next: FinalizeMode = actions.includes("finalize") ? "finalize" : "confirm";
    control = (
      <Button
        type="button"
        className={BUTTON}
        onClick={() => {
          setMode(next);
          setOpen("finalize");
        }}
      >
        <BadgeCheck aria-hidden className="size-4" />
        <ActionLabel>{next === "finalize" ? "Chốt thiết kế" : "Xác nhận thiết kế"}</ActionLabel>
      </Button>
    );
  } else if (actions.includes("requestQuote")) {
    control = (
      <Button asChild className={BUTTON}>
        <Link href={STORE_ROUTES.chat.list}>
          <MessagesSquare aria-hidden className="size-4" />
          <ActionLabel>Yêu cầu báo giá</ActionLabel>
        </Link>
      </Button>
    );
  }

  return (
    <>
      {control}
      <ReviewSubmitDialog open={open === "review"} onOpenChange={closeOn} />
      <FinalizeDialog mode={mode} open={open === "finalize"} onOpenChange={closeOn} />
    </>
  );
}
