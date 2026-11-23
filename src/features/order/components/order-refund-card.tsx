"use client";

import { Alert } from "@/components/shared";
import { DocumentDownloadButton } from "@/components/storefront/document-download-button";
import { Button } from "@/components/ui/button";
import { describeApiError } from "@/lib/api/describe-error";
import { useHasPermission, useMyPermissions } from "@/lib/auth/my-permissions";
import { getMyRefundConfirmation } from "@/lib/documents";
import { formatDate } from "@/lib/format/date";
import { formatMoney } from "@/lib/format/money";
import { shippingFeeWaivedOf, useMyOrderRefund } from "@/lib/refunds";

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
 * hoàn và các lần Kế toán đã chuyển. Chỉ hiện khi có khoản phải hoàn — hoặc khi không đọc được, để
 * khách biết thông tin hoàn tiền chưa tải được thay vì tưởng là không có (HT-1).
 */
export function OrderRefundCard({ order }: { order: Order }) {
  // Không hỏi gì khi danh sách quyền chưa về: tài khoản thiếu quyền không thấy thẻ nháy lên
  const permissions = useMyPermissions();
  const allowed = useHasPermission(REFUNDS_PERMISSION) && !permissions.isPending;
  const query = useMyOrderRefund(order.orderId, allowed);
  const refund = query.data;
  if (allowed && query.isError && !refund) {
    return (
      <section className={`${CARD} space-y-3`} aria-labelledby="order-refund-heading">
        <h2
          id="order-refund-heading"
          className="font-display text-ink-primary text-base font-semibold"
        >
          Hoàn tiền
        </h2>
        <Alert tone="danger" title="Chưa tải được thông tin hoàn tiền">
          {describeApiError(query.error)}
        </Alert>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 w-full rounded-[var(--r-md)]"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          {query.isFetching ? "Đang tải lại…" : "Thử lại"}
        </Button>
      </section>
    );
  }
  if (!allowed || !refund) return null;
  const money = (amount: number) => formatMoney(amount, refund.currency);
  const shippingFeeWaived = shippingFeeWaivedOf(refund);

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
        {shippingFeeWaived > 0 ? (
          <Row label="Phí vận chuyển được miễn" value={money(shippingFeeWaived)} />
        ) : null}
        {(refund.feeOwed ?? 0) > 0 ? (
          <Row label="Phí còn phải thanh toán" value={money(refund.feeOwed ?? 0)} />
        ) : null}
      </dl>
      {shippingFeeWaived > 0 ? (
        <p className="text-ink-tertiary text-xs">
          Hàng bị đơn vị vận chuyển hoàn về nên phí vận chuyển của phần đó không tính cho bạn.
        </p>
      ) : null}
      {(refund.records ?? []).length > 0 && (
        <ul className="text-ink-secondary space-y-2 text-sm" aria-label="Các lần đã hoàn">
          {(refund.records ?? []).map((record) => (
            <li key={record.refundRecordId} className="space-y-1">
              <div className="flex justify-between gap-2 tabular-nums">
                <span>
                  {formatDate(record.refundedOn)} ·{" "}
                  <span className="font-mono">{record.reference}</span>
                </span>
                <span>{money(record.amount)}</span>
              </div>
              <DocumentDownloadButton
                kind="refundConfirmation"
                size="sm"
                label="Phiếu hoàn tiền"
                ariaLabel={`Tải phiếu hoàn tiền ${record.reference}`}
                load={() => getMyRefundConfirmation(record.refundRecordId, record.reference)}
              />
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
