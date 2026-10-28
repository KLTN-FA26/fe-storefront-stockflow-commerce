import { describe, expect, it } from "vitest";

import { createMockCatalog, seedMockCatalog, type MockCatalog } from "./catalog";
import {
  createMockOrderBook,
  foreignMockOrderId,
  seedMockOrders,
  type MockCreditTerms,
  type MockOrder,
} from "./orders";

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

  it("cancels a CONFIRMED order at once: 200 CANCELLED, with the reason code on its timeline", () => {
    const b = book();
    const confirmed = byStatus("CONFIRMED");
    const result = b.cancel(confirmed.orderId, { reasonCode: "DUPLICATE_ORDER" });
    expect(result.status).toBe(200);
    expect(dataOf(result)).toMatchObject({ result: "CANCELLED", order: { status: "CANCELLED" } });
    expect(dataOf(result)).not.toHaveProperty("requestId");
    const detail = dataOf(b.get(confirmed.orderId)) as DetailBody;
    expect(detail.status).toBe("CANCELLED");
    expect(detail.timeline.at(-1)).toMatchObject({
      status: "CANCELLED",
      reasonCode: "DUPLICATE_ORDER",
    });
  });

  it.each(["IN_PRODUCTION", "READY_TO_FULFILL", "IN_FULFILMENT", "ON_HOLD"] as const)(
    "records a request for Sales from %s: 202 REQUESTED, the order itself unchanged",
    (status) => {
      const b = book();
      const order = byStatus(status);
      const result = b.cancel(order.orderId, { reasonCode: "CUSTOMER_REQUEST" });
      expect(result.status).toBe(202);
      expect(dataOf(result)).toMatchObject({ result: "REQUESTED", order: { status } });
      expect((dataOf(result) as { requestId: string }).requestId).toMatch(/^[0-9a-f-]{36}$/);
      expect((dataOf(b.get(order.orderId)) as DetailBody).status).toBe(status);
    },
  );

  it("refuses a second request while one is waiting (409 ORDER_CANCELLATION_REQUEST_PENDING)", () => {
    const b = book();
    const order = byStatus("IN_PRODUCTION");
    expect(b.cancel(order.orderId).status).toBe(202);
    const again = b.cancel(order.orderId);
    expect(again.status).toBe(409);
    expect(again.data).toMatchObject({ errorCode: "ORDER_CANCELLATION_REQUEST_PENDING" });
  });

  it.each(["SHIPPED", "DELIVERED", "COMPLETED", "CANCELLED", "RETURNED"] as const)(
    "answers 409 ORDER_NOT_CANCELLABLE from %s: it is a return, not a cancellation (BR-031)",
    (status) => {
      const result = book().cancel(byStatus(status).orderId);
      expect(result.status).toBe(409);
      expect(result.data).toMatchObject({ errorCode: "ORDER_NOT_CANCELLABLE" });
    },
  );

  it("refuses a body the BE refuses: unknown code 400 MALFORMED_REQUEST, note too long or OTHER without a note 400 VALIDATION_FAILED", () => {
    const id = byStatus("CONFIRMED").orderId;
    expect(book().cancel(id, { reasonCode: "CHANGED_MIND" })).toMatchObject({
      status: 400,
      data: { errorCode: "MALFORMED_REQUEST" },
    });
    expect(book().cancel(id, { note: "x".repeat(1001) })).toMatchObject({
      status: 400,
      data: { errorCode: "VALIDATION_FAILED" },
    });
    expect(book().cancel(id, { reasonCode: "OTHER" })).toMatchObject({
      status: 400,
      data: { errorCode: "VALIDATION_FAILED" },
    });
  });

  it("gives every line a production block and omits fields that do not apply (NON_NULL)", () => {
    const b = book();
    const detail = dataOf(b.get(byStatus("IN_PRODUCTION").orderId)) as DetailBody;
    expect(detail.lines.every((line) => line.production)).toBe(true);
    const printed = detail.lines.find((line) => line.designSnapshotId);
    expect(printed?.production).toMatchObject({ state: "IN_PROGRESS" });
    expect(detail).not.toHaveProperty("holdReasonPublic");
    const held = dataOf(b.get(byStatus("ON_HOLD").orderId)) as DetailBody;
    expect(held.holdReasonPublic).toBeDefined();
  });
});

interface DetailBody {
  status: string;
  holdReasonPublic?: string;
  timeline: Array<{ status: string; reasonCode?: string }>;
  lines: Array<{ designSnapshotId?: string; production?: { state: string } }>;
}

describe("mock checkout (POST /orders) mirrors BE OrderServiceImpl.place", () => {
  const ME = "c0ffee00-0000-4000-8000-000000000010";
  const ADDRESS = "6f1c2a3b-4d5e-4f60-8a71-0b2c3d4e5f60";
  const address = {
    recipientName: "Nguyễn Hoài Nam",
    phone: "+84908111222",
    line1: "12 Nguyễn Huệ",
    wardCode: "26734",
    wardName: "Phường Sài Gòn",
    provinceCode: "79",
    provinceName: "Thành phố Hồ Chí Minh",
    countryCode: "VN",
  };
  let catalog: MockCatalog;
  const checkoutBook = (terms?: MockCreditTerms) => {
    catalog = createMockCatalog(seedMockCatalog());
    return createMockOrderBook(ME, [], {
      catalog,
      shippingAddress: (id) => (id === ADDRESS ? address : undefined),
      defaultShippingAddressId: () => ADDRESS,
      ...(terms ? { terms } : {}),
    });
  };
  const request = (over: Record<string, unknown> = {}) => ({
    requestId: "11111111-1111-4111-8111-111111111111",
    customerId: ME,
    shippingAddressId: ADDRESS,
    lines: [{ sku: "CUP-PAPER-8OZ-WHT", quantity: 1000, unitPrice: 780 }],
    ...over,
  });
  const errorOf = (result: { data: unknown }) => (result.data as { errorCode: string }).errorCode;

  it("creates the order at the SKU's tier price, holds the stock, and answers 201 with the order", () => {
    const book = checkoutBook();
    const result = book.place(
      request({ lines: [{ sku: "cup-paper-8oz-wht", quantity: 5000, unitPrice: 720 }] }),
    );
    expect(result.status).toBe(201);
    expect(dataOf(result)).toMatchObject({
      status: "PENDING_PAYMENT",
      totalAmount: 3_600_000,
      currency: "VND",
      paymentTerm: "PREPAID",
      paymentStatus: "UNPAID",
      lines: [{ sku: "CUP-PAPER-8OZ-WHT", quantity: 5000, unitPrice: 720, lineTotal: 3_600_000 }],
    });
    expect(catalog.stockOf("CUP-PAPER-8OZ-WHT")).toBe(115000);
    // It is the customer's order now.
    const id = (dataOf(result) as { orderId: string }).orderId;
    expect(dataOf(book.get(id))).toMatchObject({
      status: "PENDING_PAYMENT",
      statusGroup: "AWAITING_PAYMENT",
    });
    expect(pageOf(book.page()).totalElements).toBe(1);
  });

  it("is idempotent on requestId: the original order comes back, nothing is held twice", () => {
    const book = checkoutBook();
    const first = dataOf(book.place(request())) as { orderId: string };
    const again = book.place(
      request({ lines: [{ sku: "BOX-TAKEAWAY-M", quantity: 200, unitPrice: 2100 }] }),
    );
    expect(again.status).toBe(201);
    expect((dataOf(again) as { orderId: string }).orderId).toBe(first.orderId);
    expect(catalog.stockOf("CUP-PAPER-8OZ-WHT")).toBe(119000);
    expect(pageOf(book.page()).totalElements).toBe(1);
  });

  it("hides a customerId that is not the caller's behind 404, and bean-validates the body", () => {
    expect(
      checkoutBook().place(request({ customerId: "c0ffee00-0000-4000-8000-0000000000ff" })).status,
    ).toBe(404);
    const bad = checkoutBook().place(request({ lines: [{ sku: "A", quantity: 0, unitPrice: 5 }] }));
    expect(bad).toMatchObject({ status: 400, data: { errorCode: "VALIDATION_FAILED" } });
    expect(checkoutBook().place(request({ lines: [] })).status).toBe(400);
    // OrderWebMapper.wholeVnd
    expect(
      checkoutBook().place(request({ lines: [{ sku: "A", quantity: 1, unitPrice: 99.5 }] })).status,
    ).toBe(400);
  });

  it("refuses with the BE's 409 codes: price changed, below MOQ, no price, not purchasable", () => {
    expect(
      errorOf(
        checkoutBook().place(
          request({ lines: [{ sku: "CUP-PAPER-8OZ-WHT", quantity: 1000, unitPrice: 700 }] }),
        ),
      ),
    ).toBe("CHECKOUT_PRICE_CHANGED");
    expect(
      errorOf(
        checkoutBook().place(
          request({ lines: [{ sku: "CUP-PAPER-8OZ-WHT", quantity: 10, unitPrice: 780 }] }),
        ),
      ),
    ).toBe("CUSTOMER_PRICE_BELOW_MOQ");
    expect(
      errorOf(
        checkoutBook().place(
          request({ lines: [{ sku: "CUP-CUSTOM-LOGO", quantity: 10, unitPrice: 9500 }] }),
        ),
      ),
    ).toBe("PRICE_NOT_AVAILABLE");
    expect(
      errorOf(
        checkoutBook().place(
          request({ lines: [{ sku: "NO-SUCH-SKU", quantity: 1, unitPrice: 1 }] }),
        ),
      ),
    ).toBe("PRODUCT_NOT_PURCHASABLE");
  });

  it("prices a SKU on the order's total of it, split across lines or not", () => {
    const book = checkoutBook();
    const result = book.place(
      request({
        lines: [
          { sku: "CUP-PAPER-8OZ-WHT", quantity: 3000, unitPrice: 720 },
          { sku: "CUP-PAPER-8OZ-WHT", quantity: 2000, unitPrice: 720 },
        ],
      }),
    );
    expect(result.status).toBe(201);
  });

  it("holds stock all or nothing: a refused line leaves the earlier ones untouched", () => {
    const book = checkoutBook();
    const result = book.place(
      request({
        lines: [
          { sku: "CUP-PAPER-8OZ-WHT", quantity: 1000, unitPrice: 780 },
          { sku: "CUP-PAPER-8OZ-KRAFT", quantity: 1000, unitPrice: 820 }, // only 3 left
        ],
      }),
    );
    expect(result).toMatchObject({ status: 409, data: { errorCode: "INSUFFICIENT_STOCK" } });
    expect(catalog.stockOf("CUP-PAPER-8OZ-WHT")).toBe(120000);
    expect(pageOf(book.page()).totalElements).toBe(0);
  });

  it("needs a shipping address the customer owns: 404 ADDRESS_NOT_FOUND, or the default when omitted", () => {
    expect(
      errorOf(
        checkoutBook().place(
          request({ shippingAddressId: "6f1c2a3b-4d5e-4f60-8a71-0b2c3d4e5fff" }),
        ),
      ),
    ).toBe("ADDRESS_NOT_FOUND");
    const { shippingAddressId: _omit, ...withoutAddress } = request();
    expect(checkoutBook().place(withoutAddress).status).toBe(201);
  });

  it("takes the customer's default term: deposit needs a deposit, credit is confirmed within the limit and held above it", () => {
    const deposit = checkoutBook({
      defaultTerm: "DEPOSIT",
      allowed: ["DEPOSIT"],
      depositPercent: 30,
      creditLimit: 0,
      creditTermDays: 30,
    });
    const placed = dataOf(deposit.place(request())) as { orderId: string };
    expect(dataOf(deposit.get(placed.orderId))).toMatchObject({
      paymentTerm: "DEPOSIT",
      payment: { status: "UNPAID", paidAmount: 0, depositRequired: 234000 },
    });

    const credit = {
      defaultTerm: "CREDIT" as const,
      allowed: ["CREDIT" as const],
      depositPercent: 30,
      creditTermDays: 30,
    };
    expect(
      dataOf(checkoutBook({ ...credit, creditLimit: 10_000_000 }).place(request())),
    ).toMatchObject({ status: "CONFIRMED", paymentStatus: "ON_CREDIT" });
    const held = checkoutBook({ ...credit, creditLimit: 1000 });
    const heldOrder = dataOf(held.place(request())) as { orderId: string; status: string };
    expect(heldOrder.status).toBe("ON_HOLD");
    expect(dataOf(held.get(heldOrder.orderId))).toMatchObject({
      holdReasonPublic: "AWAITING_CREDIT_APPROVAL",
      payment: { status: "ON_CREDIT", creditTermDays: 30 },
    });
  });

  it("refuses a default term the customer may not use (409 PAYMENT_TERM_NOT_ALLOWED)", () => {
    const book = checkoutBook({
      defaultTerm: "CREDIT",
      allowed: ["PREPAID"],
      depositPercent: 30,
      creditLimit: 0,
      creditTermDays: 30,
    });
    expect(errorOf(book.place(request()))).toBe("PAYMENT_TERM_NOT_ALLOWED");
  });

  it("places on the term asked for when the customer may use it, else 409 PAYMENT_TERM_NOT_ALLOWED (BR-01)", () => {
    const book = checkoutBook(); // allowed PREPAID + DEPOSIT, default PREPAID
    expect(errorOf(book.place(request({ paymentTerm: "CREDIT" })))).toBe(
      "PAYMENT_TERM_NOT_ALLOWED",
    );
    expect(errorOf(book.place(request({ paymentTerm: "BARTER" })))).toBe("MALFORMED_REQUEST");
    const placed = dataOf(book.place(request({ paymentTerm: "DEPOSIT" }))) as { orderId: string };
    expect(dataOf(book.get(placed.orderId))).toMatchObject({
      paymentTerm: "DEPOSIT",
      payment: { depositRequired: 234000 },
    });
    // a refused order holds no stock
    expect(catalog.stockOf("CUP-PAPER-8OZ-WHT")).toBe(119000);
  });

  it("answers GET /orders/payment-terms like the BE: the allowed terms, the default, the deposit share", () => {
    const body = dataOf(checkoutBook().paymentTerms()) as Record<string, unknown>;
    expect(body).toMatchObject({
      customerId: ME,
      allowedTerms: ["PREPAID", "DEPOSIT"],
      defaultTerm: "PREPAID",
      depositPercent: 30,
    });
    const credit = dataOf(
      checkoutBook({
        defaultTerm: "CREDIT",
        allowed: ["PREPAID", "CREDIT"],
        depositPercent: 30,
        creditLimit: 5_000_000,
        creditTermDays: 30,
      }).paymentTerms(),
    ) as Record<string, unknown>;
    expect(credit.allowedTerms).toEqual(["PREPAID", "CREDIT"]);
    expect(credit).not.toHaveProperty("depositPercent"); // only with DEPOSIT allowed
  });

  it("gives the stock back when the customer cancels an order placed here", () => {
    const book = checkoutBook();
    const { orderId } = dataOf(book.place(request())) as { orderId: string };
    expect(catalog.stockOf("CUP-PAPER-8OZ-WHT")).toBe(119000);
    expect(book.cancel(orderId).status).toBe(200);
    expect(catalog.stockOf("CUP-PAPER-8OZ-WHT")).toBe(120000);
  });

  describe("SCRUM-190: the same order again and the reorder data", () => {
    const another = (n: number) => "22222222-2222-4222-8222-22222222222" + n;

    it("refuses the same lines placed again within the window with the earlier order in details", () => {
      const book = checkoutBook();
      const first = dataOf(book.place(request())) as { orderId: string; orderNumber: string };
      const again = book.place(request({ requestId: another(1) }));
      expect(again.status).toBe(409);
      expect(errorOf(again)).toBe("DUPLICATE_ORDER_SUSPECTED");
      expect((again.data as { details: unknown }).details).toMatchObject({
        orderId: first.orderId,
        orderNumber: first.orderNumber,
        placedAt: expect.any(String),
      });
      // Nothing was created and no stock was held.
      expect(catalog.stockOf("CUP-PAPER-8OZ-WHT")).toBe(119000);
    });

    it("places it when the request confirms, and treats a split SKU as its total", () => {
      const book = checkoutBook();
      book.place(
        request({ lines: [{ sku: "CUP-PAPER-8OZ-WHT", quantity: 2000, unitPrice: 780 }] }),
      );
      const split = request({
        requestId: another(1),
        lines: [
          { sku: "CUP-PAPER-8OZ-WHT", quantity: 1000, unitPrice: 780 },
          { sku: "CUP-PAPER-8OZ-WHT", quantity: 1000, unitPrice: 780 },
        ],
      });
      expect(errorOf(book.place(split))).toBe("DUPLICATE_ORDER_SUSPECTED");
      expect(book.place({ ...split, confirmDuplicate: true }).status).toBe(201);
    });

    it("does not count a different quantity, a cancelled order or a retry of the same request", () => {
      const book = checkoutBook();
      const { orderId } = dataOf(book.place(request())) as { orderId: string };
      expect(
        book.place(
          request({
            requestId: another(1),
            lines: [{ sku: "CUP-PAPER-8OZ-WHT", quantity: 2000, unitPrice: 780 }],
          }),
        ).status,
      ).toBe(201);
      expect(book.place(request()).status).toBe(201); // the retry returns the original order
      book.cancel(orderId);
      expect(book.place(request({ requestId: another(2) })).status).toBe(201);
    });

    it("tells where each stock SKU is on sale, and only for what is on sale", () => {
      catalog = createMockCatalog(seedMockCatalog());
      const seeded = seedMockOrders(ME).find((o) => o.customerId === ME)!;
      const { designSnapshotId: _design, ...stock } = seeded.lines[0]!;
      const sold = {
        ...seeded,
        lines: [
          { ...stock, sku: "CUP-PAPER-8OZ-WHT" },
          { ...stock, lineId: "x", sku: "GONE-SKU" },
          {
            ...seeded.lines[0]!,
            lineId: "y",
            sku: "CUP-PAPER-8OZ-WHT",
            designSnapshotId: "9c0d1e2f-0000-4000-8000-000000000002",
          },
        ],
      };
      const book = createMockOrderBook(ME, [sold], { catalog });
      const lines = (dataOf(book.get(sold.orderId)) as { lines: Array<Record<string, unknown>> })
        .lines;
      expect(lines[0]).toMatchObject({
        productSlug: "ly-giay-2-lop-8oz",
        productTitle: "Ly giấy 2 lớp 8oz",
      });
      expect(lines[1]).not.toHaveProperty("productSlug");
      // A design line is quoted, never refilled: it carries no product to put back.
      expect(lines[2]).not.toHaveProperty("productSlug");
    });

    it("drafts a quote for an order that came from a quote, and refuses the rest", () => {
      const seeded = seedMockOrders(ME).find((o) => o.customerId === ME)!;
      const quoted = {
        ...seeded,
        orderId: "0b7d3c1e-0000-4000-8000-00000000abcd",
        fromQuote: true,
      };
      const book = createMockOrderBook(ME, [seeded, quoted]);
      const detail = (id: string) =>
        dataOf(book.get(id)) as { allowedActions: { reorder: boolean } };
      expect(detail(seeded.orderId).allowedActions.reorder).toBe(false);
      expect(detail(quoted.orderId).allowedActions.reorder).toBe(true);

      const body = { requestId: another(1) };
      const drafted = book.reorder(quoted.orderId, body);
      expect(drafted.status).toBe(201);
      expect(dataOf(drafted)).toMatchObject({ status: "DRAFT", quoteNumber: expect.any(String) });
      expect(errorOf(book.reorder(seeded.orderId, body))).toBe("ORDER_NOT_QUOTED");
      expect(book.reorder(foreignMockOrderId(), body).status).toBe(404);
      expect(book.reorder(quoted.orderId, {}).status).toBe(400);
    });
  });
});
