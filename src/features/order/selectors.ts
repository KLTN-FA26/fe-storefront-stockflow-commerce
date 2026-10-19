import type { Order, OrderTimelineEntry } from "./types";

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
 * What is still to be paid on an order awaiting money. `undefined` when it does not apply: a
 * credit order is paid after delivery, a paid order owes nothing, and without a payment record
 * (or a status newer than this FE) there is nothing to compute from.
 *
 * A closed order owes nothing either: cancelling releases the stock but does not settle payment
 * (BE OrderServiceImpl.cancelLoaded), so a CANCELLED order still reads UNPAID and the total would
 * be shown as due; COMPLETED is closed and RETURNED is refunded outside this order.
 */
const CLOSED: ReadonlySet<Order["status"]> = new Set(["CANCELLED", "COMPLETED", "RETURNED"]);

export function amountDue(order: Pick<Order, "total" | "payment" | "status">): number | undefined {
  const payment = order.payment;
  if (CLOSED.has(order.status)) return undefined;
  if (!payment || (payment.status !== "UNPAID" && payment.status !== "PARTIALLY_PAID")) {
    return undefined;
  }
  return Math.max(order.total - (payment.paidAmount ?? 0), 0);
}
