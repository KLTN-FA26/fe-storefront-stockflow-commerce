import { ToneBadge } from "@/components/storefront/tone-badge";
import { formatDate } from "@/lib/format/date";

import { OWNER_CHANGE_REQUEST_REASON_LABELS, OWNER_CHANGE_REQUEST_STATUS_META } from "../lifecycle";

import type { OwnerChangeRequest } from "../schemas";

/** Where the latest request stands: waiting, done, or refused with the Sales Manager's reason. */
export function ChangeRequestStatus({ request }: { request: OwnerChangeRequest }) {
  const meta = OWNER_CHANGE_REQUEST_STATUS_META[request.status];
  const reason =
    request.reason && request.reason !== "UNKNOWN"
      ? OWNER_CHANGE_REQUEST_REASON_LABELS[request.reason]
      : null;
  const facts = [
    request.createdAt ? `Gửi ngày ${formatDate(request.createdAt)}` : null,
    reason ? `Lý do: ${reason}` : null,
  ].filter(Boolean);

  return (
    <div
      role="status"
      aria-label="Yêu cầu đổi người hỗ trợ gần nhất"
      className="bg-bg-subtle grid gap-1.5 rounded-[var(--r-md)] p-3 text-sm"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-ink-primary font-medium">Yêu cầu đổi người hỗ trợ</span>
        <ToneBadge label={meta.label} tone={meta.tone} size="sm" />
      </div>
      {facts.length > 0 ? <p className="text-ink-tertiary text-xs">{facts.join(" · ")}</p> : null}
      {request.status === "PENDING" ? (
        <p className="text-ink-secondary">Quản lý bán hàng sẽ xem xét và báo kết quả cho bạn.</p>
      ) : null}
      {request.status === "REJECTED" && request.decisionNote?.trim() ? (
        <p className="text-ink-secondary break-words">Phản hồi: {request.decisionNote}</p>
      ) : null}
    </div>
  );
}
