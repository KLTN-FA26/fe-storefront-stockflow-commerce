import { describe, expect, it } from "vitest";

import {
  allowedCancellation,
  displayGroup,
  isCancellationRequestable,
  isOrderCancellable,
  isOrderTerminal,
  ORDER_DISPLAY_META,
  ORDER_STATUS_GROUP_META,
  orderProgress,
} from "../lifecycle";
import { ORDER_STATUS_GROUPS, ORDER_STATUSES } from "../schemas";

const states = (group: Parameters<typeof orderProgress>[0], paid: boolean | null) =>
  orderProgress(group, paid)!.map((step) => step.state);
const currentStep = (group: Parameters<typeof orderProgress>[0], paid: boolean | null) =>
  orderProgress(group, paid)!.find((step) => step.state === "current")?.id;

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
    // CustomerOrders.StatusGroup: AWAITING_CONTRACT and AWAITING_STOCK came with the rescope,
    // RETURN_REQUESTED with BE #380, PARTIALLY_RETURNED with WF-05 F-2 (BE-35).
    expect(ORDER_STATUS_GROUPS).toHaveLength(13);
    expect(Object.keys(ORDER_STATUS_GROUP_META).sort()).toEqual(
      [...ORDER_STATUS_GROUPS, "UNKNOWN"].sort(),
    );
  });

  it("treats a status unknown to the FE as in progress: not cancellable, not terminal, no stepper", () => {
    expect(ORDER_STATUS_GROUP_META.UNKNOWN).toMatchObject({ label: "Đang xử lý", tone: "info" });
    expect(isOrderCancellable("UNKNOWN")).toBe(false);
    expect(isOrderTerminal("UNKNOWN")).toBe(false);
    expect(orderProgress("UNKNOWN", null)).toBeNull();
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

  it("places the new groups on the stepper: awaiting the contract first, awaiting stock in production", () => {
    expect(currentStep("AWAITING_CONTRACT", null)).toBe("contract");
    expect(currentStep("AWAITING_STOCK", true)).toBe("production");
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

  // BE #380: a return being decided is its own group, between DELIVERED and CANCELLED, and not
  // RETURNED (whose tone is special): the goods are still with the customer.
  it("reads RETURN_REQUESTED as a return being decided, not as goods already returned", () => {
    expect(ORDER_STATUS_GROUPS.indexOf("RETURN_REQUESTED")).toBe(
      ORDER_STATUS_GROUPS.indexOf("DELIVERED") + 1,
    );
    expect(ORDER_STATUS_GROUPS.indexOf("CANCELLED")).toBe(
      ORDER_STATUS_GROUPS.indexOf("RETURN_REQUESTED") + 1,
    );
    expect(ORDER_STATUS_GROUP_META.RETURN_REQUESTED).toMatchObject({
      label: "Đang yêu cầu trả hàng",
      tone: "warning",
    });
    expect(ORDER_STATUS_GROUP_META.RETURN_REQUESTED.tone).not.toBe(
      ORDER_STATUS_GROUP_META.RETURNED.tone,
    );
    // The goods reached the customer: only "Hoàn tất" is left.
    expect(currentStep("RETURN_REQUESTED", true)).toBe("done");
  });

  // BE CustomerOrders folds COMPLETED into DELIVERED; the badge and hero still say it is done (A9).
  it("shows a COMPLETED order as Hoàn tất, every other order by its group", () => {
    expect(displayGroup({ status: "COMPLETED", statusGroup: "DELIVERED" })).toBe("COMPLETED");
    expect(ORDER_DISPLAY_META.COMPLETED).toMatchObject({ label: "Hoàn tất", tone: "positive" });
    expect(orderProgress("COMPLETED", null)!.every((step) => step.state === "done")).toBe(true);
    expect(displayGroup({ status: "DELIVERED", statusGroup: "DELIVERED" })).toBe("DELIVERED");
    expect(displayGroup({ status: "RETURN_REQUESTED", statusGroup: "RETURN_REQUESTED" })).toBe(
      "RETURN_REQUESTED",
    );
    expect(displayGroup({ status: "UNKNOWN", statusGroup: "UNKNOWN" })).toBe("UNKNOWN");
    for (const group of [...ORDER_STATUS_GROUPS, "UNKNOWN"] as const) {
      expect(ORDER_DISPLAY_META[group]).toBe(ORDER_STATUS_GROUP_META[group]);
    }
  });

  // SF-02: the BE folds CLOSED-after-completion into DELIVERED too; read alone it would say again
  // "Đơn hoàn tất khi hết hạn đổi trả".
  it("shows an order closed after completion as closed, not as waiting to complete", () => {
    expect(displayGroup({ status: "CLOSED", statusGroup: "DELIVERED" })).toBe("CLOSED");
    expect(ORDER_DISPLAY_META.CLOSED).toMatchObject({ label: "Đã đóng", tone: "muted" });
    expect(ORDER_DISPLAY_META.CLOSED.hint).not.toMatch(/hoàn tất khi/);
    expect(ORDER_DISPLAY_META.CLOSED.hint).toMatch(/đã đóng/);
    expect(orderProgress("CLOSED", null)!.every((step) => step.state === "done")).toBe(true);
    // A CLOSED order of the refund branch keeps what happened to its goods.
    expect(displayGroup({ status: "CLOSED", statusGroup: "RETURNED" })).toBe("RETURNED");
    expect(displayGroup({ status: "CLOSED", statusGroup: "PARTIALLY_RETURNED" })).toBe(
      "PARTIALLY_RETURNED",
    );
    // A group newer than the FE stays neutral, closed or not.
    expect(displayGroup({ status: "CLOSED", statusGroup: "UNKNOWN" })).toBe("UNKNOWN");
  });

  // WF-05 F-2 (BE-35): one shipment brought back by the carrier, the rest kept.
  it("never calls an order whose customer kept a delivered part 'Đã trả hàng'", () => {
    const partly = ORDER_STATUS_GROUP_META.PARTIALLY_RETURNED;
    expect(partly.label).not.toBe(ORDER_STATUS_GROUP_META.RETURNED.label);
    expect(partly.label).not.toMatch(/trả hàng/i);
    expect(partly.hint).toMatch(/giữ một phần hàng/);
    expect(partly.hint).toMatch(/đơn vị vận chuyển hoàn về/);
    expect(displayGroup({ status: "PARTIALLY_REFUNDED", statusGroup: "PARTIALLY_RETURNED" })).toBe(
      "PARTIALLY_RETURNED",
    );
    expect(orderProgress("PARTIALLY_RETURNED", true)).toBeNull();
  });

  // G1: also a partly fulfilled order whose deliveries are over, some shipments back or lost.
  it("reads a partly fulfilled order the carrier finished in part as kept in part, lost included", () => {
    expect(displayGroup({ status: "PARTIALLY_FULFILLED", statusGroup: "PARTIALLY_RETURNED" })).toBe(
      "PARTIALLY_RETURNED",
    );
    const partly = ORDER_STATUS_GROUP_META.PARTIALLY_RETURNED;
    expect(partly.hint).toMatch(/thất lạc/);
    expect(partly.hint).not.toMatch(/phần còn lại đã về lại kho/);
  });

  it("runs contract → first installment → production → delivery → done (SF-UX-30)", () => {
    expect(orderProgress("AWAITING_CONTRACT", null)!.map((step) => step.label)).toEqual([
      "Hợp đồng",
      "Thanh toán đợt đầu",
      "Sản xuất",
      "Giao hàng",
      "Hoàn tất",
    ]);
    expect(states("AWAITING_CONTRACT", null)).toEqual(["current", "todo", "todo", "todo", "todo"]);
    expect(states("AWAITING_PAYMENT", false)).toEqual(["done", "current", "todo", "todo", "todo"]);
    expect(states("SHIPPING", true)).toEqual(["done", "done", "done", "current", "todo"]);
    expect(orderProgress("CANCELLED", true)).toBeNull();
    expect(orderProgress("RETURNED", true)).toBeNull();
  });

  it("never ticks the payment step while the first installment is owed or unknown", () => {
    // Nothing due at signing: production runs while installment 1 is still owed.
    expect(states("IN_PRODUCTION", false)).toEqual(["done", "owed", "current", "todo", "todo"]);
    expect(states("IN_PRODUCTION", null)).toEqual(["done", "owed", "current", "todo", "todo"]);
    const paid = orderProgress("IN_PRODUCTION", true)!;
    expect(paid[1]).toEqual({ id: "firstPayment", label: "Đã trả đợt 1", state: "done" });
    expect(currentStep("UNDER_REVIEW", false)).toBe("firstPayment");
    expect(currentStep("UNDER_REVIEW", true)).toBe("production");
  });
});
