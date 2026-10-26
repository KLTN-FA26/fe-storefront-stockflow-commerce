"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";

import { Alert } from "@/components/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { describeDesignError } from "../../errors";
import { ExportError } from "./export-renderer";
import { usePreflightReport } from "./preflight-context";
import { IssueMessages } from "./preflight-panel";
import { ReviewSteps } from "./review-steps";
import { STUDIO_ANNOUNCEMENTS } from "./studio-announcer";
import { useStudio } from "./studio-context";
import { DocumentChangedError, useReviewSubmission } from "./use-review-submission";

const describeSubmissionError = (error: unknown) =>
  error instanceof ExportError ? error.message : describeDesignError(error);

/** The dialog's body: mounted while the dialog is open, so each opening starts a fresh run. */
function SubmitBody({
  onRunning,
  onClose,
}: {
  onRunning: (running: boolean) => void;
  onClose: () => void;
}) {
  const { design, announce } = useStudio();
  const report = usePreflightReport();
  const submission = useReviewSubmission(design);
  const { step, error } = submission;
  const fails = report.issues.filter((issue) => issue.level === "fail");
  const blocked = step === "idle" && fails.length > 0;
  const running = step !== "idle" && step !== "error" && step !== "done";

  const finish = useEffectEvent(() => {
    announce(STUDIO_ANNOUNCEMENTS.reviewRequested);
    onClose();
  });
  // Done: QC has it. A document changed elsewhere: the conflict dialog takes over (R69).
  const changedElsewhere = step === "error" && error instanceof DocumentChangedError;
  useEffect(() => {
    if (step === "done") finish();
  }, [step]);
  const leave = useEffectEvent(onClose);
  useEffect(() => {
    if (changedElsewhere) leave();
  }, [changedElsewhere]);
  useEffect(() => onRunning(running), [onRunning, running]);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Gửi QC kiểm tra</DialogTitle>
        <DialogDescription>
          Thiết kế được lưu, xuất thành ảnh xem trước, file in PDF và bảng thông số kỹ thuật, rồi
          gửi cho QC. Nếu chỉnh sửa sau khi gửi, yêu cầu kiểm tra sẽ bị huỷ.
        </DialogDescription>
      </DialogHeader>

      {blocked ? (
        <Alert tone="danger" title="Sửa các lỗi trước khi gửi kiểm tra.">
          <IssueMessages issues={fails} />
        </Alert>
      ) : step === "idle" ? null : (
        <ReviewSteps submission={submission} />
      )}

      {step === "error" ? (
        <div role="alert">
          <Alert tone="danger" title="Chưa gửi được.">
            {describeSubmissionError(error)}
          </Alert>
        </div>
      ) : null}

      <DialogFooter className="border-border-default bg-bg-subtle">
        <Button
          type="button"
          variant="outline"
          className="min-h-11 rounded-[var(--r-md)] px-4"
          disabled={running}
          onClick={onClose}
        >
          {blocked ? "Đóng" : "Huỷ"}
        </Button>
        {step === "idle" && !blocked ? (
          <Button
            type="button"
            className="min-h-11 rounded-[var(--r-md)] px-4"
            onClick={() => void submission.run()}
          >
            Gửi
          </Button>
        ) : null}
        {step === "error" ? (
          <Button
            type="button"
            className="min-h-11 rounded-[var(--r-md)] px-4"
            onClick={() => void submission.retry()}
          >
            Thử lại
          </Button>
        ) : null}
        {running ? (
          <Button type="button" className="min-h-11 rounded-[var(--r-md)] px-4" disabled>
            <Loader2 aria-hidden className="mr-1.5 size-4 animate-spin" />
            Đang gửi…
          </Button>
        ) : null}
      </DialogFooter>
    </>
  );
}

/**
 * "Gửi QC kiểm tra": refused with the list of failures while the preflight has a Fail (BR-01);
 * otherwise each step with its progress, "Thử lại" when one fails. It cannot be closed while a
 * step runs, and closes itself once QC has the request.
 */
export function ReviewSubmitDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [running, setRunning] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next || !running) onOpenChange(next);
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="bg-bg-surface text-ink-primary rounded-[var(--r-xl)] sm:max-w-md"
      >
        <SubmitBody onRunning={setRunning} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
