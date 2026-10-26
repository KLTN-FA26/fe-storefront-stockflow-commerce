import { formatDateTime, formatDayMonth } from "@/lib/format";

import { deriveUiState, type DesignUiState } from "./lifecycle";
import type { DesignDecision, DesignDraft } from "./types";

export type DesignCardView = {
  title: string;
  /** SKU and template code; empty when the BE sent neither (the real BE has no P6 fields). */
  subtitle: string;
  /** The update time, formatted (Asia/Ho_Chi_Minh); null when the BE sent none or it is unreadable. */
  updatedLabel: string | null;
  state: DesignUiState;
};

const readableDateTime = (iso: string | null | undefined) =>
  iso && !Number.isNaN(Date.parse(iso)) ? formatDateTime(iso) : null;

/** What a design card shows. The product's own name is not on the draft: the list can add it. */
export function designCardView(draft: DesignDraft): DesignCardView {
  return {
    title: draft.name,
    subtitle: [draft.sku, draft.templateCode].filter(Boolean).join(" · "),
    updatedLabel: readableDateTime(draft.updatedAt),
    state: deriveUiState(draft),
  };
}

/** The BE refuses a design name over 200 characters (`@Size(max = 200)`). */
const NAME_MAX = 200;

/** "{template name} – dd/MM": what a design started from the launcher is called until the customer renames it. */
export function defaultDesignName(templateName: string, at: Date): string {
  const suffix = ` – ${formatDayMonth(at)}`;
  return `${templateName.slice(0, NAME_MAX - suffix.length)}${suffix}`;
}

/** What each BE decision (`GET /designs/{id}/history`) reads as to the customer. */
const DECISION_LABELS: Record<string, string> = {
  TECHNICAL_REVIEW_REQUESTED: "Đã gửi QC kiểm tra",
  TECHNICAL_ACCEPTED: "QC: đạt kỹ thuật",
  TECHNICAL_REJECTED: "QC yêu cầu sửa",
  SPECIFICATION_CHANGED: "Cập nhật mô tả kỹ thuật",
  SENT_TO_CUSTOMER: "Sales gửi thiết kế để bạn xác nhận",
  CUSTOMER_CHANGES_REQUESTED: "Bạn yêu cầu sửa",
  WITHDRAWN: "Đã rút yêu cầu xác nhận",
  CUSTOMER_CONFIRMED: "Bạn đã xác nhận thiết kế",
  DERIVED_FROM_SNAPSHOT: "Tạo từ bản chốt",
  ASSIGNMENT_CHANGED: "Đổi người phụ trách",
};

/**
 * Decisions whose notes are written for the customer: QC's review notes and the customer's own
 * reasons. Other notes (the specification text, Sales' internal remarks) are not shown.
 */
const CUSTOMER_NOTES = new Set([
  "TECHNICAL_ACCEPTED",
  "TECHNICAL_REJECTED",
  "CUSTOMER_CHANGES_REQUESTED",
  "WITHDRAWN",
]);

export type DecisionView = { label: string; notes: string | null; atLabel: string | null };

/** One row of the decision history: its label (the code itself when unknown), notes and time. */
export function decisionView(decision: DesignDecision): DecisionView {
  const notes = decision.notes?.trim();
  return {
    label: DECISION_LABELS[decision.decision] ?? decision.decision,
    notes: notes && CUSTOMER_NOTES.has(decision.decision) ? notes : null,
    atLabel: readableDateTime(decision.at),
  };
}
