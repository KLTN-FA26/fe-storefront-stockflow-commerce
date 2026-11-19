/**
 * QuoteResponse / QuoteRowResponse as the BE sends them (Jackson NON_NULL drops every null field;
 * BigDecimal money and the VAT percentage arrive as JSON numbers): DS-02a's quote, 60 cartons of
 * 1.000 cups at the 50-carton tier of 1.150 đ, a plate fee of 1.500.000 đ, VAT 8 % → 76.140.000 đ
 * (plan §3 step 3).
 */
export const quoteId = "5a1e0000-0000-4000-8000-000000000001";
export const cupLineId = "5a1e1100-0000-4000-8000-000000000001";
export const lidLineId = "5a1e1100-0000-4000-8000-000000000002";

export const beSentQuote = {
  id: quoteId,
  quoteNumber: "QT-20261120-9001",
  customerId: "c0ffee00-0000-4000-8000-000000000010",
  status: "SENT",
  revision: 1,
  validUntil: "2099-12-04T02:00:00Z",
  requestedDeliveryDate: "2099-12-09",
  legacy: false,
  lines: [
    {
      id: cupLineId,
      lineNo: 1,
      measure: "CARTON",
      sku: "LY-GIAY-DEMO-12OZ-XANH",
      cartons: 60,
      unitsPerCarton: 1000,
      units: 60000,
      priced: true,
      moq: 20,
      tiers: [
        { minQuantity: 20, unitPrice: 1250 },
        { minQuantity: 50, unitPrice: 1150 },
        { minQuantity: 100, unitPrice: 1050 },
      ],
      proposedUnitPrice: 1150,
      proposedLineTotal: 69000000,
      taxClass: "STANDARD",
      taxRate: 8.0,
      proposedTax: 5520000,
    },
  ],
  fees: [
    {
      id: "5a1e2200-0000-4000-8000-000000000001",
      kind: "PLATE_FEE",
      sku: "LY-GIAY-DEMO-12OZ-XANH",
      amount: 1500000,
      taxClass: "STANDARD",
      taxRate: 8.0,
      tax: 120000,
    },
  ],
  priced: true,
  proposed: { subtotal: 69000000, fees: 1500000, tax: 5640000, total: 76140000 },
  proposedTotal: 76140000,
  sentAt: "2099-11-20T02:00:00Z",
  sentBy: "5a1e9900-0000-4000-8000-000000000001",
  history: [
    { revision: 1, toStatus: "DRAFT", changedAt: "2099-11-19T02:00:00Z" },
    { revision: 1, fromStatus: "DRAFT", toStatus: "SENT", changedAt: "2099-11-20T02:00:00Z" },
  ],
  createdAt: "2099-11-19T02:00:00Z",
  createdBy: "demo.sales",
  version: 3,
};

/** The same quote with a second line, a lid of 2.000 a carton from 10 cartons at 180 đ. */
export const beTwoLineQuote = {
  ...beSentQuote,
  lines: [
    ...beSentQuote.lines,
    {
      id: lidLineId,
      lineNo: 2,
      measure: "CARTON",
      sku: "NAP-LY-DEMO-90-TRANG",
      cartons: 30,
      unitsPerCarton: 2000,
      units: 60000,
      priced: true,
      moq: 10,
      tiers: [
        { minQuantity: 10, unitPrice: 180 },
        { minQuantity: 50, unitPrice: 160 },
      ],
      proposedUnitPrice: 180,
      proposedLineTotal: 10800000,
      taxClass: "STANDARD",
      taxRate: 8.0,
      proposedTax: 864000,
    },
  ],
};

export const beQuoteRow = {
  id: quoteId,
  quoteNumber: "QT-20261120-9001",
  customerId: "c0ffee00-0000-4000-8000-000000000010",
  status: "SENT",
  revision: 1,
  validUntil: "2099-12-04T02:00:00Z",
  sentAt: "2099-11-20T02:00:00Z",
  createdAt: "2099-11-19T02:00:00Z",
  version: 3,
};

export const bePage = (items: unknown[], over: Record<string, unknown> = {}) => ({
  items,
  page: 0,
  size: 10,
  totalElements: items.length,
  totalPages: items.length > 0 ? 1 : 0,
  hasNext: false,
  hasPrevious: false,
  ...over,
});
