import { describe, expect, it } from "vitest";

import {
  allowedCancellation,
  isCancellationRequestable,
  isOrderCancellable,
  isOrderTerminal,
  ORDER_STATUS_GROUP_META,
  orderProgressOf,
} from "../lifecycle";
import { ORDER_STATUS_GROUPS, ORDER_STATUSES } from "../schemas";

describe("order lifecycle mirrors BE OrderStatus / CustomerOrders.StatusGroup", () => {
  it("covers the 21 BE statuses after the 4B rescope, plus the legacy IN_FULFILMENT", () => {
    expect(ORDER_STATUSES).toHaveLength(22);
    for (const status of [
      "PENDING_CONTRACT",
      "AWAITING_STOCK",
      "PICKING",
      "PARTIALLY_FULFILLED",
      "PACKED",
      "DELIVERY_FAILED",
      "RETURN_REQUESTED",
      "REFUNDED",
      "PARTIALLY_REFUNDED",
      "CLOSED",
    ] as const) {
      expect(ORDER_STATUSES).toContain(status);
    }
  });

  it("has wording for every status group the BE sends, plus UNKNOWN", () => {
    // CustomerOrders.StatusGroup: AWAITING_CONTRACT and AWAITING_STOCK came with the rescope.
    expect(ORDER_STATUS_GROUPS).toHaveLength(11);
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

  // BE OrderStatus#customerMayCancelDirectly: false for every status since the 4B rescope.
  it("never offers a direct cancellation: an order runs under a signed contract", () => {
    expect(ORDER_STATUSES.filter(isOrderCancellable)).toEqual([]);
  });

  // BE OrderStatus#canTransitionTo(CANCELLED): the customer asks Sales (202).
  it("offers a cancellation request exactly where the BE may still cancel", () => {
    expect(ORDER_STATUSES.filter(isCancellationRequestable)).toEqual([
      "PENDING_CONTRACT",
      "PENDING_PAYMENT",
      "CONFIRMED",
      "AWAITING_STOCK",
      "IN_PRODUCTION",
      "READY_TO_FULFILL",
      "PICKING",
      "ON_HOLD",
    ]);
  });

  it("lets the BE's allowedActions decide over the status when it sends them (G3-2)", () => {
    expect(allowedCancellation("CONFIRMED", { cancel: false, requestCancellation: true })).toBe(
      "request",
    );
    expect(allowedCancellation("SHIPPED", { cancel: true, requestCancellation: false })).toBe(
      "cancel",
    );
    expect(allowedCancellation("CONFIRMED", { cancel: false, requestCancellation: false })).toBe(
      null,
    );
    // An older BE without them: the status decides.
    expect(allowedCancellation("PICKING", undefined)).toBe("request");
    expect(allowedCancellation("PACKED", null)).toBe(null);
  });

  it("never offers both: direct cancel and request are different answers of the BE", () => {
    for (const status of ORDER_STATUSES) {
      expect(isOrderCancellable(status) && isCancellationRequestable(status)).toBe(false);
    }
    expect(isCancellationRequestable("UNKNOWN")).toBe(false);
  });

  it("offers neither from SHIPPED on: that is a return, not a cancellation (BR-031)", () => {
    for (const status of [
      "PACKED",
      "SHIPPED",
      "DELIVERY_FAILED",
      "DELIVERED",
      "COMPLETED",
      "CANCELLED",
      "RETURNED",
      "CLOSED",
    ] as const) {
      expect(isOrderCancellable(status) || isCancellationRequestable(status)).toBe(false);
    }
  });

  it("treats completed, closed, cancelled, returned and refunded orders as ended", () => {
    expect(ORDER_STATUSES.filter(isOrderTerminal)).toEqual([
      "RETURNED",
      "REFUNDED",
      "PARTIALLY_REFUNDED",
      "COMPLETED",
      "CANCELLED",
      "CLOSED",
    ]);
  });

  it("places the new groups on the stepper: awaiting the contract after the order, awaiting stock after payment", () => {
    expect(orderProgressOf("AWAITING_CONTRACT")).toBe(1);
    expect(orderProgressOf("AWAITING_STOCK")).toBe(2);
    expect(ORDER_STATUS_GROUP_META.AWAITING_CONTRACT.label).toBe("Chờ ký hợp đồng");
    expect(ORDER_STATUS_GROUP_META.AWAITING_STOCK.label).toBe("Đang chờ hàng");
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
