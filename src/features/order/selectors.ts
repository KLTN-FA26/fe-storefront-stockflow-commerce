import { formatNumber } from "@/lib/format";
import { isPayable, type Installment, type OrderInstallments } from "@/lib/installments";

import type { Order, OrderCard, OrderTimelineEntry } from "./types";

/**
 * What a list row says the order holds: "<first item>" or "<first item> và N sản phẩm khác"
 * (BE `firstItemName`, UI/UX 27/11 sf-06); the line count alone while the BE does not send it.
 * A "mặt hàng"/"sản phẩm" is an order line (one SKU), as on the detail.
 */
export function orderItemsSummary(order: Pick<OrderCard, "firstItemName" | "lineCount">): string {
  const first = order.firstItemName?.trim();
  if (!first) return `${formatNumber(order.lineCount)} mặt hàng`;
  const others = order.lineCount - 1;
  return others > 0 ? `${first} và ${formatNumber(others)} sản phẩm khác` : first;
}

/**
 * The timeline as the customer reads it: one step per status group. The BE history has a row per
 * internal status, and several of them are one step to the customer (READY_TO_FULFILL then
 * IN_FULFILMENT are both "Đang chuẩn bị hàng"), so consecutive rows of the same group collapse
 * into the first, the moment the group was entered. Order is the BE's (oldest first).
 */
export function customerTimeline(entries: readonly OrderTimelineEntry[] | null | undefined) {
  const steps: OrderTimelineEntry[] = [];
  for (const entry of entries ?? []) {
    const last = steps.at(-1);
    // UNKNOWN groups are never merged: they are not known to mean the same thing.
    if (last && last.statusGroup === entry.statusGroup && entry.statusGroup !== "UNKNOWN") {
      // The cancellation step keeps its reason code even if it repeats an earlier group.
      if (entry.reasonCode && !last.reasonCode)
        steps[steps.length - 1] = { ...last, reasonCode: entry.reasonCode };
      continue;
    }
    steps.push(entry);
  }
  return steps;
}

/** An order whose invoices are all settled, or that will have none: no conditions to explain. */
const INVOICES_SETTLED: ReadonlySet<Order["status"]> = new Set([
  "COMPLETED",
  "CLOSED",
  "CANCELLED",
  "RETURNED",
]);

/**
 * When the order's VAT invoices come, shown while it is not completed (kltn-docs 21 §4.1–4.2; WF-05
 * Q-1, HĐ-3): one invoice per successful delivery, issued by the system on the delivery day itself
 * (SePay takes only today's date, so the invoice carries the day it is issued); a failed delivery
 * gets none, and an invoice already issued for it is never cancelled — an adjustment reduces it.
 * Null once the order is completed, closed or cancelled.
 */
export function invoiceConditions(
  order: Pick<Order, "status" | "deliveryState" | "shipments">,
): string[] | null {
  if (INVOICES_SETTLED.has(order.status)) return null;
  const shipments = order.shipments ?? [];
  const delivered =
    order.deliveryState === "DELIVERED" ||
    order.deliveryState === "PARTIALLY_DELIVERED" ||
    shipments.some((shipment) => shipment.status === "DELIVERED");
  const notes = [
    "Mỗi lần giao thành công có một hoá đơn VAT riêng, được phát hành ngay trong ngày giao.",
  ];
  if (!delivered) {
    notes.push("Đơn chưa có lần giao thành công nên chưa có hoá đơn.");
  } else if (
    order.deliveryState === "PARTIALLY_DELIVERED" ||
    shipments.some((shipment) => shipment.status === "HANDED_OVER")
  ) {
    notes.push("Các lần giao còn lại sẽ có hoá đơn riêng khi giao thành công.");
  }
  if (shipments.some((shipment) => shipment.status === "DELIVERY_FAILED")) {
    notes.push(
      "Lần giao không thành công không được xuất hoá đơn; nếu hoá đơn của lần giao đó đã phát hành, chúng tôi sẽ lập hoá đơn điều chỉnh giảm cho nó.",
    );
  }
  return notes;
}

export interface PaymentSummary {
  /** The sums shown, in order: Tổng theo hợp đồng / Đã thanh toán / Còn phải thanh toán, or fewer. */
  rows: readonly ("total" | "paid" | "outstanding")[];
  /** A cancelled order whose installments are all cancelled: what was paid is what the refund is about. */
  cancelledAndSettled: boolean;
}

/**
 * Which sums the payment card shows. When the order is CANCELLED and every installment is cancelled
 * (the BE then sends no `paymentStatus`) the contract total and the amount still due are both 0 and
 * mean nothing: only what the customer paid is shown, beside the refund. A cancellation fee still
 * owed keeps "Còn phải thanh toán" (`outstanding > 0`, or an order whose payment status is known).
 */
export function paymentSummary(
  order: Pick<Order, "status">,
  plan: Pick<OrderInstallments, "paymentStatus" | "outstanding" | "paid">,
): PaymentSummary {
  const allCancelled = order.status === "CANCELLED" && plan.paymentStatus == null;
  if (!allCancelled) return { rows: ["total", "paid", "outstanding"], cancelledAndSettled: false };
  return {
    rows: [
      ...(plan.paid > 0 ? (["paid"] as const) : []),
      ...(plan.outstanding > 0 ? (["outstanding"] as const) : []),
    ],
    cancelledAndSettled: true,
  };
}

/** An installment that can be paid now: owing, and due or overdue (a NOT_DUE one may wait). */
const isDueNow = (installment: Installment) =>
  isPayable(installment) &&
  (installment.overdue || installment.status === "DUE" || installment.status === "PARTIALLY_PAID");

/**
 * The installment the customer should pay next (SF-UX-29): the earliest due-now one, overdue first,
 * then by its number. Null when nothing is due now.
 */
export function nextPayable(
  plan: Pick<OrderInstallments, "installments"> | undefined,
): Installment | null {
  const due = (plan?.installments ?? []).filter(isDueNow);
  due.sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.seq - b.seq);
  return due[0] ?? null;
}

/**
 * Whether the contract's first installment is paid, for the stepper (SF-UX-30); null while no
 * installment is known (no contract signed yet, or not loaded). A cancelled one does not count.
 */
export function firstInstallmentPaid(
  plan: Pick<OrderInstallments, "installments"> | undefined,
): boolean | null {
  const first = [...(plan?.installments ?? [])]
    .filter((installment) => installment.status !== "CANCELLED")
    .sort((a, b) => a.seq - b.seq)[0];
  return first ? first.status === "PAID" : null;
}
