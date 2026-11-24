import { describe, expect, it } from "vitest";

import {
  createMockOrderBook,
  seedMockOrders,
  seededMockOrderId,
  seededMockOrderIndex,
} from "./orders";
import { createMockReturnBook, seedMockReturns } from "./returns";

const CUSTOMER = "c0ffee00-0000-4000-8000-000000000001";
const DELIVERED_ID = seededMockOrderId(seededMockOrderIndex("DELIVERED"));
const RETURNED_ID = seededMockOrderId(seededMockOrderIndex("RETURNED"));

function setup(now: Date) {
  const orders = createMockOrderBook(CUSTOMER, seedMockOrders(CUSTOMER), { now: () => now });
  const orderOf = (id: string) => orders.ownOrder(id);
  const seed = seedMockReturns(CUSTOMER, orderOf, {
    awaiting: DELIVERED_ID,
    resolved: RETURNED_ID,
  });
  const returns = createMockReturnBook(CUSTOMER, orderOf, seed, () => now);
  orders.attachReturnClaims(returns.claimsOf);
  return { orders, returns };
}

const data = (result: { data: unknown }) => (result.data as { data: Record<string, unknown> }).data;
const code = (result: { data: unknown }) => (result.data as { errorCode?: string }).errorCode;

/** The seeded DELIVERED order left in two shipments: S1 brought line 0 ×1 and line 1, S2 line 0 ×1 and line 2. */
function twoShipments(orders: ReturnType<typeof setup>["orders"]) {
  const order = orders.ownOrder(DELIVERED_ID)!;
  const [s1, s2] = order.shipments!;
  const [l0, l1, l2] = order.lines;
  return { order, s1: s1!, s2: s2!, l0: l0!, l1: l1!, l2: l2! };
}

describe("mock returns (BE ReturnRequest.open refusals)", () => {
  it("seeds a waiting and a refunded return on the customer's orders", () => {
    const { returns } = setup(new Date("2026-11-16T00:00:00Z"));
    const page = data(returns.mine());
    expect((page.items as { status: string }[]).map((r) => r.status).sort()).toEqual([
      "AWAITING_RETURN",
      "RESOLVED",
    ]);
  });

  it("refuses a return once the 7-day window has closed", () => {
    const { returns, orders } = setup(new Date("2026-11-16T00:00:00Z"));
    const { s2, l2 } = twoShipments(orders);
    const result = returns.open(DELIVERED_ID, {
      requestId: "r-1",
      reasonCode: "PRINT_DEFECT",
      shipmentId: s2.shipmentId,
      lines: [{ orderLineId: l2.lineId, quantity: 1 }],
    });
    expect(result.status).toBe(409);
    expect(code(result)).toBe("RETURN_WINDOW_CLOSED");
  });

  it("opens inside the window, idempotently, and refuses a line already open on that delivery", () => {
    const { returns, orders } = setup(new Date("2026-10-03T00:00:00Z"));
    const { s1, l0, l1 } = twoShipments(orders);
    const body = {
      requestId: "r-2",
      reasonCode: "DAMAGED_IN_TRANSIT",
      shipmentId: s1.shipmentId,
      lines: [{ orderLineId: l0.lineId, quantity: 1 }],
    };
    // The seeded AWAITING_RETURN return already holds the first line on the first delivery.
    expect(code(returns.open(DELIVERED_ID, body))).toBe("RETURN_LINE_ALREADY_OPEN");

    const free = { ...body, lines: [{ orderLineId: l1.lineId, quantity: 1 }] };
    const opened = returns.open(DELIVERED_ID, free);
    expect(opened.status).toBe(201);
    expect(data(opened).shipmentId).toBe(s1.shipmentId);
    expect(data(returns.open(DELIVERED_ID, free)).id).toBe(data(opened).id);
  });

  it("takes a return per delivery: named, delivered, and within what that delivery brought (TH-1)", () => {
    const { returns, orders } = setup(new Date("2026-10-03T00:00:00Z"));
    const { s2, l0, l1 } = twoShipments(orders);
    const open = (requestId: string, over: Record<string, unknown>) =>
      returns.open(DELIVERED_ID, { requestId, reasonCode: "WRONG_ITEM", ...over });
    expect(code(open("a", { lines: [{ orderLineId: l0.lineId, quantity: 1 }] }))).toBe(
      "RETURN_SHIPMENT_REQUIRED",
    );
    expect(
      code(
        open("b", {
          shipmentId: "5b1d0e00-0000-4000-8000-0000000000ff",
          lines: [{ orderLineId: l0.lineId, quantity: 1 }],
        }),
      ),
    ).toBe("RETURN_SHIPMENT_NOT_DELIVERED");
    const onS2 = (requestId: string, orderLineId: string, quantity: number) =>
      open(requestId, { shipmentId: s2.shipmentId, lines: [{ orderLineId, quantity }] });
    // S2 brought one of line 0 and none of line 1.
    expect(code(onS2("c", l0.lineId, 2))).toBe("RETURN_QUANTITY_EXCEEDED");
    expect(code(onS2("d", l1.lineId, 1))).toBe("RETURN_QUANTITY_EXCEEDED");
    // The open return of line 0 is on S1: it does not block S2.
    expect(onS2("e", l0.lineId, 1).status).toBe(201);
  });

  it("refuses OTHER without a description and a short delivery", () => {
    const { returns, orders } = setup(new Date("2026-10-03T00:00:00Z"));
    const { s2, l2 } = twoShipments(orders);
    const base = { shipmentId: s2.shipmentId, lines: [{ orderLineId: l2.lineId, quantity: 1 }] };
    expect(code(returns.open(DELIVERED_ID, { ...base, requestId: "a", reasonCode: "OTHER" }))).toBe(
      "VALIDATION_FAILED",
    );
    expect(
      code(returns.open(DELIVERED_ID, { ...base, requestId: "b", reasonCode: "SHORT_DELIVERY" })),
    ).toBe("RETURN_REASON_NOT_ACCEPTED");
  });

  it("withdraws a waiting return, not a refunded one", () => {
    const { returns } = setup(new Date("2026-11-16T00:00:00Z"));
    const rows = data(returns.mine()).items as { id: string; status: string }[];
    const waiting = rows.find((r) => r.status === "AWAITING_RETURN")!;
    const done = rows.find((r) => r.status === "RESOLVED")!;
    expect(data(returns.cancel(waiting.id)).status).toBe("CANCELLED");
    expect(code(returns.cancel(done.id))).toBe("RETURN_INVALID_TRANSITION");
  });

  it("keeps a return whose goods are partly back (WF-05 TH-3)", () => {
    const { returns } = setup(new Date("2026-11-16T00:00:00Z"));
    const rows = data(returns.mine()).items as { id: string; status: string }[];
    const waiting = rows.find((r) => r.status === "AWAITING_RETURN")!;
    returns.receiveParcel(waiting.id);
    const result = returns.cancel(waiting.id);
    expect(result.status).toBe(409);
    expect(code(result)).toBe("RETURN_GOODS_PARTLY_RECEIVED");
    const detail = data(returns.one(waiting.id));
    expect(detail.status).toBe("AWAITING_RETURN");
    expect(detail.receivedAt).toBeTruthy();
  });

  it("says receiptDraftOpen while the warehouse counts a parcel, and refuses the withdrawal (BE-23)", () => {
    const { returns } = setup(new Date("2026-11-16T00:00:00Z"));
    const rows = data(returns.mine()).items as { id: string; status: string }[];
    const waiting = rows.find((r) => r.status === "AWAITING_RETURN")!;
    expect(data(returns.one(waiting.id)).receiptDraftOpen).toBe(false);
    returns.countParcel(waiting.id);
    expect(data(returns.one(waiting.id)).receiptDraftOpen).toBe(true);
    const row = (data(returns.mine()).items as { id: string; receiptDraftOpen: boolean }[]).find(
      (r) => r.id === waiting.id,
    );
    expect(row?.receiptDraftOpen).toBe(true);
    expect(code(returns.cancel(waiting.id))).toBe("RETURN_RECEIPT_DRAFT_OPEN");
  });
});

describe("mock order shipments (BE CustomerOrderShipment.lines, WF-05 TH-1)", () => {
  type Shipment = {
    shipmentId: string;
    lines: { orderLineId: string; quantity: number; returnableQuantity: number }[];
  };
  const shipmentsOf = (orders: ReturnType<typeof setup>["orders"]) =>
    data(orders.get(DELIVERED_ID)).shipments as Shipment[];
  const returnable = (shipment: Shipment) =>
    shipment.lines.map((line) => [line.quantity, line.returnableQuantity]);

  it("says what each delivery brought and what a return may still claim of it", () => {
    const { orders } = setup(new Date("2026-10-03T00:00:00Z"));
    const [s1, s2] = shipmentsOf(orders);
    // S1: line 0 has an open return on it (0), line 1 is free; S2: line 0 has one unit left.
    expect(returnable(s1!)).toEqual([
      [1, 0],
      [1, 1],
    ]);
    expect(returnable(s2!)).toEqual([
      [1, 1],
      [2, 2],
    ]);
  });

  it("claims nothing once the window has closed", () => {
    const { orders } = setup(new Date("2026-11-16T00:00:00Z"));
    for (const shipment of shipmentsOf(orders)) {
      expect(shipment.lines.every((line) => line.returnableQuantity === 0)).toBe(true);
    }
  });
});
