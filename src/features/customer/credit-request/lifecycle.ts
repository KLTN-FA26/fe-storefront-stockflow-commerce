import type { SemanticTone } from "@/lib/domain/types";

import type { CreditRequest, CreditRequestStatus } from "./schemas";

/**
 * Credit request lifecycle (kltn-docs 15 §4.3 steps 9–11a; BE `CreditRequestStatus`): the customer files → SUBMITTED;
 * Sales' opinion → PENDING_APPROVAL; the accountant → APPROVED / REJECTED; whoever filed it may withdraw while open.
 * UI-only — the BE re-checks (CREDIT_REQUEST_NOT_FILER, CREDIT_REQUEST_INVALID_TRANSITION).
 */
export const CREDIT_REQUEST_TRANSITIONS = {
  SUBMITTED: ["PENDING_APPROVAL", "WITHDRAWN"],
  PENDING_APPROVAL: ["APPROVED", "REJECTED", "WITHDRAWN"],
  APPROVED: [],
  REJECTED: [],
  WITHDRAWN: [],
  UNKNOWN: [],
} as const satisfies Record<CreditRequestStatus, readonly CreditRequestStatus[]>;

export const CREDIT_REQUEST_STATUS_META: Record<
  CreditRequestStatus,
  { label: string; tone: SemanticTone }
> = {
  SUBMITTED: { label: "Chờ Sale xem xét", tone: "info" },
  PENDING_APPROVAL: { label: "Chờ kế toán duyệt", tone: "warning" },
  APPROVED: { label: "Đã duyệt", tone: "positive" },
  REJECTED: { label: "Bị từ chối", tone: "danger" },
  WITHDRAWN: { label: "Đã rút", tone: "muted" },
  UNKNOWN: { label: "Không rõ", tone: "neutral" },
};

export type CreditRequestAction = "withdraw" | "attach";

export function isOpen(status: CreditRequestStatus): boolean {
  return status === "SUBMITTED" || status === "PENDING_APPROVAL";
}

/** A request Sales filed for the customer is Sales' to withdraw (BE CREDIT_REQUEST_NOT_FILER). */
export function allowedCreditRequestActions(
  request: Pick<CreditRequest, "status" | "source">,
): CreditRequestAction[] {
  if (!isOpen(request.status)) return [];
  return request.source === "PORTAL" ? ["withdraw", "attach"] : ["attach"];
}
