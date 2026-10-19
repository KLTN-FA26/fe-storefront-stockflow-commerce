import { describe, expect, it } from "vitest";

import {
  isCancellationRequestable,
  isOrderCancellable,
  isOrderTerminal,
  ORDER_STATUS_GROUP_META,
  orderProgressOf,
} from "../lifecycle";
import { ORDER_STATUS_GROUPS, ORDER_STATUSES } from "../schemas";

describe("order lifecycle mirrors BE OrderStatus / CustomerOrders.StatusGroup", () => {
  it("covers all 12 BE statuses, including ON_HOLD and the CONFIRMED / IN_PRODUCTION / READY_TO_FULFILL steps", () => {
    expect(ORDER_STATUSES).toHaveLength(12);
    for (const status of ["ON_HOLD", "CONFIRMED", "IN_PRODUCTION", "READY_TO_FULFILL"] as const) {
      expect(ORDER_STATUSES).toContain(status);
    }
  });

  it("has wording for every status group the BE sends, plus UNKNOWN", () => {
    expect(ORDER_STATUS_GROUPS).toHaveLength(9);
    expect(Object.keys(ORDER_STATUS_GROUP_META).sort()).toEqual(
      [...ORDER_STATUS_GROUPS, "UNKNOWN"].sort(),
    );
  });

  it("treats a status unknown to the FE as in progress: not cancellable, not terminal, no stepper", () => {
    expect(ORDER_STATUS_GROUP_META.UNKNOWN).toMatchObject({ label: "Đang xử lý", tone: "info" });
    expect(isOrderCancellable("UNKNOWN")).toBe(false);
    expect(isOrderTerminal("UNKNOWN")).toBe(false);
    expect(orderProgressOf("UNKNOWN")).toBeNull();
  });

  // BE OrderStatus#customerMayCancelDirectly
  it("offers cancellation from exactly DRAFT, PENDING_PAYMENT, CONFIRMED", () => {
    expect(ORDER_STATUSES.filter(isOrderCancellable)).toEqual([
      "DRAFT",
      "PENDING_PAYMENT",
      "CONFIRMED",
    ]);
  });

  it.each([
    "IN_PRODUCTION",
    "IN_FULFILMENT",
    "ON_HOLD",
    "SHIPPED",
    "DELIVERED",
    "RETURNED",
  ] as const)(
    "does not offer cancellation from %s (released, shipped or closed: ask support)",
    (status) => expect(isOrderCancellable(status)).toBe(false),
  );

  // BE OrderStatus#canTransitionTo(CANCELLED) minus customerMayCancelDirectly: the customer asks (202).
  it("offers a cancellation request from exactly IN_PRODUCTION, READY_TO_FULFILL, IN_FULFILMENT, ON_HOLD", () => {
    expect(ORDER_STATUSES.filter(isCancellationRequestable)).toEqual([
      "IN_PRODUCTION",
      "READY_TO_FULFILL",
      "IN_FULFILMENT",
      "ON_HOLD",
    ]);
  });

  it("never offers both: direct cancel and request are different answers of the BE", () => {
    for (const status of ORDER_STATUSES) {
      expect(isOrderCancellable(status) && isCancellationRequestable(status)).toBe(false);
    }
    expect(isCancellationRequestable("UNKNOWN")).toBe(false);
  });

  it("offers neither from SHIPPED on: that is a return, not a cancellation (BR-031)", () => {
    for (const status of ["SHIPPED", "DELIVERED", "COMPLETED", "CANCELLED", "RETURNED"] as const) {
      expect(isOrderCancellable(status) || isCancellationRequestable(status)).toBe(false);
    }
  });

  it("treats COMPLETED, CANCELLED, RETURNED as terminal", () => {
    expect(ORDER_STATUSES.filter(isOrderTerminal)).toEqual(["COMPLETED", "CANCELLED", "RETURNED"]);
  });

  it("gives every group a Vietnamese label, a semantic tone and a hint", () => {
    expect(ORDER_STATUS_GROUP_META.CANCELLED).toMatchObject({ label: "Đã huỷ", tone: "danger" });
    expect(ORDER_STATUS_GROUP_META.RETURNED.tone).toBe("special");
    expect(ORDER_STATUS_GROUP_META.UNDER_REVIEW.tone).toBe("warning");
    for (const group of ORDER_STATUS_GROUPS) {
      expect(ORDER_STATUS_GROUP_META[group].label).not.toBe(group);
      expect(ORDER_STATUS_GROUP_META[group].hint.length).toBeGreaterThan(0);
    }
  });

  it("derives progress from the group alone and leaves the happy path when cancelled/returned", () => {
    expect(orderProgressOf("AWAITING_PAYMENT")).toBe(1);
    expect(orderProgressOf("SHIPPING")).toBe(3);
    expect(orderProgressOf("DELIVERED")).toBe(5);
    expect(orderProgressOf("CANCELLED")).toBeNull();
    expect(orderProgressOf("RETURNED")).toBeNull();
  });
});
