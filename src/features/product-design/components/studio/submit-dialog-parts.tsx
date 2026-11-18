"use client";

import { Loader2 } from "lucide-react";

import { Alert } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";

import { hasErrorCode } from "@/lib/api/describe-error";

import { describeDesignError, isDesignGone, isDesignStateChanged } from "../../errors";
import { describeQuoteRequestError, isCustomerInactive } from "../../quote-request-errors";
import type { ReportedPreflightIssue } from "../../types";
import { ExportError } from "./export-renderer";
import { FailedIssues } from "./preflight-panel";
import { DocumentEditedError } from "./submission-checks";
import type { SubmitStep } from "./use-design-submission";

/**
 * A submit refused because the design is no longer a DRAFT (409 DESIGN_NOT_DRAFT). One refused because
 * it is gone (404: deleted in another tab) says so in the API's words ("Không tìm thấy thiết kế…").
 */
const NOT_A_DRAFT =
  "Thiết kế không còn là bản nháp (đã được gửi duyệt hoặc đã có kết quả) nên không gửi được nữa.";

/** Refusals of the quote request sent with the design (A-2): the BE's own Vietnamese words. */
const isQuoteRefusal = (error: unknown) =>
  isCustomerInactive(error) || hasErrorCode(error, "VALIDATION_FAILED");

const describeSubmissionError = (error: unknown) =>
  error instanceof ExportError
    ? error.message
    : isDesignStateChanged(error)
      ? NOT_A_DRAFT
      : isQuoteRefusal(error)
        ? describeQuoteRequestError(error)
        : describeDesignError(error);

/**
 * The design left DRAFT or was deleted, or the customer cannot ask (409 `CUSTOMER_NOT_ACTIVE`):
 * sending it again cannot succeed, only closing is left.
 */
const isPastSending = (error: unknown) =>
  isDesignStateChanged(error) || isDesignGone(error) || isCustomerInactive(error);

/** Fail: what is in the way; an issue on a surface selects its element (and closes the dialog). */
export function FailBody({
  issues,
  onLocate,
}: {
  issues: readonly ReportedPreflightIssue[];
  onLocate: (issue: ReportedPreflightIssue) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <Alert tone="danger" title="Thiết kế chưa đạt kiểm tra tự động.">
        Sửa các lỗi dưới đây rồi gửi lại. Bấm vào một lỗi để chọn phần tử cần sửa.
      </Alert>
      <div className="flex max-h-64 flex-col gap-3 overflow-y-auto">
        <FailedIssues issues={issues} onLocate={onLocate} />
      </div>
    </div>
  );
}

/** Why the run stopped short of sending (no failing checks to list). */
export function StalledAlert({ error }: { error: unknown }) {
  return (
    <div role="alert">
      <Alert tone="danger" title="Chưa gửi được.">
        {describeSubmissionError(error)}
      </Alert>
    </div>
  );
}

const FOOTER_BUTTON = "min-h-11 rounded-[var(--r-md)] px-4";

/**
 * The dialog's buttons: "Huỷ" / "Đóng" (not while a step runs); "Gửi duyệt" to confirm; after a
 * stop, "Thử lại" — "Gửi lại" when the design was edited meanwhile, nothing when it is no longer
 * a draft or is gone (deleted); and while it works, what it is doing ("Đang kiểm tra…", then
 * "Đang gửi…").
 */
export function SubmitFooter({
  step,
  error,
  confirming,
  stalled,
  canConfirm,
  confirmLabel = "Gửi duyệt",
  onClose,
  onConfirm,
  onRetry,
}: {
  step: SubmitStep;
  error: unknown;
  confirming: boolean;
  stalled: boolean;
  canConfirm: boolean;
  /** "Gửi duyệt", or "Gửi duyệt và yêu cầu báo giá" when a quote request goes with it. */
  confirmLabel?: string;
  onClose: () => void;
  onConfirm: () => void;
  onRetry: () => void;
}) {
  const running = step !== "idle" && step !== "error" && step !== "done";
  const final = stalled && isPastSending(error);
  return (
    <DialogFooter className="border-border-default bg-bg-subtle">
      <Button
        type="button"
        variant={final ? "default" : "outline"}
        className={FOOTER_BUTTON}
        disabled={running}
        onClick={onClose}
      >
        {confirming ? "Huỷ" : "Đóng"}
      </Button>
      {confirming ? (
        <Button type="button" className={FOOTER_BUTTON} disabled={!canConfirm} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      ) : null}
      {stalled && !final ? (
        <Button type="button" className={FOOTER_BUTTON} onClick={onRetry}>
          {error instanceof DocumentEditedError ? "Gửi lại" : "Thử lại"}
        </Button>
      ) : null}
      {running ? (
        <Button type="button" className={FOOTER_BUTTON} disabled>
          <Loader2 aria-hidden className="mr-1.5 size-4 animate-spin" />
          {step === "checking" ? "Đang kiểm tra…" : "Đang gửi…"}
        </Button>
      ) : null}
    </DialogFooter>
  );
}
