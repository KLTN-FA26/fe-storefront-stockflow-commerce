import { describe, expect, it } from "vitest";

import { createMockOrderBook, foreignMockOrderId, seedMockOrders, type MockOrder } from "./orders";

const CUSTOMER = "CUS-TEST";
const book = () => createMockOrderBook(CUSTOMER, seedMockOrders(CUSTOMER));
const dataOf = (result: { data: unknown }) => (result.data as { data: unknown }).data;
// The page body as the BE sends it; that it satisfies the FE zod schemas is checked from the
// feature side (features/order/__tests__/mock-contract.test.ts) — lib must not import features.
interface MockPage {
  items: Array<{ orderId: string; placedAt: string; statusGroup: string; lineCount: number }>;
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}
const pageOf = (result: { data: unknown }) => dataOf(result) as MockPage;
const byStatus = (status: MockOrder["status"]) =>
  seedMockOrders(CUSTOMER).find((o) => o.customerId === CUSTOMER && o.status === status)!;

describe("mock order book mirrors the BE order rules", () => {
  it("seeds more than one page of orders covering every status", () => {
    const orders = seedMockOrders(CUSTOMER).filter((o) => o.customerId === CUSTOMER);
    expect(orders.length).toBeGreaterThan(20);
    expect(new Set(orders.map((o) => o.status)).size).toBe(12);
  });

  it("pages zero-based like PageResponse, newest change first", () => {
    const first = pageOf(book().page({ page: 0, size: 10 }));
    expect(first).toMatchObject({ page: 0, size: 10, totalElements: 24, totalPages: 3 });
    expect(first).toMatchObject({ hasNext: true, hasPrevious: false });
    const stamps = first.items.map((o) => o.placedAt);
    expect(stamps).toEqual([...stamps].sort().reverse());

    const last = pageOf(book().page({ page: "2", size: "10" }));
    expect(last.items).toHaveLength(4);
    expect(last).toMatchObject({ hasNext: false, hasPrevious: true });
  });

  it("answers 400 UNSUPPORTED_PARAMETER for page < 0 or size < 1", () => {
    expect(book().page({ page: -1 }).status).toBe(400);
    expect(book().page({ size: 0 }).status).toBe(400);
    expect(book().page({ size: 201 }).status).toBe(400);
    expect(book().page({ size: 200 }).status).toBe(200);
  });

  it("never lists or reveals another customer's order (404 NOT_FOUND)", () => {
    const { items } = pageOf(book().page({ size: 200 }));
    expect(items.map((o) => o.orderId)).not.toContain(foreignMockOrderId());
    expect(book().get(foreignMockOrderId()).status).toBe(404);
    expect(book().cancel(foreignMockOrderId()).status).toBe(404);
  });

  it("cancels a CONFIRMED order at once: 200 CANCELLED, with the reason code on its timeline", () => {
    const b = book();
    const confirmed = byStatus("CONFIRMED");
    const result = b.cancel(confirmed.orderId, { reasonCode: "DUPLICATE_ORDER" });
    expect(result.status).toBe(200);
    expect(dataOf(result)).toMatchObject({ result: "CANCELLED", order: { status: "CANCELLED" } });
    expect(dataOf(result)).not.toHaveProperty("requestId");
    const detail = dataOf(b.get(confirmed.orderId)) as DetailBody;
    expect(detail.status).toBe("CANCELLED");
    expect(detail.timeline.at(-1)).toMatchObject({
      status: "CANCELLED",
      reasonCode: "DUPLICATE_ORDER",
    });
  });

  it.each(["IN_PRODUCTION", "READY_TO_FULFILL", "IN_FULFILMENT", "ON_HOLD"] as const)(
    "records a request for Sales from %s: 202 REQUESTED, the order itself unchanged",
    (status) => {
      const b = book();
      const order = byStatus(status);
      const result = b.cancel(order.orderId, { reasonCode: "CUSTOMER_REQUEST" });
      expect(result.status).toBe(202);
      expect(dataOf(result)).toMatchObject({ result: "REQUESTED", order: { status } });
      expect((dataOf(result) as { requestId: string }).requestId).toMatch(/^[0-9a-f-]{36}$/);
      expect((dataOf(b.get(order.orderId)) as DetailBody).status).toBe(status);
    },
  );

  it("refuses a second request while one is waiting (409 ORDER_CANCELLATION_REQUEST_PENDING)", () => {
    const b = book();
    const order = byStatus("IN_PRODUCTION");
    expect(b.cancel(order.orderId).status).toBe(202);
    const again = b.cancel(order.orderId);
    expect(again.status).toBe(409);
    expect(again.data).toMatchObject({ errorCode: "ORDER_CANCELLATION_REQUEST_PENDING" });
  });

  it.each(["SHIPPED", "DELIVERED", "COMPLETED", "CANCELLED", "RETURNED"] as const)(
    "answers 409 ORDER_NOT_CANCELLABLE from %s: it is a return, not a cancellation (BR-031)",
    (status) => {
      const result = book().cancel(byStatus(status).orderId);
      expect(result.status).toBe(409);
      expect(result.data).toMatchObject({ errorCode: "ORDER_NOT_CANCELLABLE" });
    },
  );

  it("refuses a body the BE refuses: unknown code 400 MALFORMED_REQUEST, note too long or OTHER without a note 400 VALIDATION_FAILED", () => {
    const id = byStatus("CONFIRMED").orderId;
    expect(book().cancel(id, { reasonCode: "CHANGED_MIND" })).toMatchObject({
      status: 400,
      data: { errorCode: "MALFORMED_REQUEST" },
    });
    expect(book().cancel(id, { note: "x".repeat(1001) })).toMatchObject({
      status: 400,
      data: { errorCode: "VALIDATION_FAILED" },
    });
    expect(book().cancel(id, { reasonCode: "OTHER" })).toMatchObject({
      status: 400,
      data: { errorCode: "VALIDATION_FAILED" },
    });
  });

  it("gives every line a production block and omits fields that do not apply (NON_NULL)", () => {
    const b = book();
    const detail = dataOf(b.get(byStatus("IN_PRODUCTION").orderId)) as DetailBody;
    expect(detail.lines.every((line) => line.production)).toBe(true);
    const printed = detail.lines.find((line) => line.designSnapshotId);
    expect(printed?.production).toMatchObject({ state: "IN_PROGRESS" });
    expect(detail).not.toHaveProperty("holdReasonPublic");
    const held = dataOf(b.get(byStatus("ON_HOLD").orderId)) as DetailBody;
    expect(held.holdReasonPublic).toBeDefined();
  });
});

interface DetailBody {
  status: string;
  holdReasonPublic?: string;
  timeline: Array<{ status: string; reasonCode?: string }>;
  lines: Array<{ designSnapshotId?: string; production?: { state: string } }>;
}
