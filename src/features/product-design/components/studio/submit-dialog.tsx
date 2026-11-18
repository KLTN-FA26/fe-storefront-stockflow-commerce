"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { useLocateIssue } from "./preflight-panel";
import { STUDIO_ANNOUNCEMENTS } from "./studio-announcer";
import { useStudio } from "./studio-context";
import { ConfirmBody, useConfirmPreview } from "./submit-confirm";
import { FailBody, StalledAlert, SubmitFooter } from "./submit-dialog-parts";
import { isWorkStep, SubmitSteps, type WorkStep } from "./submit-steps";
import { DocumentChangedError } from "./submission-checks";
import { useDesignSubmission } from "./use-design-submission";

/**
 * The dialog's body, mounted while it is open so each opening is a new attempt: first it saves
 * and runs the preflight (`check`); a Fail lists the issues (the attempt is recorded), a Pass asks
 * to confirm, then the files are drawn and sent step by step (`run`). It closes itself once the
 * design is sent, or when the document turned out changed elsewhere (the conflict dialog then).
 */
function SubmitBody({
  onRunning,
  onClose,
}: {
  onRunning: (running: boolean) => void;
  onClose: () => void;
}) {
  const { design, announce, exportRenderer } = useStudio();
  const submission = useDesignSubmission(design);
  const { step, fraction, error, issues } = submission;
  const locate = useLocateIssue();
  /** The preflight passed: the customer confirms, then the files are made. */
  const [passed, setPassed] = useState(false);
  const preview = useConfirmPreview(exportRenderer, passed);
  // The last work step reached: the one that failed when the step is `error`.
  const reached = isWorkStep(step)
    ? step
    : step === "idle" || step === "checking"
      ? null
      : undefined;
  const [failedAt, setFailedAt] = useState<WorkStep | null>(null);
  if (reached !== undefined && reached !== failedAt) setFailedAt(reached);

  const check = () => {
    void submission.check().then((ok) => ok && setPassed(true));
  };
  const checkOnOpen = useEffectEvent(check);
  useEffect(() => checkOnOpen(), []);

  const running = step !== "idle" && step !== "error" && step !== "done";
  useEffect(() => onRunning(running), [onRunning, running]);
  const finish = useEffectEvent(() => {
    announce(STUDIO_ANNOUNCEMENTS.submitted);
    onClose();
  });
  useEffect(() => {
    if (step === "done") finish();
  }, [step]);
  const changedElsewhere = step === "error" && error instanceof DocumentChangedError;
  const leave = useEffectEvent(onClose);
  useEffect(() => {
    if (changedElsewhere) leave();
  }, [changedElsewhere]);

  const failed = issues !== null;
  const confirming = passed && step === "idle";
  const stalled = step === "error" && !failed;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Gửi duyệt</DialogTitle>
        <DialogDescription>
          Thiết kế được lưu, tạo ảnh xem trước, file in và file mô tả thiết kế, rồi gửi Quản lý kinh
          doanh duyệt.
        </DialogDescription>
      </DialogHeader>

      {failed ? (
        <FailBody
          issues={issues}
          onLocate={(issue) => {
            locate(issue);
            onClose();
          }}
        />
      ) : confirming ? (
        <ConfirmBody src={preview} />
      ) : passed ? (
        <SubmitSteps step={step} fraction={fraction} failedAt={failedAt} />
      ) : step === "error" ? null : (
        <p className="text-ink-secondary flex items-center gap-2 text-sm" role="status">
          <Loader2 aria-hidden className="size-4 animate-spin" />
          Đang kiểm tra thiết kế…
        </p>
      )}

      {stalled ? <StalledAlert error={error} /> : null}

      <SubmitFooter
        step={step}
        error={error}
        confirming={confirming}
        stalled={stalled}
        canConfirm={preview !== undefined}
        onClose={onClose}
        onConfirm={() => void submission.run()}
        onRetry={() => (passed ? void submission.retry() : check())}
      />
    </>
  );
}

/**
 * "Gửi duyệt" (spec §6.4, docs 12 §4.3): a Fail lists the issues; a Pass shows the preview, that
 * the design is locked until the review answers and the print-colour notice, then each step with
 * its progress and "Thử lại" when one fails. Modal: nothing behind it can be edited while it is
 * open, and it cannot be closed while a step runs.
 */
export function SubmitDialog({
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
