"use client";

import { RefreshCw } from "lucide-react";

import { Alert, Skeleton } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { describeApiError } from "@/lib/api/describe-error";
import { formatMoney } from "@/lib/format/money";
import {
  isNoInstallments,
  useMyOrderInstallments,
  type OrderInstallments,
} from "@/lib/installments";

import type { Order } from "../types";
import { OrderInstallmentRow } from "./order-installment-row";

const CARD =
  "rounded-[var(--r-lg)] border border-border-default bg-bg-surface p-[var(--card-pad)] shadow-[var(--card-shadow)]";

/** An order that ended before a contract was signed has no installments and nothing to say here. */
const ENDED_STATUSES: ReadonlySet<Order["status"]> = new Set(["CANCELLED", "RETURNED"]);

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-ink-secondary">{label}</dt>
      <dd className="text-ink-primary text-right font-medium tabular-nums">{children}</dd>
    </div>
  );
}

function Summary({ plan }: { plan: OrderInstallments }) {
  const money = (amount: number) => formatMoney(amount, plan.currency);
  return (
    <dl className="space-y-2 text-sm">
      {plan.contractNumber ? (
        <Row label="Hợp đồng">
          <span className="font-mono">{plan.contractNumber}</span>
        </Row>
      ) : null}
      <Row label="Tổng theo hợp đồng">{money(plan.total)}</Row>
      <Row label="Đã thanh toán">{money(plan.paid)}</Row>
      <Row label="Còn phải thanh toán">{money(plan.outstanding)}</Row>
    </dl>
  );
}

/**
 * How the order is paid (kltn-docs 15): the installments of its sales contract, what each still owes
 * and, for one that does, how to transfer for it. An order without a signed contract has no
 * installments yet (404 INSTALLMENT_NOT_FOUND): the card says so, or is left out once the order
 * ended without one.
 */
export function OrderPaymentCard({ order }: { order: Order }) {
  const query = useMyOrderInstallments(order.orderId);

  if (!query.isPending && isNoInstallments(query.error) && ENDED_STATUSES.has(order.status)) {
    return null;
  }

  return (
    <section className={`${CARD} space-y-3`} aria-labelledby="order-payment-heading">
      <h2
        id="order-payment-heading"
        className="font-display text-ink-primary text-base font-semibold"
      >
        Thanh toán
      </h2>
      {query.isPending ? (
        <Skeleton
          role="status"
          aria-label="Đang tải"
          className="h-24 w-full rounded-[var(--r-md)]"
        />
      ) : isNoInstallments(query.error) ? (
        <p className="text-ink-secondary text-sm">
          Lịch thanh toán theo đợt sẽ hiển thị khi hợp đồng mua bán của đơn được ký.
        </p>
      ) : query.error ? (
        <div className="space-y-2" role="alert">
          <Alert tone="warning" title="Không tải được lịch thanh toán.">
            {describeApiError(query.error)}
          </Alert>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 rounded-[var(--r-md)] px-4"
            onClick={() => void query.refetch()}
          >
            <RefreshCw aria-hidden className="mr-2 size-4" />
            Thử lại
          </Button>
        </div>
      ) : query.data ? (
        <>
          <Summary plan={query.data} />
          <ul className="space-y-2" aria-label="Các đợt thanh toán">
            {query.data.installments.map((installment) => (
              <OrderInstallmentRow key={installment.installmentId} installment={installment} />
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
