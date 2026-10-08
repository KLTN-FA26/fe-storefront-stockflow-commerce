import { describe, it, expect } from "vitest";
import { isOrderCancellable } from "../lifecycle";

/**
 * BR-031: Customer self-cancellation is allowed only before "Shipped".
 * From "Shipped" onward the order is in the carrier's hands.
 * Source: scrum-242/245 — "khách tự huỷ chỉ khi đơn chưa rời kho".
 */
describe("isOrderCancellable", () => {
  it("returns true for cancellable pre-fulfillment statuses", () => {
    const cancellableStatuses = [
      "Draft",
      "Pending Payment",
      "Payment Failed",
      "Confirmed",
      "In Production",
      "On Hold",
      "Ready to Fulfill",
      "Picking",
      "Partially Fulfilled",
      "Packed",
    ] as const;

    for (const status of cancellableStatuses) {
      expect(isOrderCancellable(status)).toBe(true);
    }
  });

  it("returns false for non-cancellable statuses (BR-031)", () => {
    const nonCancellableStatuses = [
      "Shipped",
      "In Transit",
      "Delivery Failed",
      "Delivered",
      "Return Requested",
      "Returned",
      "Refunded",
      "Partially Refunded",
      "Completed",
      "Cancelled",
      "Closed",
    ] as const;

    for (const status of nonCancellableStatuses) {
      expect(isOrderCancellable(status)).toBe(false);
    }
  });

  it("is false specifically for Shipped (BR-031 boundary)", () => {
    expect(isOrderCancellable("Shipped")).toBe(false);
  });

  it("is true specifically for Ready to Fulfill (last cancellable status)", () => {
    expect(isOrderCancellable("Ready to Fulfill")).toBe(true);
  });
});
