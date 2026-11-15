import { hasErrorCode } from "@/lib/api/describe-error";

import type { PreflightIssue, PreflightReport } from "../engine";
import { describeDesignError, isDesignGone, isDesignStateChanged } from "../errors";
import type { ReportedPreflightIssue } from "../types";
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
  | { kind: "stopped"; message: string };

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

/** What a refused round says on each design it names (BR-19: none was sent). */
export const REFUSED_ROW: Record<string, string> = {
  VERSION_CHANGED: "Bản này vừa được sửa ở nơi khác.",
  UPLOAD_INVALID: "File đã tải lên của bản này không còn dùng được.",
  DESIGN_NOT_DRAFT: "Bản này không còn là bản nháp.",
  DESIGN_NOT_IN_PROJECT: "Bản này không còn thuộc dự án.",
};
/** Refusals a new drawing and upload of the named designs gets past. */
export const DRAW_AGAIN = new Set(["VERSION_CHANGED", "UPLOAD_INVALID"]);
/** Refusals no retry gets past: the set must be chosen again. */
const FINAL_CODES = [
  "PROJECT_ARCHIVED",
  "SET_TOO_SMALL",
  "DESIGN_NOT_DRAFT",
  "DESIGN_NOT_IN_PROJECT",
];

export const isFinal = (error: unknown) =>
  FINAL_CODES.some((code) => hasErrorCode(error, code)) ||
  isDesignStateChanged(error) ||
  isDesignGone(error);

export const failsOf = (report: PreflightReport) => report.issues.filter((i) => i.level === "fail");
export const notesOf = (report: PreflightReport) => report.issues.filter((i) => i.level === "note");

/** Why a design or the run stopped, for the customer: a load's own words, else the API's. */
export const describeStop = (error: unknown) =>
  error instanceof ExportError ? error.message : describeDesignError(error);
