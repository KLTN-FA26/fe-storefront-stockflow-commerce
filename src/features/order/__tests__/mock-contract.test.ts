import { describe, expect, it } from "vitest";

import { createDefaultMockContractBook } from "@/lib/api/mock-contracts";
import { createMockOrderBook, seedMockOrders } from "@/lib/api/mock-fixtures/orders";
import { MOCK_CONTRACT_ORDER_IDS } from "@/lib/api/mock-fixtures/wf02";

import { deliveryScheduleDtoSchema } from "../contract-schemas";
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

describe("mock delivery schedule satisfies the FE contract (17 §5.2)", () => {
  it("answers GET /orders/me/{id}/delivery-batches for an order with a contract, window in force = the contract's", () => {
    const book = createDefaultMockContractBook();
    const result = book.schedule(MOCK_CONTRACT_ORDER_IDS.sent);
    expect(result.status).toBe(200);
    const schedule = deliveryScheduleDtoSchema.parse(dataOf(result));
    expect(schedule.batches.length).toBeGreaterThan(0);
    for (const batch of schedule.batches) {
      expect(batch.windowStart).toBe(batch.contractWindowStart);
      expect(batch.windowChanges).toEqual([]);
    }
  });

  it("answers 404 for an order with no contract sent, like the contract itself", () => {
    expect(
      createDefaultMockContractBook().schedule("0c0e0000-0000-4000-8000-0000000000ff").status,
    ).toBe(404);
  });
});
