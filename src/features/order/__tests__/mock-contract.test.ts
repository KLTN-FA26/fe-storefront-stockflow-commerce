import { describe, expect, it } from "vitest";

import { createMockOrderBook, seedMockOrders } from "@/lib/api/mock-fixtures/orders";

import { orderDtoSchema, orderPageDtoSchema } from "../schemas";

// USE_MOCK must answer what the real BE answers, or the screens are tested against a fiction.
// Lives on the feature side: features may import lib, lib may not import features.
const CUSTOMER = "CUS-TEST";
const dataOf = (result: { data: unknown }) => (result.data as { data: unknown }).data;

describe("mock order fixtures satisfy the FE order contract", () => {
  it("answers GET /orders/me/{id} with a body the detail schema accepts, for every status", () => {
    const book = createMockOrderBook(CUSTOMER, seedMockOrders(CUSTOMER));
    for (const order of seedMockOrders(CUSTOMER).filter((o) => o.customerId === CUSTOMER)) {
      expect(orderDtoSchema.safeParse(dataOf(book.get(order.orderId))).success).toBe(true);
    }
  });

  it("answers GET /orders/me with a body the page schema accepts", () => {
    const book = createMockOrderBook(CUSTOMER, seedMockOrders(CUSTOMER));
    for (const page of [0, 1, 2]) {
      expect(orderPageDtoSchema.safeParse(dataOf(book.page({ page, size: 10 }))).success).toBe(
        true,
      );
    }
  });
});
