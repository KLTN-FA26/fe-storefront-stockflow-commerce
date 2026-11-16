import type { SemanticTone } from "@/lib/domain/types";

import type { Design, DesignStatus } from "./types";

// The lifecycle of docs 12 §4 (spec 2026-11-09 §3): DRAFT → PENDING_REVIEW → APPROVED, a return
// sends a review back to DRAFT, a deleted DRAFT is ARCHIVED. Client-side gating only: the server
// decides and re-checks every move.

/** Where a design may go from each status (spec §3.2). */
export const DESIGN_TRANSITIONS: Record<DesignStatus, readonly DesignStatus[]> = {
  // save (version + 1, docs 12 BR-11), submit on a preflight Pass (BR-05, BR-07), delete (BR-16)
  DRAFT: ["DRAFT", "PENDING_REVIEW", "ARCHIVED"],
  // the Sales Manager approves (BR-08) or returns it with a reason (BR-06)
  PENDING_REVIEW: ["APPROVED", "DRAFT"],
  // final and read-only (BR-09); a change is a new DRAFT made by a revision (BR-12)
  APPROVED: [],
  // never restored (BR-16)
  ARCHIVED: [],
};

/** No way out of these (spec §3.2). */
export const TERMINAL_STATUSES: ReadonlySet<DesignStatus> = new Set(["APPROVED", "ARCHIVED"]);

export type DesignAction = "edit" | "rename" | "save" | "submit" | "delete" | "createRevision";

/**
 * What the customer may do in each status (spec §3.1). A DRAFT is theirs to change; PENDING_REVIEW
 * is locked while it is reviewed (docs 12 BR-07); an APPROVED design only seeds a revision (BR-12).
 * `submit` is further blocked while preflight fails (BR-05): the studio knows that, not this table.
 */
const ACTIONS: Record<DesignStatus, readonly DesignAction[]> = {
  DRAFT: ["edit", "rename", "save", "submit", "delete"],
  PENDING_REVIEW: [],
  APPROVED: ["createRevision"],
  ARCHIVED: [],
};

export const allowedActions = (design: Pick<Design, "status">): readonly DesignAction[] =>
  ACTIONS[design.status];

/**
 * Label, tone (special > danger > positive > warning > info > muted > neutral), whether the studio
 * lets the customer edit, and a one-line "what happens next". ARCHIVED is never listed or opened.
 */
export const DESIGN_STATUS_META: Record<
  DesignStatus,
  { label: string; tone: SemanticTone; editable: boolean; hint: string }
> = {
  DRAFT: {
    label: "Bản nháp",
    tone: "neutral",
    editable: true,
    hint: "Thiết kế được lưu tự động. Khi xong, bấm Gửi duyệt.",
  },
  PENDING_REVIEW: {
    label: "Chờ duyệt",
    tone: "info",
    editable: false,
    hint: "Quản lý kinh doanh đang duyệt thiết kế. Bạn sẽ nhận kết quả tại đây.",
  },
  APPROVED: {
    label: "Đã duyệt",
    tone: "positive",
    editable: false,
    hint: "Thiết kế đã duyệt và không sửa được nữa. Muốn thay đổi, hãy tạo bản sửa.",
  },
  ARCHIVED: {
    label: "Đã xoá",
    tone: "muted",
    editable: false,
    hint: "Bản nháp đã xoá.",
  },
};

/** The secondary badge of a returned draft (spec §3.1). */
export const RETURNED_META: { label: string; tone: SemanticTone } = {
  label: "Bị trả lại",
  tone: "warning",
};

/** A DRAFT the Sales Manager sent back: it carries the latest return's reason (docs 12 BR-06). */
export const isReturned = (design: Pick<Design, "status" | "lastReturn">): boolean =>
  design.status === "DRAFT" && design.lastReturn !== null;
