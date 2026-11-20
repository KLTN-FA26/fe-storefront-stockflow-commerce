import { hasErrorCode } from "@/lib/api/describe-error";

import type { PreflightIssue, PreflightReport } from "../engine";
import { describeDesignError, isDesignGone, isDesignStateChanged } from "../errors";
import { DESIGN_STATUS_META } from "../lifecycle";
import type { DesignStatus, ReportedPreflightIssue } from "../types";
import { ExportError } from "./studio/export-renderer";
import type { BundleStep } from "./studio/submission-bundle";

// What the run of "Gửi duyệt cả bộ" (`submit-set-run.ts`) shows: where each design stands, the
// phase, what it announces, and how a stop is worded.

/** Where one design of the set stands. */
export type RowState =
  | { kind: "waiting" }
  | { kind: "checking" }
  | { kind: "passed"; notes: PreflightIssue[] }
  | { kind: "failed"; issues: ReportedPreflightIssue[] }
  | { kind: "drawing"; step: BundleStep; fraction: number }
  | { kind: "uploading" }
  | { kind: "uploaded" }
  /** `reopen`: the design is named by the BE or a re-read, and its studio link shows. */
  | { kind: "stopped"; message: string; reopen?: true };

/**
 * `checking` (step 1) → `confirm` (step 2) → `sending` (step 3) → `opening` (step 4) → `done`;
 * `failed`: a design did not pass, nothing was sent; `stalled`: an error stopped the run.
 */
export type SetPhase =
  "checking" | "failed" | "confirm" | "sending" | "opening" | "stalled" | "done";

/** A milestone for the screen reader; a new `id` reads the same words again. */
export type Announcement = { text: string; id: number };

export type SetState = {
  phase: SetPhase;
  /** The step reached (1–4), kept while the run is stopped. */
  step: 1 | 2 | 3 | 4;
  rows: Readonly<Record<string, RowState>>;
  /** What stopped the run (`stalled`). */
  error: unknown;
  /** "Thử lại" can go on (`stalled`); false when trying again cannot help. */
  canRetry: boolean;
  /**
   * The round was asked for, and whether it opened is not known: its answer was lost and the
   * project could not be read either (`stalled` at step 4). "Thử lại" finds out.
   */
  roundUnknown: boolean;
  announcement: Announcement | null;
};

/** What the run says as it goes (WCAG 4.1.3): milestones, not fractions. */
export const ANNOUNCE = {
  checking: (name: string, at: number, of: number) => `Đang kiểm tra ${name} (${at}/${of})`,
  checked: (name: string, passed: boolean) => `${name}: ${passed ? "đạt" : "không đạt"}`,
  drawing: (name: string, at: number, of: number) => `Đang dựng ${name} (${at}/${of})`,
  uploaded: (done: number, of: number) => `Đã tải lên ${done}/${of} bản`,
  opening: "Đang mở lượt duyệt",
} as const;

/** What the rows say of a design the round's refusal is about (BE-4 `designIds`, or a re-read) or of its files. */
export const ROW_TEXT = {
  changed: "Bản này vừa được sửa ở nơi khác.",
  /** A design sent, approved or archived elsewhere: its status now, which no redraw changes. */
  notDraft: (status: DesignStatus) =>
    `Bản này đang ở trạng thái “${DESIGN_STATUS_META[status].label}”, không còn là bản nháp nên không gửi cùng bộ được.`,
  returned: "Bản này vừa bị trả lại kèm góp ý. Hãy mở lại để xem góp ý trước khi gửi duyệt lại.",
  noTemplate: "Bản này không gắn với khuôn in nào nên không gửi duyệt được. Hãy liên hệ cửa hàng.",
  noLayout: "Bản này chưa có bố cục đã lưu nên không gửi duyệt được. Hãy liên hệ cửa hàng.",
  notInProject: "Bản này không còn thuộc dự án.",
  outdated: "File của bản này chưa khớp với thiết kế nên chưa gửi được. Hãy thử lại.",
} as const;

/** Refusals no retry gets past: the set must be chosen again (a closed project, a bad request, a gone design). */
const FINAL_CODES = ["DESIGN_PROJECT_ARCHIVED", "VALIDATION_FAILED"];

/**
 * A stop the run words itself (the round's refusal says more than its code): its `message` is
 * what the customer reads.
 */
export class SetStopError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SetStopError";
  }
}

/** The run's own words for a stop at step 4. */
export const STOP_TEXT = {
  changed: (count: number) =>
    `${count} bản vừa thay đổi ở nơi khác. Bấm Thử lại để dựng và tải lên lại các bản đó, hoặc mở lại để xem.`,
  notDraft: (count: number) =>
    `${count} bản không còn là bản nháp nên không gửi cùng bộ được. Hãy về dự án và chọn lại các bản.`,
  cannotSend:
    "Có bản không thể gửi cùng bộ (lý do ở từng bản bên dưới). Hãy về dự án và chọn lại các bản.",
  gone: "Một bản trong bộ không còn tồn tại hoặc đã rời khỏi dự án. Hãy về dự án và chọn lại các bản.",
  unreadable:
    "Máy chủ chưa nhận bộ thiết kế nhưng không cho biết bản nào chưa đạt. Bấm Thử lại để dựng và tải lên lại tất cả các bản.",
} as const;

export const isFinal = (error: unknown) =>
  FINAL_CODES.some((code) => hasErrorCode(error, code)) ||
  isDesignStateChanged(error) ||
  isDesignGone(error);

export const failsOf = (report: PreflightReport) => report.issues.filter((i) => i.level === "fail");
export const notesOf = (report: PreflightReport) => report.issues.filter((i) => i.level === "note");

/** Why a design or the run stopped, for the customer: a load's own words, else the API's. */
export const describeStop = (error: unknown) =>
  error instanceof ExportError || error instanceof SetStopError
    ? error.message
    : describeDesignError(error);
