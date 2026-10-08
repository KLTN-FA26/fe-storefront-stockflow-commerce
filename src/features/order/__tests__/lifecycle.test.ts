import { describe, expect, it } from "vitest";

import {
  isOrderCancellable,
  isOrderTerminal,
  ORDER_STATUS_META,
  orderProgressOf,
} from "../lifecycle";
import { ORDER_STATUSES } from "../schemas";

describe("order lifecycle mirrors BE OrderStatus", () => {
  it("covers all 10 BE statuses, including ON_HOLD", () => {
    expect(ORDER_STATUSES).toHaveLength(10);
    expect(ORDER_STATUSES).toContain("ON_HOLD");
    expect(Object.keys(ORDER_STATUS_META).sort()).toEqual([...ORDER_STATUSES].sort());
  });

  // BR-031 + OrderStatus#canTransitionTo(CANCELLED)
  it("allows cancellation from exactly DRAFT, PENDING_PAYMENT, PAID, IN_FULFILMENT, ON_HOLD", () => {
    expect(ORDER_STATUSES.filter(isOrderCancellable)).toEqual([
      "DRAFT",
      "PENDING_PAYMENT",
      "PAID",
      "IN_FULFILMENT",
      "ON_HOLD",
    ]);
  });

  it.each(["SHIPPED", "DELIVERED", "COMPLETED", "CANCELLED", "RETURNED"] as const)(
    "refuses cancellation from %s (BR-031: raise a return instead)",
    (status) => expect(isOrderCancellable(status)).toBe(false),
  );

  it("treats COMPLETED, CANCELLED, RETURNED as terminal", () => {
    expect(ORDER_STATUSES.filter(isOrderTerminal)).toEqual(["COMPLETED", "CANCELLED", "RETURNED"]);
  });

  it("gives every status a Vietnamese label and a semantic tone", () => {
    expect(ORDER_STATUS_META.CANCELLED).toMatchObject({ label: "Đã huỷ", tone: "danger" });
    expect(ORDER_STATUS_META.RETURNED.tone).toBe("special");
    expect(ORDER_STATUS_META.ON_HOLD.tone).toBe("warning");
    for (const status of ORDER_STATUSES) {
      expect(ORDER_STATUS_META[status].label).not.toBe(status);
      expect(ORDER_STATUS_META[status].hint.length).toBeGreaterThan(0);
    }
  });

  it("derives progress from the status alone and leaves the happy path when cancelled/returned", () => {
    expect(orderProgressOf("PENDING_PAYMENT")).toBe(1);
    expect(orderProgressOf("SHIPPED")).toBe(3);
    expect(orderProgressOf("DELIVERED")).toBe(5);
    expect(orderProgressOf("COMPLETED")).toBe(5);
    expect(orderProgressOf("CANCELLED")).toBeNull();
    expect(orderProgressOf("RETURNED")).toBeNull();
  });
});
