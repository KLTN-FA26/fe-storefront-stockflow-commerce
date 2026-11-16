/** A BE `CustomerReturnResponse` as JSON (amounts as numbers, instants as ISO strings). */
export const RETURN_ID = "7e7a0000-0000-4000-8000-000000000001";
export const ORDER_ID = "0b7d3c1e-0000-4000-8000-000000000005";
export const ORDER_LINE_ID = "1a2b3c4d-0000-4000-8000-000000000032";

export function beReturn(overrides: Record<string, unknown> = {}) {
  return {
    id: RETURN_ID,
    rmaNumber: "RMA-20261110-0001",
    orderId: ORDER_ID,
    orderNumber: "SO-20261002-000436",
    status: "AWAITING_RETURN",
    reasonCode: "DAMAGED_IN_TRANSIT",
    description: "Thùng bị móp, 1 cái vỡ.",
    requestedResolution: "REFUND",
    requestedAt: "2026-11-10T03:00:00Z",
    returnRequired: true,
    returnDeadline: "2026-11-25T17:00:00Z",
    rejectionReason: null,
    receivedAt: null,
    closedAt: null,
    currency: "VND",
    refundedAmount: null,
    offsetAmount: null,
    lines: [
      {
        id: "7e7a1111-0000-4000-8000-000000000001",
        orderLineId: ORDER_LINE_ID,
        sku: "MUG-CERAMIC-11OZ",
        requestedQuantity: 2,
        approvedQuantity: 1,
        receivedQuantity: null,
        refundQuantity: 0,
        refundAmount: null,
      },
    ],
    discrepancies: [],
    evidence: [
      {
        id: "e71d0000-0000-4000-8000-000000000001",
        stage: "CLAIM",
        originalName: "anh-loi.jpg",
        uploadedAt: "2026-11-10T03:00:00Z",
        thumbnailUrl: null,
      },
    ],
    history: [
      { status: "REQUESTED", occurredAt: "2026-11-10T03:00:00Z" },
      { status: "AWAITING_RETURN", occurredAt: "2026-11-11T03:00:00Z" },
    ],
    version: 1,
    ...overrides,
  };
}
