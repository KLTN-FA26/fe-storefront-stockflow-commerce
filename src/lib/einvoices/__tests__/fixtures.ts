/** BE `CustomerEInvoiceResponse` như BE trả (NON_NULL bỏ trường null). */
export const beInvoice = (over: Record<string, unknown> = {}) => ({
  id: "5e1a0000-0000-4000-8000-000000000001",
  type: "ORIGINAL",
  status: "ISSUED",
  adjusted: false,
  orderId: "0b7d3c1e-0000-4000-8000-000000000001",
  orderNumber: "SO-20260907-000431",
  shipmentCode: "SO-20260907-000431-S1",
  issueDate: "2026-11-10",
  templateCode: "1",
  symbol: "C26TAA",
  invoiceNumber: 42,
  subtotal: 507_000,
  taxTotal: 40_560,
  grandTotal: 547_560,
  issuedAt: "2026-11-10T03:00:00Z",
  ...over,
});
