"use client";

import { useHasPermission, useMyPermissions } from "@/lib/auth/my-permissions";
import { formatDate } from "@/lib/format/date";
import { formatMoney } from "@/lib/format/money";
import { useMyOrderRefund } from "@/lib/refunds";

import type { Order } from "../types";

const CARD =
  "rounded-[var(--r-lg)] border border-border-default bg-bg-surface p-[var(--card-pad)] shadow-[var(--card-shadow)]";
export const REFUNDS_PERMISSION = "payment-refunds:READ";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-ink-secondary">{label}</dt>
      <dd className="text-ink-primary text-right font-medium tabular-nums">{value}</dd>
    </div>
  );
}

/**
 * Hoàn tiền của đơn (kltn-docs 15 §4.5): số phải hoàn do huỷ, đóng phần còn lại hay trả hàng, số đã
 * hoàn và các lần Kế toán đã chuyển. Chỉ hiện khi có khoản phải hoàn.
 */
export function OrderRefundCard({ order }: { order: Order }) {
  // Không hỏi gì khi danh sách quyền chưa về: tài khoản thiếu quyền không thấy thẻ nháy lên
  const permissions = useMyPermissions();
  const allowed = useHasPermission(REFUNDS_PERMISSION) && !permissions.isPending;
  const query = useMyOrderRefund(order.orderId, allowed);
  const refund = query.data;
  if (!allowed || !refund) return null;
  const money = (amount: number) => formatMoney(amount, refund.currency);

  return (
    <section className={`${CARD} space-y-3`} aria-labelledby="order-refund-heading">
      <h2
        id="order-refund-heading"
        className="font-display text-ink-primary text-base font-semibold"
      >
        Hoàn tiền
      </h2>
      <dl className="space-y-2 text-sm">
        <Row label="Số tiền phải hoàn" value={money(refund.refundable)} />
        <Row label="Đã hoàn" value={money(refund.refunded)} />
        <Row label="Còn chờ hoàn" value={money(refund.remaining)} />
      </dl>
      {(refund.records ?? []).length > 0 && (
        <ul className="text-ink-secondary space-y-1 text-sm" aria-label="Các lần đã hoàn">
          {(refund.records ?? []).map((record) => (
            <li key={record.refundRecordId} className="flex justify-between gap-2 tabular-nums">
              <span>
                {formatDate(record.refundedOn)} ·{" "}
                <span className="font-mono">{record.reference}</span>
              </span>
              <span>{money(record.amount)}</span>
            </li>
          ))}
        </ul>
      )}
      {refund.remaining > 0 && (
        <p className="text-ink-tertiary text-xs">
          Kế toán sẽ chuyển khoản phần còn lại và ghi nhận tại đây.
        </p>
      )}
    </section>
  );
}
