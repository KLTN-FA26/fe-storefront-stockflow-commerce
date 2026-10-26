import { cn } from "cn";

import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format/date";

import { CANCELLATION_REASON_LABEL, CANCELLATION_REQUEST_META } from "../labels";
import type { CancellationRequest } from "../types";
import { ORDER_TONE_CLASSES } from "./order-status-badge";

/**
 * The customer's cancellation request once it is no longer waiting: decided by Sales (accepted or
 * not) or closed by the system because the order moved on (EXPIRED). A waiting request is shown
 * by the help card, where the customer asked for it.
 */
export function OrderCancellationCard({ request }: { request: CancellationRequest }) {
  const meta = CANCELLATION_REQUEST_META[request.status];
  // Sales' own answer, when it wrote one. The system's text for EXPIRED is English: not shown.
  const answer = request.status === "EXPIRED" ? null : request.decisionNote?.trim();
  const reason =
    request.reasonCode && request.reasonCode !== "UNKNOWN"
      ? CANCELLATION_REASON_LABEL[request.reasonCode]
      : null;

  return (
    <section
      aria-labelledby="order-cancellation-heading"
      className="bg-bg-surface border-border-default space-y-3 rounded-[var(--r-lg)] border p-[var(--card-pad)] shadow-[var(--card-shadow)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id="order-cancellation-heading"
          className="font-display text-ink-primary text-base font-semibold"
        >
          Yêu cầu huỷ đơn
        </h2>
        <Badge
          data-tone={meta.tone}
          className={cn("rounded-full px-3 text-sm font-semibold", ORDER_TONE_CLASSES[meta.tone])}
        >
          {meta.label}
        </Badge>
      </div>
      <p className="text-ink-secondary text-sm">{meta.note}</p>
      <dl className="text-ink-secondary space-y-1 text-sm">
        <div>
          Gửi lúc <dd className="inline">{formatDateTime(request.requestedAt)}</dd>
        </div>
        {request.decidedAt ? (
          <div>
            {request.status === "EXPIRED" ? "Đóng lúc" : "Trả lời lúc"}{" "}
            <dd className="inline">{formatDateTime(request.decidedAt)}</dd>
          </div>
        ) : null}
        {request.note ? (
          <div>
            Lý do bạn nêu: <dd className="text-ink-primary inline">{request.note}</dd>
          </div>
        ) : reason ? (
          <div>
            Lý do: <dd className="text-ink-primary inline">{reason}</dd>
          </div>
        ) : null}
        {answer ? (
          <div>
            Phản hồi từ Sales: <dd className="text-ink-primary inline">{answer}</dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}
