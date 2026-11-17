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
  const orders = createMockOrderBook(CUSTOMER, seedMockOrders(CUSTOMER));
  const orderOf = (id: string) => orders.ownOrder(id);
  const seed = seedMockReturns(CUSTOMER, orderOf, {
    awaiting: DELIVERED_ID,
    resolved: RETURNED_ID,
  });
  return { orders, returns: createMockReturnBook(CUSTOMER, orderOf, seed, () => now) };
}

const data = (result: { data: unknown }) => (result.data as { data: Record<string, unknown> }).data;
const code = (result: { data: unknown }) => (result.data as { errorCode?: string }).errorCode;

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
    const line = orders.ownOrder(DELIVERED_ID)!.lines.at(-1)!;
    const result = returns.open(DELIVERED_ID, {
      requestId: "r-1",
      reasonCode: "PRINT_DEFECT",
      lines: [{ orderLineId: line.lineId, quantity: 1 }],
    });
    expect(result.status).toBe(409);
    expect(code(result)).toBe("RETURN_WINDOW_CLOSED");
  });

  it("opens inside the window, idempotently, and refuses a line already open", () => {
    const { returns, orders } = setup(new Date("2026-10-03T00:00:00Z"));
    const order = orders.ownOrder(DELIVERED_ID)!;
    const line = order.lines[0]!;
    const body = {
      requestId: "r-2",
      reasonCode: "DAMAGED_IN_TRANSIT",
      lines: [{ orderLineId: line.lineId, quantity: 1 }],
    };
    // The seeded AWAITING_RETURN return already holds the first line.
    expect(code(returns.open(DELIVERED_ID, body))).toBe("RETURN_LINE_ALREADY_OPEN");

    const free = order.lines.find((l) => l.lineId !== line.lineId);
    if (!free) return;
    const opened = returns.open(DELIVERED_ID, {
      ...body,
      lines: [{ orderLineId: free.lineId, quantity: 1 }],
    });
    expect(opened.status).toBe(201);
    const again = returns.open(DELIVERED_ID, {
      ...body,
      lines: [{ orderLineId: free.lineId, quantity: 1 }],
    });
    expect(data(again).id).toBe(data(opened).id);
  });

  it("refuses OTHER without a description and a short delivery", () => {
    const { returns, orders } = setup(new Date("2026-10-03T00:00:00Z"));
    const line = orders.ownOrder(DELIVERED_ID)!.lines.at(-1)!;
    const lines = [{ orderLineId: line.lineId, quantity: 1 }];
    expect(code(returns.open(DELIVERED_ID, { requestId: "a", reasonCode: "OTHER", lines }))).toBe(
      "VALIDATION_FAILED",
    );
    expect(
      code(returns.open(DELIVERED_ID, { requestId: "b", reasonCode: "SHORT_DELIVERY", lines })),
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
});
