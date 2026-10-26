import { TransferInstructionsSection } from "@/components/storefront/transfer-instructions";
import { formatMoney } from "@/lib/format/money";

import { PAYMENT_STATUS_LABEL, PAYMENT_TERM_LABEL } from "../labels";
import { amountDue } from "../selectors";
import type { Order } from "../types";

const CARD =
  "rounded-[var(--r-lg)] border border-border-default bg-bg-surface p-[var(--card-pad)] shadow-[var(--card-shadow)]";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-ink-secondary">{label}</dt>
      <dd className="text-ink-primary text-right font-medium tabular-nums">{children}</dd>
    </div>
  );
}

/**
 * How the order is paid: the term, what has arrived, the deposit it needs, what is still due, or
 * a credit order's days to pay. The BE sends a field only when it applies (NON_NULL), so each row
 * appears only then. Nothing here when the order has neither a payment record nor a term.
 */
export function OrderPaymentCard({ order }: { order: Order }) {
  const { payment, paymentTerm } = order;
  if (!payment && !paymentTerm) return null;
  const money = (amount: number) => formatMoney(amount, order.currency);
  const due = amountDue(order);

  return (
    <section className={`${CARD} space-y-3`} aria-labelledby="order-payment-heading">
      <h2
        id="order-payment-heading"
        className="font-display text-ink-primary text-base font-semibold"
      >
        Thanh toán
      </h2>
      <dl className="space-y-2 text-sm">
        {paymentTerm ? <Row label="Hình thức">{PAYMENT_TERM_LABEL[paymentTerm]}</Row> : null}
        {payment ? <Row label="Trạng thái">{PAYMENT_STATUS_LABEL[payment.status]}</Row> : null}
        {payment?.depositRequired != null ? (
          <Row label="Tiền cọc cần thanh toán">{money(payment.depositRequired)}</Row>
        ) : null}
        {payment?.paidAmount != null ? (
          <Row label="Đã thanh toán">{money(payment.paidAmount)}</Row>
        ) : null}
        {due !== undefined && due > 0 ? <Row label="Còn phải thanh toán">{money(due)}</Row> : null}
        {payment?.creditTermDays != null ? (
          <Row label="Hạn thanh toán">{payment.creditTermDays} ngày sau khi giao</Row>
        ) : null}
      </dl>
      {/* Only while money is still due: the BE says NONE otherwise, and a shop without a bank account
          set up should not warn about an order that owes nothing. */}
      {due !== undefined && due > 0 ? (
        <TransferInstructionsSection orderId={order.orderId} />
      ) : null}
    </section>
  );
}
