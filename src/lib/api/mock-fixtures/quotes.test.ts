import { describe, expect, it } from "vitest";

import { createMockContractBook, mockSentContract, mockSignedContract } from "./contracts";
import { seedMockOrders, seededMockOrderId, seededMockOrderIndex } from "./orders";
import { createMockQuoteBook, mockQuoteSeed, MOCK_QUOTE_SEED_IDS as IDS } from "./quotes";
import { MOCK_CONTRACT_ORDER_IDS } from "./wf02";

const CUSTOMER = "CUS-TEST";
const NOW = new Date("2026-11-18T03:00:00Z");
const book = (now = NOW) =>
  createMockQuoteBook(CUSTOMER, mockQuoteSeed(CUSTOMER, NOW), { now: () => now });
type Body = { data?: Record<string, unknown>; errorCode?: string; details?: unknown };
const body = (result: { data: unknown }) => result.data as Body;
const quoteOf = (result: { data: unknown }) =>
  body(result).data as {
    status: string;
    version: number;
    lines: Array<{ id: string; acceptedCartons?: number; acceptedUnitPrice?: number }>;
    proposed: { total: number };
    accepted?: { total: number };
  };

describe("mock quotes mirror the BE quote rules", () => {
  it("lists only the customer's sent quotes, newest first; EXPIRED is read from validUntil", () => {
    const page = body(book().page({ page: 0, size: 20 })).data as {
      items: Array<{ id: string; status: string }>;
    };
    const ids = page.items.map((q) => q.id);
    expect(ids).toEqual(
      expect.arrayContaining([IDS.sent, IDS.changesRequested, IDS.expired, IDS.converted]),
    );
    expect(ids).not.toContain(IDS.draft);
    expect(ids).not.toContain(IDS.foreign);
    expect(page.items.find((q) => q.id === IDS.expired)?.status).toBe("EXPIRED");

    const expired = body(book().page({ status: "EXPIRED" })).data as {
      items: Array<{ id: string }>;
    };
    expect(expired.items.map((q) => q.id)).toEqual([IDS.expired]);
  });

  it("answers 404 for a draft and for another customer's quote", () => {
    expect(book().get(IDS.draft).status).toBe(404);
    expect(book().get(IDS.foreign).status).toBe(404);
    expect(book().document(IDS.foreign).status).toBe(404);
  });

  it("prices the SENT quote like the BE: tier by SKU cartons, VAT 8 % line by line, plate fee", () => {
    const quote = quoteOf(book().get(IDS.sent));
    // 60 × 1000 × 1150 + 30 × 2000 × 180 = 79.800.000; fee 1.500.000; VAT 8 % of each.
    expect(quote.proposed).toEqual({
      subtotal: 79_800_000,
      fees: 1_500_000,
      tax: 6_504_000,
      total: 87_804_000,
    });
  });

  it("serves the PDF as a blob", async () => {
    const result = book().document(IDS.sent);
    expect(result.status).toBe(200);
    expect(result.data).toBeInstanceOf(Blob);
    expect(await (result.data as Blob).text()).toMatch(/^%PDF-1\.4/);
  });

  it("refuses below the MOQ with details { lineNo, sku, cartons, moq }", () => {
    const quote = quoteOf(book().get(IDS.sent));
    const result = book().accept(IDS.sent, {
      version: quote.version,
      lines: [{ lineId: quote.lines[0]!.id, cartons: 10 }],
    });
    expect(result.status).toBe(409);
    expect(body(result)).toMatchObject({
      errorCode: "QUOTE_BELOW_MOQ",
      message:
        "Dòng 1 (LY-GIAY-DEMO-16OZ-DO): 10 thùng thấp hơn số lượng đặt tối thiểu (MOQ) là 20 thùng.",
      details: { lineNo: 1, sku: "LY-GIAY-DEMO-16OZ-DO", cartons: 10, moq: 20 },
    });
  });

  it("accepts at the cartons asked, the others at the proposed ones, at the tier of the SKU", () => {
    const b = book();
    const quote = quoteOf(b.get(IDS.sent));
    const result = b.accept(IDS.sent, {
      version: quote.version,
      lines: [{ lineId: quote.lines[0]!.id, cartons: 100 }],
    });
    expect(result.status).toBe(200);
    const accepted = quoteOf(result);
    expect(accepted.status).toBe("ACCEPTED");
    expect(accepted.version).toBe(quote.version + 1);
    expect(accepted.lines[0]).toMatchObject({ acceptedCartons: 100, acceptedUnitPrice: 1050 });
    expect(accepted.lines[1]).toMatchObject({ acceptedCartons: 30, acceptedUnitPrice: 180 });
    expect(accepted.accepted?.total).toBe(105_000_000 + 10_800_000 + 1_500_000 + 9_384_000);
    // Answered once: a second answer is a stale version.
    expect(body(b.accept(IDS.sent, { version: quote.version })).errorCode).toBe("OPTIMISTIC_LOCK");
    expect(body(b.accept(IDS.sent, { version: accepted.version })).errorCode).toBe(
      "INVALID_QUOTE_TRANSITION",
    );
  });

  it("refuses an expired quote with QUOTE_EXPIRED, after the version check", () => {
    const quote = quoteOf(book().get(IDS.expired));
    expect(body(book().accept(IDS.expired, { version: quote.version })).errorCode).toBe(
      "QUOTE_EXPIRED",
    );
    expect(body(book().accept(IDS.expired, { version: 0 })).errorCode).toBe("OPTIMISTIC_LOCK");
    // The same SENT quote, answered before its validity ends, is fine.
    const later = new Date(NOW.getTime() + 20 * 86_400_000);
    expect(body(book(later).accept(IDS.sent, { version: 3 })).errorCode).toBe("QUOTE_EXPIRED");
  });

  it("refuses a malformed body with VALIDATION_FAILED and field errors", () => {
    const result = book().accept(IDS.sent, { lines: [{ lineId: "x", cartons: 0 }] });
    expect(result.status).toBe(400);
    expect(body(result)).toMatchObject({
      errorCode: "VALIDATION_FAILED",
      fieldErrors: expect.arrayContaining([
        expect.objectContaining({ field: "version" }),
        expect.objectContaining({ field: "lines[0].cartons" }),
      ]),
    });
  });

  it("records a change request with its feedback, which is required", () => {
    const b = book();
    expect(b.requestChanges(IDS.sent, { version: 3, feedback: "  " }).status).toBe(400);
    const result = b.requestChanges(IDS.sent, { version: 3, feedback: "Giảm giá" });
    expect(quoteOf(result).status).toBe("CHANGES_REQUESTED");
    expect(
      body(b.requestChanges(IDS.changesRequested, { version: 4, feedback: "x" })).errorCode,
    ).toBe("INVALID_QUOTE_TRANSITION");
  });

  it("runs a QUOTE card's actions through the same rules, and builds its B.7.3 payload", () => {
    const b = book();
    const payload = b.cardPayload(IDS.sent)!;
    expect(payload).toMatchObject({
      id: IDS.sent,
      quoteId: IDS.sent,
      number: "QT-20261118-0105",
      status: "SENT",
      version: 3,
      currency: "VND",
      proposedTotal: 87_804_000,
    });
    const lines = payload.lines as Array<{ id: string; unitPrice: number; lineTotal: number }>;
    expect(lines[0]).toMatchObject({ unitPrice: 1150, lineTotal: 69_000_000 });
    expect(lines[0]).not.toHaveProperty("acceptedCartons");

    const refused = b.cardAction(IDS.sent, "ACCEPT", {
      version: 3,
      cartons: { [lines[0]!.id]: 5 },
    });
    expect(body(refused).errorCode).toBe("QUOTE_BELOW_MOQ");
    expect(b.cardAction(IDS.sent, "REQUEST_CHANGES", { version: 3 }).status).toBe(400);
    expect(quoteOf(b.cardAction(IDS.sent, "ACCEPT", { version: 3 })).status).toBe("ACCEPTED");
    expect(b.cardPayload(IDS.sent)).toMatchObject({
      status: "ACCEPTED",
      acceptedTotal: 87_804_000,
    });
    expect(b.cardPayload(IDS.draft)).toBeNull();
  });

  it("links the CONVERTED quote to the order awaiting its contract", () => {
    expect(body(book().get(IDS.converted)).data).toMatchObject({
      status: "CONVERTED",
      convertedOrder: { orderId: MOCK_CONTRACT_ORDER_IDS.sent, status: "PENDING_CONTRACT" },
      accepted: { total: 76_140_000 },
    });
  });
});

describe("mock contracts mirror the BE customer contract", () => {
  const orders = seedMockOrders(CUSTOMER);
  const orderOf = (id: string) => orders.find((o) => o.orderId === id);
  const contracts = () =>
    createMockContractBook(CUSTOMER, orderOf, [
      mockSentContract(orderOf(MOCK_CONTRACT_ORDER_IDS.sent)!, NOW),
      mockSignedContract(orderOf(MOCK_CONTRACT_ORDER_IDS.signed)!),
    ]);

  it("seeds the order of wf02's MOCK_CONTRACT_ORDER_IDS.sent as PENDING_CONTRACT", () => {
    expect(orderOf(MOCK_CONTRACT_ORDER_IDS.sent)?.status).toBe("PENDING_CONTRACT");
    expect(MOCK_CONTRACT_ORDER_IDS.signed).toBe(
      seededMockOrderId(seededMockOrderIndex("PENDING_PAYMENT")),
    );
  });

  it("reads the SENT contract: 2 batches of 30 cartons, 3 installments summing to the total", () => {
    const contract = body(contracts().get(MOCK_CONTRACT_ORDER_IDS.sent)).data as {
      status: string;
      totals: { totalAmount: number };
      deliverySchedule: Array<{ lines: Array<{ cartons: number }> }>;
      paymentPlan: Array<{ milestone: string; amount: number; deliveryBatchSeq?: number }>;
    };
    expect(contract.status).toBe("SENT");
    expect(contract.deliverySchedule.map((b) => b.lines[0]!.cartons)).toEqual([30, 30]);
    expect(contract.paymentPlan.map((p) => p.milestone)).toEqual([
      "ON_SIGNING",
      "BEFORE_DELIVERY",
      "AFTER_DELIVERY",
    ]);
    expect(contract.paymentPlan[0]!.amount).toBe(22_842_000);
    expect(contract.paymentPlan.reduce((sum, p) => sum + p.amount, 0)).toBe(
      contract.totals.totalAmount,
    );
    expect(contract).not.toHaveProperty("creditWarning");
    expect(contract).not.toHaveProperty("sentBy");
  });

  it("answers 404 SALES_CONTRACT_NOT_FOUND without a contract, NOT_FOUND for another's order", () => {
    const delivered = seededMockOrderId(seededMockOrderIndex("DELIVERED"));
    expect(body(contracts().get(delivered)).errorCode).toBe("SALES_CONTRACT_NOT_FOUND");
    expect(body(contracts().get(seededMockOrderId(24))).errorCode).toBe("NOT_FOUND");
  });

  it("links the signed file once signed, else the PDF as sent; builds the B.7.4 payload", () => {
    expect(body(contracts().document(MOCK_CONTRACT_ORDER_IDS.signed)).data).toMatchObject({
      url: expect.stringContaining("-da-ky.pdf"),
    });
    expect(body(contracts().document(MOCK_CONTRACT_ORDER_IDS.sent)).data).toMatchObject({
      url: expect.stringMatching(/HD-20260910-900001-1\.pdf$/),
    });
    expect(contracts().cardPayload(MOCK_CONTRACT_ORDER_IDS.sent)).toMatchObject({
      number: "HD-20260910-900001-1",
      status: "SENT",
      totalAmount: 76_140_000,
      documentPath: `/api/v1/orders/me/${MOCK_CONTRACT_ORDER_IDS.sent}/contract/document`,
    });
    expect(
      contracts().cardPayload(seededMockOrderId(seededMockOrderIndex("DELIVERED"))),
    ).toBeNull();
  });
});
