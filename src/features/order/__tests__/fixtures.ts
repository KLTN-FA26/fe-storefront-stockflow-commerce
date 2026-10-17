/**
 * BE-shaped responses as the real API sends them (NON_NULL drops every null field):
 * CustomerOrderCardResponse for GET /orders/me, CustomerOrderDetailResponse for /orders/me/{id}.
 */
export const orderId = "0b7d3c1e-0000-4000-8000-000000000001";

/** One CustomerOrderCardResponse: no lines, only their count. */
export const beCard = {
  orderId,
  orderNumber: "SO-20260907-000431",
  status: "CONFIRMED",
  statusGroup: "CONFIRMED",
  total: 507000,
  currency: "VND",
  placedAt: "2026-09-07T03:00:00Z",
  lineCount: 2,
  deliveryState: "NOT_SHIPPED",
};

/** One CustomerOrderDetailResponse. */
export const beOrder = {
  orderId,
  orderNumber: "SO-20260907-000431",
  status: "CONFIRMED",
  statusGroup: "CONFIRMED",
  paymentTerm: "PREPAID",
  total: 507000,
  currency: "VND",
  placedAt: "2026-09-07T03:00:00Z",
  payment: { status: "PAID", paidAmount: 507000 },
  lines: [
    {
      lineId: "1a2b3c4d-0000-4000-8000-000000000001",
      sku: "TEE-CLASSIC-WHT-M",
      quantity: 2,
      unitPrice: 189000,
      lineTotal: 378000,
    },
    {
      lineId: "1a2b3c4d-0000-4000-8000-000000000002",
      sku: "MUG-CERAMIC-11OZ",
      quantity: 1,
      unitPrice: 129000,
      lineTotal: 129000,
      designSnapshotId: "9c0d1e2f-0000-4000-8000-000000000002",
      production: { state: "IN_PROGRESS", goodQuantity: 0 },
    },
  ],
  timeline: [
    {
      status: "PENDING_PAYMENT",
      statusGroup: "AWAITING_PAYMENT",
      occurredAt: "2026-09-07T03:00:00Z",
    },
    { status: "CONFIRMED", statusGroup: "CONFIRMED", occurredAt: "2026-09-07T04:00:00Z" },
  ],
  deliveryState: "NOT_SHIPPED",
};

export const bePage = (overrides: Record<string, unknown> = {}) => ({
  items: [beCard],
  page: 0,
  size: 10,
  totalElements: 1,
  totalPages: 1,
  hasNext: false,
  hasPrevious: false,
  ...overrides,
});
