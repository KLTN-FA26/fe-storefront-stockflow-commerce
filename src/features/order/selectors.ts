import type { OrderInstallments } from "@/lib/installments";

import type { DeliveryMode, Order, OrderTimelineEntry } from "./types";

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

/**
 * The delivery modes the coordinator chose. The order-level mode wins when the BE sends it; else
 * the shipments' modes, once each, in shipment order (an older BE, or an order the BE has no mode
 * for). Empty when neither carries one: the page then says the order is awaiting coordination.
 */
export function deliveryModes(order: Pick<Order, "shipments" | "deliveryMode">): DeliveryMode[] {
  if (order.deliveryMode) return [order.deliveryMode];
  const modes: DeliveryMode[] = [];
  for (const shipment of order.shipments ?? []) {
    if (shipment.deliveryMode && !modes.includes(shipment.deliveryMode)) {
      modes.push(shipment.deliveryMode);
    }
  }
  return modes;
}

/** An order whose invoices are all settled, or that will have none: no conditions to explain. */
const INVOICES_SETTLED: ReadonlySet<Order["status"]> = new Set([
  "COMPLETED",
  "CLOSED",
  "CANCELLED",
  "RETURNED",
]);

/**
 * When the order's VAT invoices come, shown while it is not completed (kltn-docs 21 §4.1–4.2; BE
 * `IssueDeadline`, WF-05 HĐ-3): one invoice per successful delivery, dated the delivery day and
 * issued by the end of the next working day; a failed delivery gets none, and an invoice already
 * issued for it is reduced in full or voided. Null once the order is completed, closed or cancelled.
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
    "Hoá đơn VAT được lập cho từng lần giao thành công, ghi ngày giao, và phát hành chậm nhất vào ngày làm việc tiếp theo.",
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
      "Lần giao không thành công không được xuất hoá đơn; hoá đơn đã phát hành cho lần giao đó sẽ được điều chỉnh giảm hoặc huỷ.",
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
  plan: Pick<OrderInstallments, "paymentStatus" | "outstanding">,
): PaymentSummary {
  const allCancelled = order.status === "CANCELLED" && plan.paymentStatus == null;
  if (!allCancelled) return { rows: ["total", "paid", "outstanding"], cancelledAndSettled: false };
  return {
    rows: plan.outstanding > 0 ? ["paid", "outstanding"] : ["paid"],
    cancelledAndSettled: true,
  };
}
