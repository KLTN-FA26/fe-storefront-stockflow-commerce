"use client";

import { useEffect, useId, useState } from "react";

import { Alert } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

import { describeDesignError } from "../../errors";
import { useOptionalPreflightReport } from "./preflight-context";
import { IssueMessages } from "./preflight-panel";
import { STUDIO_ANNOUNCEMENTS } from "./studio-announcer";
import { useFinalize, type FinalizeMode } from "./use-finalize";
import { useWorkflow } from "./workflow-context";

export type { FinalizeMode } from "./use-finalize";

const COPY: Record<
  FinalizeMode,
  {
    title: string;
    description: string;
    blocked: string;
    submit: string;
    pending: string;
    done: string;
  }
> = {
  finalize: {
    title: "Chốt thiết kế?",
    description:
      "Thiết kế đạt kỹ thuật sẽ được chốt thành bản chốt để Sales báo giá. Bản chốt không sửa được nữa; muốn thay đổi, bạn tạo phiên bản mới từ nó.",
    blocked: "Sửa các lỗi trước khi chốt thiết kế.",
    submit: "Xác nhận chốt",
    pending: "Đang chốt…",
    done: STUDIO_ANNOUNCEMENTS.finalized,
  },
  confirm: {
    title: "Xác nhận thiết kế?",
    description:
      "Bạn xác nhận thiết kế Sales đã gửi; thiết kế được chốt thành bản chốt và không sửa được nữa. Muốn thay đổi, bạn tạo phiên bản mới từ nó.",
    blocked: "Thiết kế còn lỗi in. Hãy yêu cầu sửa thay vì xác nhận.",
    submit: "Xác nhận",
    pending: "Đang xác nhận…",
    done: STUDIO_ANNOUNCEMENTS.confirmed,
  },
};

const RISK_CONSENT = "Tôi đã xem các cảnh báo và chấp nhận rủi ro khi in";

function FinalizeBody({
  mode,
  onPending,
  onClose,
}: {
  mode: FinalizeMode;
  onPending: (pending: boolean) => void;
  onClose: () => void;
}) {
  const { announce } = useWorkflow();
  // No report where the document is not loaded (the workflow-only view): nothing to weigh.
  const issues = useOptionalPreflightReport()?.issues ?? [];
  const { submit, pending, refusal, error } = useFinalize(mode);
  const [accepted, setAccepted] = useState(false);
  const consentId = useId();
  const copy = COPY[mode];
  const fails = issues.filter((issue) => issue.level === "fail");
  const warnings = issues.filter((issue) => issue.level === "warning");

  useEffect(() => onPending(pending), [onPending, pending]);

  return (
    <>
      <DialogHeader>
        <DialogTitle>{copy.title}</DialogTitle>
        <DialogDescription>{copy.description}</DialogDescription>
      </DialogHeader>
      {fails.length > 0 ? (
        <Alert tone="danger" title={copy.blocked}>
          <IssueMessages issues={fails} />
        </Alert>
      ) : warnings.length > 0 ? (
        <div className="flex flex-col gap-2">
          <Alert tone="warning" title="Thiết kế còn cảnh báo khi in:">
            <IssueMessages issues={warnings} />
          </Alert>
          <Label
            htmlFor={consentId}
            className="text-ink-primary flex min-h-11 cursor-pointer items-center gap-3 text-sm font-normal"
          >
            <Checkbox
              id={consentId}
              checked={accepted}
              onCheckedChange={(checked) => setAccepted(checked === true)}
            />
            {RISK_CONSENT}
          </Label>
        </div>
      ) : null}
      {refusal || error ? (
        <div role="alert">
          <Alert tone="danger" title="Chưa thực hiện được.">
            {refusal ?? describeDesignError(error)}
          </Alert>
        </div>
      ) : null}
      <DialogFooter className="border-border-default bg-bg-subtle">
        <Button
          type="button"
          variant="outline"
          className="min-h-11 rounded-[var(--r-md)] px-4"
          disabled={pending}
          onClick={onClose}
        >
          Quay lại
        </Button>
        <Button
          type="button"
          className="min-h-11 rounded-[var(--r-md)] px-4"
          disabled={fails.length > 0 || (warnings.length > 0 && !accepted) || pending}
          onClick={() =>
            void submit(() => {
              announce(copy.done);
              onClose();
            })
          }
        >
          {pending ? copy.pending : copy.submit}
        </Button>
      </DialogFooter>
    </>
  );
}

/**
 * Chốt / xác nhận thiết kế. A Fail blocks it; with Warnings the customer must tick that they
 * accept the print risk first (mode B rules). `useFinalize` saves a pending edit first, then
 * submits and confirms in one go (finalize) or answers Sales' request (confirm). It cannot be
 * closed while that runs.
 */
export function FinalizeDialog({
  mode,
  open,
  onOpenChange,
}: {
  mode: FinalizeMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [pending, setPending] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next || !pending) onOpenChange(next);
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="bg-bg-surface text-ink-primary rounded-[var(--r-xl)] sm:max-w-md"
      >
        <FinalizeBody mode={mode} onPending={setPending} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
