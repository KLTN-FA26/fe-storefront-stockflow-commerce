import { describe, expect, it } from "vitest";

import { amountDue, customerTimeline } from "../selectors";
import type { Order, OrderTimelineEntry } from "../types";

const at = (hour: number) => `2026-10-07T0${hour}:00:00Z`;
const entry = (
  status: OrderTimelineEntry["status"],
  statusGroup: OrderTimelineEntry["statusGroup"],
  hour: number,
  reasonCode?: OrderTimelineEntry["reasonCode"],
): OrderTimelineEntry => ({
  status,
  statusGroup,
  occurredAt: at(hour),
  ...(reasonCode ? { reasonCode } : {}),
});

describe("customerTimeline", () => {
  it("keeps the BE order (oldest first) and one step per customer-facing group", () => {
    const steps = customerTimeline([
      entry("PENDING_PAYMENT", "AWAITING_PAYMENT", 1),
      entry("CONFIRMED", "CONFIRMED", 2),
      entry("READY_TO_FULFILL", "PREPARING", 3),
      entry("IN_FULFILMENT", "PREPARING", 4),
      entry("SHIPPED", "SHIPPING", 5),
    ]);
    expect(steps.map((s) => s.statusGroup)).toEqual([
      "AWAITING_PAYMENT",
      "CONFIRMED",
      "PREPARING",
      "SHIPPING",
    ]);
    // The step shows when the group was entered, not when it last changed.
    expect(steps[2]?.occurredAt).toBe(at(3));
  });

  it("never merges UNKNOWN groups: they are not known to mean the same thing", () => {
    const steps = customerTimeline([
      entry("UNKNOWN", "UNKNOWN", 1),
      entry("UNKNOWN", "UNKNOWN", 2),
    ]);
    expect(steps).toHaveLength(2);
  });

  it("keeps a group that comes back later (ON_HOLD, released, ON_HOLD again)", () => {
    const steps = customerTimeline([
      entry("CONFIRMED", "CONFIRMED", 1),
      entry("ON_HOLD", "UNDER_REVIEW", 2),
      entry("CONFIRMED", "CONFIRMED", 3),
    ]);
    expect(steps.map((s) => s.statusGroup)).toEqual(["CONFIRMED", "UNDER_REVIEW", "CONFIRMED"]);
  });

  it("keeps the reason code of the cancellation step", () => {
    const [step] = customerTimeline([entry("CANCELLED", "CANCELLED", 1, "OUT_OF_STOCK")]);
    expect(step?.reasonCode).toBe("OUT_OF_STOCK");
  });

  it("is empty without a timeline (NON_NULL omits it)", () => {
    expect(customerTimeline(undefined)).toEqual([]);
    expect(customerTimeline(null)).toEqual([]);
  });
});

describe("amountDue", () => {
  const order = (
    payment: Order["payment"],
    status: Order["status"] = "CONFIRMED",
    total = 1000,
  ): Pick<Order, "total" | "payment" | "status"> => ({ total, payment, status });

  it("is what is left on an unpaid or partly paid order", () => {
    expect(amountDue(order({ status: "UNPAID", paidAmount: 0 }))).toBe(1000);
    expect(amountDue(order({ status: "PARTIALLY_PAID", paidAmount: 300 }))).toBe(700);
    expect(amountDue(order({ status: "UNPAID" }))).toBe(1000);
  });

  it("does not apply to a paid order, a credit order, or one without a payment record", () => {
    expect(amountDue(order({ status: "PAID", paidAmount: 1000 }))).toBeUndefined();
    expect(
      amountDue(order({ status: "ON_CREDIT", paidAmount: 0, creditTermDays: 30 })),
    ).toBeUndefined();
    expect(amountDue(order({ status: "UNKNOWN" }))).toBeUndefined();
    expect(amountDue(order(undefined))).toBeUndefined();
  });

  // BE cancelLoaded releases the stock but does not settle payment: a cancelled order still reads UNPAID.
  it.each(["CANCELLED", "COMPLETED", "RETURNED"] as const)(
    "owes nothing on a %s order, whatever its payment says",
    (status) => {
      expect(amountDue(order({ status: "UNPAID", paidAmount: 0 }, status))).toBeUndefined();
      expect(
        amountDue(order({ status: "PARTIALLY_PAID", paidAmount: 300 }, status)),
      ).toBeUndefined();
    },
  );

  it("still shows what is due while the order is open, even delivered", () => {
    for (const status of ["PENDING_PAYMENT", "ON_HOLD", "IN_PRODUCTION", "DELIVERED"] as const) {
      expect(amountDue(order({ status: "PARTIALLY_PAID", paidAmount: 300 }, status))).toBe(700);
    }
  });

  it("is never negative", () => {
    expect(amountDue(order({ status: "PARTIALLY_PAID", paidAmount: 1500 }))).toBe(0);
  });
});
