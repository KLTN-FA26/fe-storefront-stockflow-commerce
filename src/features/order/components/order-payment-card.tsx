"use client";

import { useState } from "react";
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

import { nextPayable, paymentSummary } from "../selectors";
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

function Summary({ order, plan }: { order: Order; plan: OrderInstallments }) {
  const money = (amount: number) => formatMoney(amount, plan.currency);
  const { rows, cancelledAndSettled } = paymentSummary(order, plan);
  return (
    <>
      <dl className="space-y-2 text-sm">
        {plan.contractNumber ? (
          <Row label="Hợp đồng">
            <span className="font-mono">{plan.contractNumber}</span>
          </Row>
        ) : null}
        {rows.includes("total") ? <Row label="Tổng có VAT">{money(plan.total)}</Row> : null}
        {rows.includes("paid") ? (
          <Row label={cancelledAndSettled ? "Bạn đã thanh toán" : "Đã thanh toán"}>
            {money(plan.paid)}
          </Row>
        ) : null}
        {rows.includes("outstanding") ? (
          <Row label="Còn phải thanh toán">{money(plan.outstanding)}</Row>
        ) : null}
      </dl>
      {cancelledAndSettled ? (
        <p className="text-ink-secondary text-sm">
          Đơn đã huỷ: các đợt chưa trả không còn phải thanh toán. Khoản hoàn (nếu có) ở mục Hoàn
          tiền bên dưới.
        </p>
      ) : null}
    </>
  );
}

/**
 * Which installments show their transfer details: the ones the customer opened, else (`null`) the
 * one due now, so paying takes no extra tap (SF-UX-29).
 */
export function openedInstallments(
  opened: ReadonlySet<string> | null,
  plan: OrderInstallments | undefined,
): ReadonlySet<string> {
  if (opened) return opened;
  const due = nextPayable(plan);
  return new Set(due ? [due.installmentId] : []);
}

/**
 * How the order is paid (kltn-docs 15): the installments of its sales contract, what each still owes
 * and, for one that does, how to transfer for it. An order without a signed contract has no
 * installments yet (404 INSTALLMENT_NOT_FOUND): the card says the plan is in the contract and opens
 * on signing, or is left out once the order ended without one.
 */
export function OrderPaymentCard({
  order,
  opened,
  onOpenedChange,
}: {
  order: Order;
  /**
   * Installments whose transfer details are open; null for the default (the one due now). Left out,
   * the card keeps this itself; the order page holds it so the status hero can open one.
   */
  opened?: ReadonlySet<string> | null;
  onOpenedChange?: (opened: ReadonlySet<string>) => void;
}) {
  const [own, setOwn] = useState<ReadonlySet<string> | null>(null);
  const query = useMyOrderInstallments(order.orderId);
  const open = openedInstallments(opened !== undefined ? opened : own, query.data);
  const change = onOpenedChange ?? setOwn;

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
          Lịch thanh toán dự kiến nằm trong hợp đồng; các đợt mở để thanh toán khi hợp đồng được ký.
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
          <Summary order={order} plan={query.data} />
          <ul className="space-y-2" aria-label="Các đợt thanh toán">
            {query.data.installments.map((installment) => (
              <OrderInstallmentRow
                key={installment.installmentId}
                installment={installment}
                open={open.has(installment.installmentId)}
                onOpenChange={(next) => {
                  const updated = new Set(open);
                  if (next) updated.add(installment.installmentId);
                  else updated.delete(installment.installmentId);
                  change(updated);
                }}
              />
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
