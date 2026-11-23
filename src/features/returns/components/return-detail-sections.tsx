import { formatDate, formatDateTime } from "@/lib/format/date";
import { formatMoney } from "@/lib/format/money";
import {
  RETURN_NOT_REFUNDED_META,
  RETURN_STATUSES,
  RETURN_STATUS_META,
  refundOutcome,
  type CustomerReturn,
  type ReturnStatus,
} from "@/lib/returns";

export const CARD =
  "rounded-[var(--r-lg)] border border-border-default bg-bg-surface p-[var(--card-pad)] shadow-[var(--card-shadow)]";

const qty = (value: number | null | undefined) => (value == null ? "—" : String(value));

/** Mỗi dòng: yêu cầu → được duyệt → kho đã nhận → được hoàn (đơn vị cái). */
export function ReturnLinesCard({ request }: { request: CustomerReturn }) {
  const currency = request.currency ?? "VND";
  return (
    <section className={`${CARD} space-y-3`} aria-labelledby="return-lines-heading">
      <h2
        id="return-lines-heading"
        className="font-display text-ink-primary text-base font-semibold"
      >
        Sản phẩm trả
      </h2>
      <ul className="divide-border-default divide-y">
        {request.lines.map((line) => (
          <li key={line.id} className="space-y-2 py-3 first:pt-0 last:pb-0">
            <p className="text-ink-primary font-mono text-sm font-semibold">{line.sku}</p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
              {(
                [
                  ["Yêu cầu", qty(line.requestedQuantity)],
                  ["Được duyệt", qty(line.approvedQuantity)],
                  ["Kho đã nhận", qty(line.receivedQuantity)],
                  ["Được hoàn", qty(line.refundQuantity || null)],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-ink-tertiary text-xs">{label}</dt>
                  <dd className="text-ink-primary font-medium tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
            {line.refundAmount != null && line.refundAmount > 0 ? (
              <p className="text-ink-secondary text-sm tabular-nums">
                Giá trị hoàn (gồm VAT): {formatMoney(line.refundAmount, currency)}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      {(request.discrepancies ?? []).length > 0 ? (
        <p className="text-ink-secondary text-sm">
          Kho ghi nhận chênh lệch:{" "}
          {(request.discrepancies ?? [])
            .map((d) => `${d.sku} ${d.kind === "SHORT" ? "thiếu" : "thừa"} ${d.quantity}`)
            .join(", ")}
          .
        </p>
      ) : null}
    </section>
  );
}

/**
 * Tiền: phần trừ vào các đợt còn nợ và phần đã thanh toán sẽ được chuyển lại (15 §4.5). Không hiện
 * cho yêu cầu xong mà không hoàn đồng nào (SF-01): thẻ "0 ₫ / 0 ₫" đọc như một khoản hoàn.
 */
export function ReturnMoneyCard({ request }: { request: CustomerReturn }) {
  if (request.refundedAmount == null && request.offsetAmount == null) return null;
  const outcome = refundOutcome(request);
  if (outcome !== null && outcome !== "REFUNDED") return null;
  const currency = request.currency ?? "VND";
  const rows = [
    ["Trừ vào các đợt còn nợ", request.offsetAmount],
    ["Hoàn lại cho bạn", request.refundedAmount],
  ] as const;
  return (
    <section className={`${CARD} space-y-3`} aria-labelledby="return-money-heading">
      <h2
        id="return-money-heading"
        className="font-display text-ink-primary text-base font-semibold"
      >
        Hoàn tiền
      </h2>
      <dl className="space-y-2 text-sm">
        {rows.map(([label, amount]) => (
          <div key={label} className="flex items-baseline justify-between gap-4">
            <dt className="text-ink-secondary">{label}</dt>
            <dd className="text-ink-primary font-medium tabular-nums">
              {formatMoney(amount ?? 0, currency)}
            </dd>
          </div>
        ))}
      </dl>
      {(request.refundedAmount ?? 0) > 0 ? (
        <p className="text-ink-tertiary text-xs">
          Kế toán chuyển khoản phần hoàn lại và ghi nhận ở mục Hoàn tiền của đơn.
        </p>
      ) : null}
    </section>
  );
}

/**
 * A step of the history in the customer's words. The RESOLVED step of a return closed with no money
 * reads as such, never "Đã hoàn tiền" (SF-01); a step newer than this FE keeps neutral wording.
 */
const statusLabel = (status: string, request: CustomerReturn) => {
  if (!(RETURN_STATUSES as readonly string[]).includes(status)) {
    return RETURN_STATUS_META.UNKNOWN.label;
  }
  if (status === "RESOLVED") {
    const outcome = refundOutcome(request);
    if (outcome !== null && outcome !== "REFUNDED") return RETURN_NOT_REFUNDED_META.label;
  }
  return RETURN_STATUS_META[status as ReturnStatus].label;
};

export function ReturnHistoryCard({ request }: { request: CustomerReturn }) {
  const steps = request.history ?? [];
  if (steps.length === 0) return null;
  return (
    <section className={`${CARD} space-y-3`} aria-labelledby="return-history-heading">
      <h2
        id="return-history-heading"
        className="font-display text-ink-primary text-base font-semibold"
      >
        Lịch sử
      </h2>
      <ol className="space-y-2 text-sm">
        {steps.map((step, index) => (
          <li key={`${step.status}-${index}`} className="flex justify-between gap-3">
            <span className="text-ink-primary">{statusLabel(step.status, request)}</span>
            <time className="text-ink-tertiary tabular-nums" dateTime={step.occurredAt}>
              {formatDateTime(step.occurredAt)}
            </time>
          </li>
        ))}
      </ol>
      <p className="text-ink-tertiary text-xs">
        Gửi yêu cầu ngày {formatDate(request.requestedAt)}.
      </p>
    </section>
  );
}
