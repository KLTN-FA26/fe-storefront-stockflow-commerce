import type { SemanticTone } from "@/lib/domain/types";

import type { DesignDraft } from "./types";

// The BE knows DRAFT / SUBMITTED / APPROVED (REJECTED is declared and never set); what the
// customer sees is derived from it plus the technical-review fields (spec §7.5). Docs 12's own
// lifecycle vocabulary differs from the BE's: the FE follows the BE (spec G7).

export type DesignUiState =
  | "editing"
  | "awaitingReview"
  | "changesRequested"
  | "reviewPassed"
  | "awaitingConfirmation"
  | "confirmed";

export type DesignAction =
  | "edit"
  | "requestReview"
  | "finalize"
  | "confirm"
  | "requestChanges"
  | "withdraw"
  | "fork"
  | "requestQuote";

const hasReviewNotes = (draft: DesignDraft) => Boolean(draft.reviewNotes?.trim());

/**
 * The customer asked QC to look and has changed nothing since. `updatedAt` marks a BE that sends
 * the P6 fields: there, anything that voids a review (a document save, a new artifact) clears
 * `reviewRequestedAt` while `currentArtifactId` stays, so a review is in progress only while the
 * request is there and not older than the last change (`reviewRequestedAt >= updatedAt`). The real
 * BE sends no P6 fields: a draft with a current artifact is a review in progress.
 */
function reviewIsInProgress(draft: DesignDraft) {
  if (!draft.updatedAt) return Boolean(draft.reviewRequestedAt) || Boolean(draft.currentArtifactId);
  if (!draft.reviewRequestedAt) return false;
  return !(Date.parse(draft.reviewRequestedAt) < Date.parse(draft.updatedAt));
}

/**
 * The first match wins, in the order of spec §7.5: confirmed → awaitingConfirmation →
 * reviewPassed → changesRequested → awaitingReview → editing. A customer change request
 * (SUBMITTED → DRAFT) leaves `reviewNotes` set, so it reads as changesRequested with the
 * customer's own reason. REJECTED is never set by the BE; it falls through like a draft.
 */
export function deriveUiState(draft: DesignDraft): DesignUiState {
  if (draft.status === "APPROVED") return "confirmed";
  if (draft.status === "SUBMITTED") return "awaitingConfirmation";
  if (draft.technicalReviewPassed) return "reviewPassed";
  if (hasReviewNotes(draft)) return "changesRequested";
  return reviewIsInProgress(draft) ? "awaitingReview" : "editing";
}

/**
 * Label, tone (special > danger > positive > warning > info > muted > neutral), whether the
 * studio lets the customer edit, and a one-line "what happens next".
 */
export const DESIGN_UI_STATE_META: Record<
  DesignUiState,
  { label: string; tone: SemanticTone; editable: boolean; hint: string }
> = {
  editing: {
    label: "Đang thiết kế",
    tone: "neutral",
    editable: true,
    hint: "Thiết kế đang được lưu tự động. Khi xong, hãy gửi QC kiểm tra.",
  },
  awaitingReview: {
    label: "Chờ QC kiểm tra",
    tone: "info",
    editable: true,
    hint: "QC đang kiểm tra thiết kế của bạn. Chỉnh sửa lúc này sẽ huỷ yêu cầu kiểm tra.",
  },
  changesRequested: {
    label: "QC yêu cầu sửa",
    tone: "warning",
    editable: true,
    hint: "Hãy chỉnh thiết kế theo ghi chú của QC rồi gửi QC kiểm tra lại.",
  },
  reviewPassed: {
    label: "Đạt kỹ thuật",
    tone: "positive",
    editable: true,
    hint: "Thiết kế đã đạt kỹ thuật. Hãy chốt để tiếp tục báo giá; nếu chỉnh sửa, QC sẽ kiểm tra lại.",
  },
  awaitingConfirmation: {
    label: "Chờ bạn xác nhận",
    tone: "warning",
    editable: false,
    hint: "Sales đã gửi thiết kế cho bạn. Hãy xác nhận, hoặc yêu cầu chỉnh sửa nếu chưa ưng ý.",
  },
  confirmed: {
    label: "Đã chốt",
    tone: "positive",
    editable: false,
    hint: "Thiết kế đã chốt và không thể sửa. Bạn có thể yêu cầu báo giá hoặc tạo phiên bản mới.",
  },
};

/**
 * The hint of the workflow-only view (R72), where nothing can be edited or sent to QC: in the
 * states where the studio would ask the customer to edit or send, it says what Sales and QC do
 * next instead (N6). The states the view does act in keep their own hint.
 */
export const WORKFLOW_ONLY_HINTS: Record<DesignUiState, string> = {
  editing: "Sales đang lên thiết kế theo yêu cầu của bạn và sẽ gửi để bạn xác nhận.",
  awaitingReview: "QC đang kiểm tra thiết kế. Kết quả sẽ hiện tại đây.",
  changesRequested:
    "Thiết kế đang được chỉnh theo ghi chú bên dưới; Sales sẽ gửi lại để bạn xác nhận.",
  reviewPassed: "Thiết kế đã đạt kỹ thuật. Sales sẽ gửi để bạn xác nhận.",
  awaitingConfirmation: DESIGN_UI_STATE_META.awaitingConfirmation.hint,
  confirmed: DESIGN_UI_STATE_META.confirmed.hint,
};

/**
 * What the customer may do in each state (spec §7.5). UI gating only — the BE decides and
 * re-checks. `requestReview` is further blocked while preflight has a Fail (BR-01, BR-DSG-001):
 * the studio knows the preflight result, not this table.
 */
const ACTIONS: Record<DesignUiState, readonly DesignAction[]> = {
  editing: ["edit", "requestReview"],
  awaitingReview: ["edit"],
  changesRequested: ["edit", "requestReview"],
  reviewPassed: ["edit", "finalize"],
  awaitingConfirmation: ["confirm", "requestChanges", "withdraw"],
  confirmed: ["fork", "requestQuote"],
};

export const allowedActions = (state: DesignUiState): readonly DesignAction[] => ACTIONS[state];
