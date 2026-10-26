"use client";

import { ArrowLeft, BadgeCheck, MessageSquareText } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { STORE_ROUTES } from "@/constants";
import { Alert } from "@/components/shared";
import { Button } from "@/components/ui/button";

import { allowedActions, deriveUiState, WORKFLOW_ONLY_HINTS } from "../../lifecycle";
import type { DesignDraft } from "../../types";
import { DesignStatusBadge } from "../design-status-badge";
import { DecisionHistory } from "./decision-history";
import { FinalizeDialog } from "./finalize-dialog";
import { StudioAnnouncer, useStudioAnnouncer } from "./studio-announcer";
import { WorkflowActions } from "./workflow-card";
import { NOTHING_TO_SAVE, WorkflowProvider, type WorkflowServices } from "./workflow-context";
import { WorkflowPreview } from "./workflow-preview";

/** "Xác nhận thiết kế" for what Sales sent (no preflight here: the document is not loaded). */
function ConfirmAction() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        className="min-h-11 rounded-[var(--r-md)] px-4"
        onClick={() => setOpen(true)}
      >
        <BadgeCheck aria-hidden className="mr-1.5 size-4" />
        Xác nhận thiết kế
      </Button>
      <FinalizeDialog mode="confirm" open={open} onOpenChange={setOpen} />
    </>
  );
}

/**
 * The design without the editor (R72): when the BE does not store design documents yet (P3/P4
 * off), or the draft names no product template (a design Sales created). The customer still sees
 * where it stands, QC's notes, the preview, its history, and takes the lifecycle steps of its
 * state: confirm, request changes or withdraw what Sales sent; the snapshot, "Yêu cầu báo giá" and
 * "Tạo phiên bản mới" once confirmed.
 */
export function WorkflowView({ design }: { design: DesignDraft }) {
  const uiState = deriveUiState(design);
  const hint = WORKFLOW_ONLY_HINTS[uiState];
  const notes = design.reviewNotes?.trim();
  const { announcement, announce } = useStudioAnnouncer();
  const workflow = useMemo<WorkflowServices>(
    () => ({ design, uiState, announce, autosave: NOTHING_TO_SAVE }),
    [design, uiState, announce],
  );

  return (
    <WorkflowProvider value={workflow}>
      <div className="flex min-h-dvh flex-col">
        <header className="bg-bg-surface border-border-default flex min-h-14 shrink-0 items-center gap-2 border-b px-2 sm:px-3">
          <Button
            asChild
            variant="ghost"
            className="min-h-11 min-w-11 shrink-0 rounded-[var(--r-md)] px-3"
          >
            <Link href={STORE_ROUTES.design.list}>
              <ArrowLeft aria-hidden className="size-4" />
              <span className="sr-only sm:not-sr-only sm:ml-1.5">Thiết kế của tôi</span>
            </Link>
          </Button>
          <h1 className="text-ink-primary min-w-0 flex-1 truncate text-base font-semibold">
            {design.name}
          </h1>
          <DesignStatusBadge state={uiState} className="shrink-0" />
        </header>
        <main className="mx-auto grid w-full max-w-5xl flex-1 gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <WorkflowPreview design={design} />
          <div className="flex flex-col gap-6">
            <section aria-label="Bước tiếp theo" className="flex flex-col gap-3">
              <p className="text-ink-secondary text-sm">{hint}</p>
              {notes ? (
                <div className="bg-bg-subtle border-border-default rounded-[var(--r-md)] border p-3">
                  <p className="text-ink-secondary mb-1 flex items-center gap-1.5 text-xs font-semibold">
                    <MessageSquareText aria-hidden className="size-4" />
                    Ghi chú kiểm tra
                  </p>
                  <p className="text-ink-primary text-sm whitespace-pre-line">{notes}</p>
                </div>
              ) : null}
              {allowedActions(uiState).includes("confirm") ? <ConfirmAction /> : null}
              <WorkflowActions />
            </section>
            <Alert tone="info" title="Chỉnh sửa trực tuyến chưa mở">
              Sales của StockFlow cập nhật thiết kế theo yêu cầu của bạn; muốn thay đổi, hãy{" "}
              <Link
                href={STORE_ROUTES.chat.list}
                className="text-accent focus-visible:ring-accent rounded-sm font-semibold underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:outline-none"
              >
                nhắn Sales
              </Link>
              . Các bước xác nhận của thiết kế vẫn thực hiện được tại đây.
            </Alert>
            <DecisionHistory designId={design.id} />
          </div>
        </main>
        <StudioAnnouncer announcement={announcement} />
      </div>
    </WorkflowProvider>
  );
}
