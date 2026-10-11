/** BE-shaped OrderResponse as the real API sends it: NON_NULL drops every null field. */
export const orderId = "0b7d3c1e-0000-4000-8000-000000000001";

export const beOrder = {
  orderId,
  orderNumber: "SO-20260907-000431",
  customerId: "9d1e2f3a-4b5c-4d6e-8f70-1a2b3c4d5e6f",
  status: "PAID",
  totalAmount: 507000,
  currency: "VND",
  lines: [
    {
      lineId: "1a2b3c4d-0000-4000-8000-000000000001",
      sku: "TEE-CLASSIC-WHT-M",
      quantity: 2,
      unitPrice: 189000,
      lineTotal: 378000,
      reservationIds: ["5e6f7a8b-0000-4000-8000-000000000001"],
    },
    {
      lineId: "1a2b3c4d-0000-4000-8000-000000000002",
      sku: "MUG-CERAMIC-11OZ",
      quantity: 1,
      unitPrice: 129000,
      lineTotal: 129000,
      reservationIds: [],
    },
  ],
  placedAt: "2026-09-07T03:00:00Z",
  lastModifiedAt: "2026-09-07T04:00:00Z",
};

export const bePage = (overrides: Record<string, unknown> = {}) => ({
  items: [beOrder],
  page: 0,
  size: 10,
  totalElements: 1,
  totalPages: 1,
  hasNext: false,
  hasPrevious: false,
  ...overrides,
});
