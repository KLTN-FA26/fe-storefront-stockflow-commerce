/** A BE-shaped shortage choice card (BE `ShortageCardMessages.payload` = `ShortageCardResponse`), for the tests. */

export const SHORTAGE_ORDER_ID = "0b7d3c1e-0000-4000-8000-000000000001";
export const SHORTAGE_CARD_ID = "5ca2d000-0000-4000-8000-0000000000aa";

export function shortagePayload(overrides: Record<string, unknown> = {}) {
  return {
    cardId: SHORTAGE_CARD_ID,
    orderId: SHORTAGE_ORDER_ID,
    orderNumber: "SO-20261128-000007",
    status: "SENT",
    version: 3,
    batch: { seq: 1, windowFrom: "2026-12-05", windowTo: "2026-12-10", moved: false },
    missingCartons: 2,
    lines: [
      {
        sku: "LY-GIAY-2L-12OZ-CPM",
        skuName: "Ly giấy 12oz logo Cà phê Mộc",
        batchCartons: 10,
        availableCartons: 8,
        missingCartons: 2,
        unitsPerCarton: 1000,
      },
    ],
    options: [
      { option: "WAIT_FOR_PRODUCTION", expectedDeliveryDate: "2026-12-22", afterWindow: true },
      { option: "REDUCE_CARTONS", amountReduced: 2_530_000 },
      { option: "SHIP_PART_CLOSE_REST", amountReduced: 12_650_000, laterBatchesClosed: [2, 3] },
      { option: "CANCEL_ORDER", refundUpTo: 30_000_000, feePossible: true },
    ],
    salesNote: "Em xin lỗi anh/chị, kho còn thiếu 2 thùng.",
    chosen: null,
    executedAt: null,
    executionStarted: false,
    endedReason: null,
    ...overrides,
  };
}
