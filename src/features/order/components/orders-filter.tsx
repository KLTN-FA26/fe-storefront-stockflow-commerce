"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { parseAsStringLiteral } from "nuqs";

import { STORE_ROUTES } from "@/constants";
import { FilterPill } from "@/components/storefront/filter-pill";
import { useHasPermission } from "@/lib/auth/my-permissions";
import { formatMoney } from "@/lib/format/money";
import {
  installmentShortName,
  isPayable,
  useMyInstallments,
  type Installment,
} from "@/lib/installments";

import type { OrderStatus } from "../types";

/** The orders list's views (SF-UX-28): every order, or the ones waiting on the customer. */
export const ORDER_VIEWS = ["tat-ca", "can-xu-ly"] as const;
export type OrderView = (typeof ORDER_VIEWS)[number];

const VIEW_LABEL: Record<OrderView, string> = {
  "tat-ca": "Tất cả",
  "can-xu-ly": "Cần xử lý",
};

/** `?xem=can-xu-ly` keeps the view in the URL, shareable and kept on Back. */
export const orderViewParser = parseAsStringLiteral(ORDER_VIEWS)
  .withDefault("tat-ca")
  .withOptions({ history: "push", scroll: false });

/** Orders waiting on the customer: a contract to sign, a payment to make (BE `status`). */
export const NEEDS_CUSTOMER_STATUSES: readonly OrderStatus[] = [
  "PENDING_CONTRACT",
  "PENDING_PAYMENT",
];

/** The BE pages at most 200; a customer's installments fit, and overdue ones are few. */
const INSTALLMENTS_SCAN_SIZE = 200;
const INSTALLMENTS_PERMISSION = "payment-installments:READ";

export function OrderViewTabs({
  view,
  onChange,
}: {
  view: OrderView;
  onChange: (view: OrderView) => void;
}) {
  return (
    <div role="group" aria-label="Lọc đơn hàng" className="flex flex-wrap gap-2">
      {ORDER_VIEWS.map((option) => (
        <FilterPill
          key={option}
          active={view === option}
          aria-pressed={view === option}
          onClick={() => onChange(option)}
        >
          {VIEW_LABEL[option]}
        </FilterPill>
      ))}
    </div>
  );
}

/** One entry per order with an overdue installment: the first overdue one, by its number. */
function overdueByOrder(installments: readonly Installment[]): Installment[] {
  const byOrder = new Map<string, Installment>();
  for (const installment of installments) {
    if (!installment.overdue || !isPayable(installment)) continue;
    const known = byOrder.get(installment.orderId);
    if (!known || installment.seq < known.seq) byOrder.set(installment.orderId, installment);
  }
  return [...byOrder.values()];
}

/**
 * The "overdue" part of "Cần xử lý" (SF-UX-28): an order can be past signing and payment and still
 * owe an installment past its day, which the order list cannot filter by. Read from the customer's
 * installments; nothing shown without the permission or without an overdue one.
 */
export function OverdueOrders() {
  const allowed = useHasPermission(INSTALLMENTS_PERMISSION);
  const query = useMyInstallments({ page: 0, size: INSTALLMENTS_SCAN_SIZE }, allowed);
  const overdue = overdueByOrder(query.data?.items ?? []);
  if (overdue.length === 0) return null;
  return (
    <section
      aria-labelledby="overdue-orders-heading"
      className="border-danger/40 bg-danger/5 space-y-2 rounded-[var(--r-lg)] border p-[var(--card-pad)]"
    >
      <h2
        id="overdue-orders-heading"
        className="text-danger-ink flex items-center gap-2 text-sm font-semibold"
      >
        <AlertTriangle aria-hidden className="size-4" />
        Đơn có đợt thanh toán quá hạn
      </h2>
      <ul className="space-y-1 text-sm">
        {overdue.map((installment) => (
          <li key={installment.orderId}>
            <Link
              href={STORE_ROUTES.account.orders.detail(installment.orderId)}
              className="text-accent focus-visible:ring-accent inline-flex min-h-11 items-center rounded-[var(--r-sm)] font-semibold underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
            >
              Đơn {installment.orderNumber}
            </Link>
            <span className="text-ink-secondary tabular-nums">
              {" "}
              · {installmentShortName(installment)} còn{" "}
              {formatMoney(installment.outstanding, installment.currency)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
