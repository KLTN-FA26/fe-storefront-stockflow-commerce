import type { SemanticTone } from "@/lib/domain/types";

import type { OwnerChangeRequestReason, OwnerChangeRequestStatus, SalesOwner } from "./schemas";

/**
 * A change request (KE-HOACH sales owner §10.5): the customer asks, a Sales Manager decides. PENDING → APPROVED (the
 * Sales changed) / REJECTED (with the reason); WITHDRAWN. UI-only: the BE enforces one open request and the 30 days.
 */
export const OWNER_CHANGE_REQUEST_STATUS_META: Record<
  OwnerChangeRequestStatus,
  { label: string; tone: SemanticTone }
> = {
  PENDING: { label: "Chờ duyệt", tone: "warning" },
  APPROVED: { label: "Đã đổi", tone: "positive" },
  REJECTED: { label: "Không chấp nhận", tone: "danger" },
  WITHDRAWN: { label: "Đã rút", tone: "muted" },
  UNKNOWN: { label: "Đang xử lý", tone: "neutral" },
};

export const OWNER_CHANGE_REQUEST_REASON_LABELS: Record<OwnerChangeRequestReason, string> = {
  SLOW_RESPONSE: "Phản hồi chậm",
  NOT_SATISFIED: "Chưa hài lòng với cách tư vấn",
  PREFER_KNOWN_CONTACT: "Muốn làm việc với người quen",
  OTHER: "Lý do khác",
};

/** While a request waits for the Sales Manager, a second one would be refused (OWNER_CHANGE_REQUEST_PENDING). */
export const canRequestChange = (latest: { status: OwnerChangeRequestStatus } | undefined) =>
  latest?.status !== "PENDING";

/**
 * The owner to show, or null. An owner whose account was closed (`active: false`, NEEDS_ASSIGNMENT on the staff side)
 * is not shown: nobody would answer under that name, and a Sales Manager is giving the customer a new one.
 */
export function shownOwner(
  owner: SalesOwner | null | undefined,
): { name: string; cover: string | null } | null {
  const name = owner?.name?.trim();
  if (!name || owner?.active === false) return null;
  return { name, cover: owner?.coverName?.trim() || null };
}
