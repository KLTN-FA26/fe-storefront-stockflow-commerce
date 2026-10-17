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

  it("cancels a CONFIRMED order with a Void body and moves it to CANCELLED", () => {
    const b = book();
    const confirmed = byStatus("CONFIRMED");
    const result = b.cancel(confirmed.orderId);
    expect(result.status).toBe(200);
    expect(result.data).not.toHaveProperty("data");
    expect((dataOf(b.get(confirmed.orderId)) as MockOrder).status).toBe("CANCELLED");
  });

  it("answers 409 CONFLICT when the status cannot be cancelled (BR-031)", () => {
    const shipped = byStatus("SHIPPED");
    const result = book().cancel(shipped.orderId);
    expect(result.status).toBe(409);
    expect(result.data).toMatchObject({
      errorCode: "CONFLICT",
      message: `Order ${shipped.orderNumber} cannot be cancelled from status SHIPPED; raise a return instead`,
    });
  });
});
