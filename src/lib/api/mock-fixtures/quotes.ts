/**
 * In-memory quotes of the demo customer that mirror the BE contract, for USE_MOCK=true and tests.
 *
 * Shapes follow `QuoteResponse` / `QuoteRowResponse` / `PageResponse` and the QUOTE chat card
 * payload (plan Phụ lục A.1, B.7.3); rules follow BE `QuoteService` and `Quote` (develop):
 *  - a customer sees only their own quotes, once sent; a draft or someone else's answers 404;
 *  - a SENT quote past `validUntil` reads EXPIRED on every read and in the status filter;
 *  - answering: CANCELLED → INVALID_QUOTE_TRANSITION, then the version (OPTIMISTIC_LOCK), then
 *    QUOTE_EXPIRED, then any other status → INVALID_QUOTE_TRANSITION;
 *  - accepting picks each line's tier from the accepted cartons of its SKU over every line, and
 *    refuses below the MOQ with QUOTE_BELOW_MOQ `details { lineNo, sku, cartons, moq }`;
 *  - VAT per line = net × rate % rounded half up (BE Vat), rate a percentage.
 * NON_NULL serialisation: absent optional fields are omitted, never sent as null.
 */

import { MOCK_PENDING_CONTRACT_ORDER_ID, type MockResult } from "./orders";
import { MOCK_QUOTE_IDS } from "./wf02";

export interface MockQuoteTier {
  minQuantity: number;
  unitPrice: number;
}

export interface MockQuoteLine {
  id: string;
  lineNo: number;
  sku: string;
  cartons: number;
  unitsPerCarton: number;
  tiers: MockQuoteTier[];
  taxClass: string;
  taxRate: number;
  acceptedCartons?: number;
  acceptedUnitPrice?: number;
}

export interface MockQuoteFee {
  id: string;
  kind: "PLATE_FEE" | "SHIPPING_FEE";
  sku?: string;
  amount?: number;
  taxClass?: string;
  taxRate?: number;
}

export type MockQuoteStatus =
  "DRAFT" | "SENT" | "CHANGES_REQUESTED" | "ACCEPTED" | "EXPIRED" | "CANCELLED" | "CONVERTED";

export interface MockQuote {
  id: string;
  quoteNumber: string;
  customerId: string;
  /** As stored: a SENT quote past its validity still reads SENT here (the sweep has not run). */
  status: MockQuoteStatus;
  revision: number;
  validUntil: string;
  terms?: string;
  requestedDeliveryDate?: string;
  lines: MockQuoteLine[];
  fees: MockQuoteFee[];
  sentAt?: string;
  respondedAt?: string;
  customerFeedback?: string;
  cancellationReason?: string;
  convertedOrder?: { orderId: string; orderNumber: string; status: string; total: number };
  convertedAt?: string;
  history: Array<{
    revision: number;
    fromStatus?: MockQuoteStatus;
    toStatus: MockQuoteStatus;
    reason?: string;
    changedAt: string;
  }>;
  createdAt: string;
  version: number;
}

const ok = (data: unknown, status = 200): MockResult => ({
  status,
  data: { success: true, data, timestamp: new Date().toISOString() },
});

type FieldError = { field: string; message: string; code: string };
const fail = (
  status: number,
  errorCode: string,
  message: string,
  extra: { fieldErrors?: FieldError[]; details?: Record<string, unknown> } = {},
): MockResult => ({
  status,
  data: {
    success: false,
    errorCode,
    message,
    ...extra,
    correlationId: `mock-quote-${Date.now()}`,
    timestamp: new Date().toISOString(),
  },
});

const STATUS_LABEL: Record<MockQuoteStatus, string> = {
  DRAFT: "Nháp",
  SENT: "Đã gửi",
  CHANGES_REQUESTED: "Yêu cầu sửa",
  ACCEPTED: "Đã chấp nhận",
  EXPIRED: "Hết hiệu lực",
  CANCELLED: "Đã huỷ",
  CONVERTED: "Đã tạo đơn",
};

/**
 * A sent quote Sales reopened to revise (BE PR #388): stored DRAFT with a `sentAt`. The customer
 * still sees it, as CHANGES_REQUESTED with the figures of the last sent revision.
 */
export const mockIsRevising = (quote: MockQuote): boolean =>
  quote.status === "DRAFT" && quote.sentAt !== undefined;

/** The revision the customer was last offered: the last row that entered SENT. */
const lastSentRevision = (quote: MockQuote): number =>
  quote.history.findLast((row) => row.toStatus === "SENT")?.revision ?? quote.revision;

/** BE Quote.statusAt, as the customer reads it. */
export const mockQuoteStatusAt = (quote: MockQuote, now: Date): MockQuoteStatus => {
  if (mockIsRevising(quote)) return "CHANGES_REQUESTED";
  return quote.status === "SENT" && now.getTime() >= Date.parse(quote.validUntil)
    ? "EXPIRED"
    : quote.status;
};

/** BE QuoteLine.priceFor: the break with the highest start not above `skuCartons`; null below MOQ. */
export function mockPriceFor(line: MockQuoteLine, skuCartons: number): number | null {
  const tiers = [...line.tiers].sort((a, b) => a.minQuantity - b.minQuantity);
  if (tiers.length === 0 || skuCartons < tiers[0]!.minQuantity) return null;
  return tiers.filter((tier) => tier.minQuantity <= skuCartons).at(-1)!.unitPrice;
}

/** BE Vat.of: net × rate % half up, to the dong. */
export const mockVat = (net: number, rate: number) =>
  Math.round((net * Math.round(rate * 100)) / 10_000);

const bySku = (lines: readonly MockQuoteLine[], cartons: (line: MockQuoteLine) => number) => {
  const total = new Map<string, number>();
  for (const line of lines) total.set(line.sku, (total.get(line.sku) ?? 0) + cartons(line));
  return total;
};

const vndDay = (iso: string) =>
  new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(
    new Date(iso),
  );

/** QuoteResponse as the customer reads it. */
export function mockQuoteView(quote: MockQuote, now: Date) {
  const proposedBySku = bySku(quote.lines, (line) => line.cartons);
  const accepted = quote.lines.every((line) => line.acceptedCartons !== undefined);
  let goods = 0;
  let goodsTax = 0;
  let acceptedGoods = 0;
  let acceptedTax = 0;
  const lines = quote.lines.map((line) => {
    const price = mockPriceFor(line, proposedBySku.get(line.sku) ?? line.cartons);
    const net = price === null ? null : line.cartons * line.unitsPerCarton * price;
    const tax = net === null ? null : mockVat(net, line.taxRate);
    goods += net ?? 0;
    goodsTax += tax ?? 0;
    const acceptedNet =
      line.acceptedCartons !== undefined && line.acceptedUnitPrice !== undefined
        ? line.acceptedCartons * line.unitsPerCarton * line.acceptedUnitPrice
        : undefined;
    const acceptedLineTax =
      acceptedNet === undefined ? undefined : mockVat(acceptedNet, line.taxRate);
    acceptedGoods += acceptedNet ?? 0;
    acceptedTax += acceptedLineTax ?? 0;
    return {
      id: line.id,
      lineNo: line.lineNo,
      measure: "CARTON",
      sku: line.sku,
      cartons: line.cartons,
      unitsPerCarton: line.unitsPerCarton,
      units: line.cartons * line.unitsPerCarton,
      priced: line.tiers.length > 0,
      ...(line.tiers.length > 0 ? { moq: Math.min(...line.tiers.map((t) => t.minQuantity)) } : {}),
      tiers: line.tiers,
      ...(price !== null ? { proposedUnitPrice: price } : {}),
      ...(net !== null ? { proposedLineTotal: net, proposedTax: tax } : {}),
      ...(line.acceptedCartons !== undefined
        ? {
            acceptedCartons: line.acceptedCartons,
            acceptedUnits: line.acceptedCartons * line.unitsPerCarton,
            acceptedUnitPrice: line.acceptedUnitPrice,
            acceptedLineTotal: acceptedNet,
            acceptedTax: acceptedLineTax,
          }
        : {}),
      taxClass: line.taxClass,
      taxRate: line.taxRate,
    };
  });
  const fees = quote.fees.map((fee) => ({
    id: fee.id,
    kind: fee.kind,
    ...(fee.sku ? { sku: fee.sku } : {}),
    ...(fee.amount !== undefined ? { amount: fee.amount } : {}),
    ...(fee.taxClass ? { taxClass: fee.taxClass, taxRate: fee.taxRate } : {}),
    ...(fee.amount !== undefined && fee.taxRate !== undefined
      ? { tax: mockVat(fee.amount, fee.taxRate) }
      : {}),
  }));
  const feeAmount = quote.fees.reduce((sum, fee) => sum + (fee.amount ?? 0), 0);
  const feeTax = fees.reduce((sum, fee) => sum + (fee.tax ?? 0), 0);
  const proposed = {
    subtotal: goods,
    fees: feeAmount,
    tax: goodsTax + feeTax,
    total: goods + feeAmount + goodsTax + feeTax,
  };
  const acceptedTotals = accepted
    ? {
        subtotal: acceptedGoods,
        fees: feeAmount,
        tax: acceptedTax + feeTax,
        total: acceptedGoods + feeAmount + acceptedTax + feeTax,
      }
    : undefined;
  const status = mockQuoteStatusAt(quote, now);
  return {
    id: quote.id,
    quoteNumber: quote.quoteNumber,
    customerId: quote.customerId,
    status,
    revision: mockIsRevising(quote) ? lastSentRevision(quote) : quote.revision,
    validUntil: quote.validUntil,
    ...(quote.terms ? { terms: quote.terms } : {}),
    ...(quote.requestedDeliveryDate ? { requestedDeliveryDate: quote.requestedDeliveryDate } : {}),
    legacy: false,
    lines,
    fees,
    priced: quote.lines.every((line) => line.tiers.length > 0),
    proposed,
    proposedTotal: proposed.total,
    ...(acceptedTotals ? { accepted: acceptedTotals, acceptedTotal: acceptedTotals.total } : {}),
    ...(quote.sentAt ? { sentAt: quote.sentAt } : {}),
    ...(quote.respondedAt ? { respondedAt: quote.respondedAt } : {}),
    ...(quote.customerFeedback ? { customerFeedback: quote.customerFeedback } : {}),
    ...(quote.cancellationReason ? { cancellationReason: quote.cancellationReason } : {}),
    ...(quote.convertedOrder ? { convertedOrder: quote.convertedOrder } : {}),
    ...(quote.convertedAt ? { convertedAt: quote.convertedAt } : {}),
    history: quote.history,
    createdAt: quote.createdAt,
    version: quote.version,
  };
}

/** QuoteRowResponse. */
const toRow = (quote: MockQuote, now: Date) => ({
  id: quote.id,
  quoteNumber: quote.quoteNumber,
  customerId: quote.customerId,
  status: mockQuoteStatusAt(quote, now),
  revision: mockIsRevising(quote) ? lastSentRevision(quote) : quote.revision,
  validUntil: quote.validUntil,
  ...(quote.sentAt ? { sentAt: quote.sentAt } : {}),
  ...(quote.convertedOrder ? { convertedOrderId: quote.convertedOrder.orderId } : {}),
  // BE QuoteRowResponse: the order's number, left out on the customer's copy while it is a DRAFT.
  ...(quote.convertedOrder && quote.convertedOrder.status !== "DRAFT"
    ? {
        convertedOrderNumber: quote.convertedOrder.orderNumber,
        convertedOrderStatus: quote.convertedOrder.status,
      }
    : {}),
  createdAt: quote.createdAt,
  version: quote.version,
});

/** A tiny but valid one-page PDF standing for the BE's QuoteDocument. */
export function mockQuotePdf(quoteNumber: string): string {
  const text = `Bao gia ${quoteNumber} (mock)`.replace(/[()\\]/g, "");
  const stream = `BT /F1 18 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return body;
}

export interface MockQuoteBookOptions {
  now?: () => Date;
}

export function createMockQuoteBook(
  customerId: string,
  seed: MockQuote[] = mockQuoteSeed(customerId, new Date()),
  { now = () => new Date() }: MockQuoteBookOptions = {},
) {
  const quotes = seed.map((quote) => structuredClone(quote));
  // A customer sees their own quotes once sent (BE Quote.seenByCustomer): never a draft.
  const visible = (quoteId: string) =>
    quotes.find(
      (q) =>
        q.id === quoteId.toLowerCase() &&
        q.customerId === customerId &&
        (q.status !== "DRAFT" || mockIsRevising(q)) &&
        !(q.status === "CANCELLED" && !q.sentAt),
    );
  const notFound = (quoteId: string) =>
    fail(404, "NOT_FOUND", `Không tìm thấy báo giá ${quoteId}.`);

  /** BE QuoteService.lockToAnswer + Quote.requireAnswerable, in the BE's order. */
  function answerable(
    quoteId: string,
    version: unknown,
  ): { quote: MockQuote; refusal?: undefined } | { quote?: undefined; refusal: MockResult } {
    const quote = visible(quoteId);
    if (!quote) return { refusal: notFound(quoteId) };
    if (quote.status === "CANCELLED") {
      return {
        refusal: fail(
          409,
          "INVALID_QUOTE_TRANSITION",
          `Báo giá ${quote.quoteNumber} đã bị huỷ: ${quote.cancellationReason ?? ""}`,
        ),
      };
    }
    // BE lockToAnswer checks the revision in progress before the version (refusal.quote.beingRevised).
    if (mockIsRevising(quote)) {
      return {
        refusal: fail(
          409,
          "INVALID_QUOTE_TRANSITION",
          `Báo giá ${quote.quoteNumber} đang được Sale sửa theo yêu cầu của bạn: chưa thể trả lời, hãy chờ bản sửa mới.`,
        ),
      };
    }
    if (version !== quote.version) {
      return {
        refusal: fail(
          409,
          "OPTIMISTIC_LOCK",
          `Báo giá ${quote.quoteNumber} vừa được người khác thay đổi: tải lại rồi thử lại.`,
        ),
      };
    }
    const status = mockQuoteStatusAt(quote, now());
    if (status === "EXPIRED") {
      return {
        refusal: fail(
          409,
          "QUOTE_EXPIRED",
          `Báo giá ${quote.quoteNumber} chỉ có hiệu lực đến ${vndDay(quote.validUntil)} và đã hết hiệu lực.`,
        ),
      };
    }
    if (status !== "SENT") {
      return {
        refusal: fail(
          409,
          "INVALID_QUOTE_TRANSITION",
          `Báo giá ${quote.quoteNumber} đang ở trạng thái ${STATUS_LABEL[status]}: không thể trả lời lúc này.`,
        ),
      };
    }
    return { quote };
  }

  function answered(quote: MockQuote, to: MockQuoteStatus, reason?: string) {
    const at = now().toISOString();
    quote.history.push({
      revision: quote.revision,
      fromStatus: quote.status,
      toStatus: to,
      ...(reason ? { reason } : {}),
      changedAt: at,
    });
    quote.status = to;
    quote.respondedAt = at;
    quote.version += 1;
    return ok(mockQuoteView(quote, now()));
  }

  /** The accepted cartons per line id, or the refusal (BE Quote.accept). */
  function accept(quoteId: string, version: unknown, asked: Map<string, number>): MockResult {
    const { quote, refusal } = answerable(quoteId, version);
    if (refusal) return refusal;
    for (const lineId of asked.keys()) {
      if (!quote.lines.some((line) => line.id === lineId)) {
        return fail(400, "VALIDATION_FAILED", `Có dòng không thuộc báo giá ${quote.quoteNumber}.`);
      }
    }
    const chosen = (line: MockQuoteLine) => asked.get(line.id) ?? line.cartons;
    const totals = bySku(quote.lines, chosen);
    for (const line of quote.lines) {
      const cartons = totals.get(line.sku)!;
      if (mockPriceFor(line, cartons) === null) {
        const moq = Math.min(...line.tiers.map((t) => t.minQuantity));
        return fail(
          409,
          "QUOTE_BELOW_MOQ",
          `Dòng ${line.lineNo} (${line.sku}): ${cartons} thùng thấp hơn số lượng đặt tối thiểu (MOQ) là ${moq} thùng.`,
          { details: { lineNo: line.lineNo, sku: line.sku, cartons, moq } },
        );
      }
    }
    for (const line of quote.lines) {
      line.acceptedCartons = chosen(line);
      line.acceptedUnitPrice = mockPriceFor(line, totals.get(line.sku)!)!;
    }
    return answered(quote, "ACCEPTED");
  }

  function requestChanges(quoteId: string, version: unknown, text: unknown): MockResult {
    const feedback = typeof text === "string" ? text.trim() : "";
    if (!feedback || feedback.length > 2000) {
      return fail(400, "VALIDATION_FAILED", "Hãy ghi rõ cần sửa gì (tối đa 2000 ký tự).", {
        fieldErrors: [
          {
            field: "feedback",
            message: "Hãy ghi rõ cần sửa gì (tối đa 2000 ký tự).",
            code: "Size",
          },
        ],
      });
    }
    const { quote, refusal } = answerable(quoteId, version);
    if (refusal) return refusal;
    quote.customerFeedback = feedback;
    return answered(quote, "CHANGES_REQUESTED", feedback);
  }

  return {
    customerId,

    /** GET /quotes?status=&page=&size= — newest first; EXPIRED filters the SENT ones past validity. */
    page(query: { status?: unknown; page?: unknown; size?: unknown } = {}): MockResult {
      const page = query.page === undefined ? 0 : Number(query.page);
      const size = query.size === undefined ? 20 : Number(query.size);
      if (
        !Number.isInteger(page) ||
        page < 0 ||
        !Number.isInteger(size) ||
        size < 1 ||
        size > 200
      ) {
        return fail(400, "UNSUPPORTED_PARAMETER", "page must be >= 0 and size between 1 and 200");
      }
      const wanted = [query.status].flat().filter((s): s is string => typeof s === "string");
      const at = now();
      const mine = quotes
        .filter((q) => visible(q.id))
        .filter((q) => wanted.length === 0 || wanted.includes(mockQuoteStatusAt(q, at)))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const totalPages = Math.ceil(mine.length / size);
      return ok({
        items: mine.slice(page * size, (page + 1) * size).map((q) => toRow(q, at)),
        page,
        size,
        totalElements: mine.length,
        totalPages,
        hasNext: page + 1 < totalPages,
        hasPrevious: page > 0,
      });
    },

    /** GET /quotes/{id} */
    get(quoteId: string): MockResult {
      const quote = visible(quoteId);
      return quote ? ok(mockQuoteView(quote, now())) : notFound(quoteId);
    },

    /** GET /quotes/{id}/document: the PDF itself (not an envelope), or the 404 envelope. */
    document(quoteId: string): MockResult {
      const quote = visible(quoteId);
      if (!quote) return notFound(quoteId);
      return {
        status: 200,
        data: new Blob([mockQuotePdf(quote.quoteNumber)], { type: "application/pdf" }),
      };
    },

    /** POST /quotes/{id}/acceptance `{ version, lines?: [{ lineId, cartons }] }`. */
    accept(quoteId: string, body: Record<string, unknown> = {}): MockResult {
      const lines = body.lines;
      const fieldErrors: FieldError[] = [];
      if (typeof body.version !== "number") {
        fieldErrors.push({
          field: "version",
          message: "Thiếu phiên bản báo giá.",
          code: "NotNull",
        });
      }
      const asked = new Map<string, number>();
      if (Array.isArray(lines)) {
        lines.forEach((entry: unknown, index) => {
          const line = (entry ?? {}) as { lineId?: unknown; cartons?: unknown };
          if (typeof line.lineId !== "string") {
            fieldErrors.push({
              field: `lines[${index}].lineId`,
              message: "Thiếu dòng.",
              code: "NotNull",
            });
          }
          if (
            typeof line.cartons !== "number" ||
            !Number.isInteger(line.cartons) ||
            line.cartons < 1
          ) {
            fieldErrors.push({
              field: `lines[${index}].cartons`,
              message: "Số thùng phải từ 1 trở lên.",
              code: "Min",
            });
          }
          if (typeof line.lineId === "string" && typeof line.cartons === "number") {
            asked.set(line.lineId, line.cartons);
          }
        });
      }
      if (fieldErrors.length > 0) {
        return fail(400, "VALIDATION_FAILED", "Dữ liệu không hợp lệ.", { fieldErrors });
      }
      return accept(quoteId, body.version, asked);
    },

    /** POST /quotes/{id}/change-request `{ version, feedback }`. */
    requestChanges(quoteId: string, body: Record<string, unknown> = {}): MockResult {
      return requestChanges(quoteId, body.version, body.feedback);
    },

    /** Chat C10 on a QUOTE card: the same rules, the card's own body shape. */
    cardAction(
      quoteId: string,
      action: "ACCEPT" | "REQUEST_CHANGES",
      body: { version?: number; cartons?: Record<string, number>; note?: string },
    ): MockResult {
      if (action === "REQUEST_CHANGES") return requestChanges(quoteId, body.version, body.note);
      return accept(quoteId, body.version, new Map(Object.entries(body.cartons ?? {})));
    },

    /** The QUOTE card payload (B.7.3) of a quote as it is now; null for an unknown or unsent one. */
    cardPayload(quoteId: string): Record<string, unknown> | null {
      const quote = visible(quoteId);
      if (!quote) return null;
      const view = mockQuoteView(quote, now());
      return {
        id: view.id,
        quoteId: view.id,
        number: view.quoteNumber,
        status: view.status,
        revision: view.revision,
        validUntil: view.validUntil,
        ...(view.requestedDeliveryDate
          ? { requestedDeliveryDate: view.requestedDeliveryDate }
          : {}),
        lines: view.lines.map((line) => ({
          id: line.id,
          lineNo: line.lineNo,
          sku: line.sku,
          cartons: line.cartons,
          unitsPerCarton: line.unitsPerCarton,
          units: line.units,
          ...(line.proposedUnitPrice !== undefined ? { unitPrice: line.proposedUnitPrice } : {}),
          ...(line.proposedLineTotal !== undefined ? { lineTotal: line.proposedLineTotal } : {}),
          ...(line.acceptedCartons !== undefined ? { acceptedCartons: line.acceptedCartons } : {}),
        })),
        proposedTotal: view.proposedTotal,
        ...(view.acceptedTotal !== undefined ? { acceptedTotal: view.acceptedTotal } : {}),
        ...(quote.convertedOrder
          ? {
              convertedOrderId: quote.convertedOrder.orderId,
              convertedOrderNumber: quote.convertedOrder.orderNumber,
            }
          : {}),
        ...(view.sentAt ? { sentAt: view.sentAt } : {}),
        version: view.version,
        currency: "VND",
      };
    },

    /** Test hook: the quote as stored. */
    stored: (quoteId: string): Readonly<MockQuote> | undefined =>
      quotes.find((q) => q.id === quoteId),
  };
}

export type MockQuoteBook = ReturnType<typeof createMockQuoteBook>;

/** The order the CONVERTED quote became (seeded PENDING_CONTRACT in orders.ts). */
export const MOCK_CONVERTED_ORDER = {
  orderId: MOCK_PENDING_CONTRACT_ORDER_ID,
  orderNumber: "SO-20260910-900001",
  status: "PENDING_CONTRACT",
  total: 76_140_000,
};

/* ── Seed ─────────────────────────────────────────────────────────────── */

const DAY = 86_400_000;
const lineId = (n: number) => `5a1e1100-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const feeId = (n: number) => `5a1e2200-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
/** The customer's cup of DS-02a: 1.000 cups a carton, 20/50/100 cartons = 1.250/1.150/1.050 đ. */
const CUP_TIERS: MockQuoteTier[] = [
  { minQuantity: 20, unitPrice: 1250 },
  { minQuantity: 50, unitPrice: 1150 },
  { minQuantity: 100, unitPrice: 1050 },
];
const VAT = { taxClass: "STANDARD", taxRate: 8 };

/** The seeded ids: the demo story's (wf02.ts), a draft and another customer's quote. */
export const MOCK_QUOTE_SEED_IDS = {
  ...MOCK_QUOTE_IDS,
  draft: "5a1e0000-0000-4000-8000-000000000005",
  /** Sent, asked to change, then reopened by Sale: the customer reads it as CHANGES_REQUESTED. */
  revising: "5a1e0000-0000-4000-8000-000000000008",
  foreign: "5a1e0000-0000-4000-8000-000000000006",
};

/**
 * The demo customer's quotes, one per state they meet (ids: `MOCK_QUOTE_IDS` of wf02.ts), plus a
 * draft of theirs and a quote of another customer — both 404 to them. Dates follow `now`.
 */
export function mockQuoteSeed(
  customerId: string,
  now: Date,
  ids = MOCK_QUOTE_SEED_IDS,
): MockQuote[] {
  const at = (days: number) => new Date(now.getTime() + days * DAY).toISOString();
  const day = (days: number) => at(days).slice(0, 10);
  const sent = (days: number, validDays: number) => ({
    createdAt: at(days - 1),
    sentAt: at(days),
    validUntil: at(days + validDays),
  });
  return [
    {
      // SENT and valid: two lines (a tiered cup produced for the first time, a lid) and its plate fee.
      id: ids.sent,
      quoteNumber: "QT-20261118-0105",
      customerId,
      status: "SENT",
      revision: 1,
      ...sent(-1, 14),
      terms: "Giá đã gồm in 2 màu theo thiết kế đã duyệt. Giao tại kho của khách trong TP.HCM.",
      requestedDeliveryDate: day(21),
      lines: [
        {
          id: lineId(1),
          lineNo: 1,
          sku: "LY-GIAY-DEMO-16OZ-DO",
          cartons: 60,
          unitsPerCarton: 1000,
          tiers: CUP_TIERS,
          ...VAT,
        },
        {
          id: lineId(2),
          lineNo: 2,
          sku: "NAP-LY-DEMO-90-TRANG",
          cartons: 30,
          unitsPerCarton: 2000,
          tiers: [
            { minQuantity: 10, unitPrice: 180 },
            { minQuantity: 50, unitPrice: 160 },
          ],
          ...VAT,
        },
      ],
      fees: [
        { id: feeId(1), kind: "PLATE_FEE", sku: "LY-GIAY-DEMO-16OZ-DO", amount: 1_500_000, ...VAT },
      ],
      history: [
        { revision: 1, toStatus: "DRAFT", changedAt: at(-2) },
        { revision: 1, fromStatus: "DRAFT", toStatus: "SENT", changedAt: at(-1) },
      ],
      version: 3,
    },
    {
      id: ids.changesRequested,
      quoteNumber: "QT-20261112-0098",
      customerId,
      status: "CHANGES_REQUESTED",
      revision: 1,
      ...sent(-6, 14),
      respondedAt: at(-4),
      customerFeedback: "Xin giảm đơn giá bậc 50 thùng xuống 1.100 đ/cái.",
      lines: [
        {
          id: lineId(3),
          lineNo: 1,
          sku: "LY-GIAY-DEMO-12OZ-XANH",
          cartons: 50,
          unitsPerCarton: 1000,
          tiers: CUP_TIERS,
          ...VAT,
        },
      ],
      fees: [],
      history: [
        { revision: 1, toStatus: "DRAFT", changedAt: at(-7) },
        { revision: 1, fromStatus: "DRAFT", toStatus: "SENT", changedAt: at(-6) },
        {
          revision: 1,
          fromStatus: "SENT",
          toStatus: "CHANGES_REQUESTED",
          reason: "Xin giảm đơn giá bậc 50 thùng xuống 1.100 đ/cái.",
          changedAt: at(-4),
        },
      ],
      version: 4,
    },
    {
      // Stored SENT, read EXPIRED: its validity ended two days ago (BE Quote.statusAt).
      id: ids.expired,
      quoteNumber: "QT-20261020-0061",
      customerId,
      status: "SENT",
      revision: 2,
      ...sent(-16, 14),
      lines: [
        {
          id: lineId(4),
          lineNo: 1,
          sku: "LY-GIAY-DEMO-12OZ-XANH",
          cartons: 20,
          unitsPerCarton: 1000,
          tiers: CUP_TIERS,
          ...VAT,
        },
      ],
      fees: [],
      history: [
        { revision: 1, toStatus: "DRAFT", changedAt: at(-30) },
        { revision: 2, fromStatus: "CHANGES_REQUESTED", toStatus: "DRAFT", changedAt: at(-17) },
        { revision: 2, fromStatus: "DRAFT", toStatus: "SENT", changedAt: at(-16) },
      ],
      version: 6,
    },
    {
      // DS-02a: 60 cartons accepted at 1.150 đ, plate fee 1.500.000 đ → 76.140.000 đ; its order's
      // contract is SENT, so the customer sees the order (BE QuoteService.view).
      id: ids.converted,
      quoteNumber: "QT-20260905-9001",
      customerId,
      status: "CONVERTED",
      revision: 1,
      createdAt: "2026-09-05T02:00:00Z",
      sentAt: "2026-09-06T02:00:00Z",
      validUntil: "2026-09-20T02:00:00Z",
      respondedAt: "2026-09-08T03:00:00Z",
      requestedDeliveryDate: "2026-10-01",
      lines: [
        {
          id: lineId(5),
          lineNo: 1,
          sku: "LY-GIAY-DEMO-12OZ-XANH",
          cartons: 60,
          unitsPerCarton: 1000,
          tiers: CUP_TIERS,
          ...VAT,
          acceptedCartons: 60,
          acceptedUnitPrice: 1150,
        },
      ],
      fees: [
        {
          id: feeId(2),
          kind: "PLATE_FEE",
          sku: "LY-GIAY-DEMO-12OZ-XANH",
          amount: 1_500_000,
          ...VAT,
        },
      ],
      convertedOrder: MOCK_CONVERTED_ORDER,
      convertedAt: "2026-09-10T03:00:00Z",
      history: [
        { revision: 1, toStatus: "DRAFT", changedAt: "2026-09-05T02:00:00Z" },
        { revision: 1, fromStatus: "DRAFT", toStatus: "SENT", changedAt: "2026-09-06T02:00:00Z" },
        {
          revision: 1,
          fromStatus: "SENT",
          toStatus: "ACCEPTED",
          changedAt: "2026-09-08T03:00:00Z",
        },
        {
          revision: 1,
          fromStatus: "ACCEPTED",
          toStatus: "CONVERTED",
          changedAt: "2026-09-10T03:00:00Z",
        },
      ],
      version: 5,
    },
    {
      // Sales' working draft: never shown to the customer (404).
      id: ids.draft,
      quoteNumber: "QT-20261118-0106",
      customerId,
      status: "DRAFT",
      revision: 1,
      createdAt: at(0),
      validUntil: at(14),
      lines: [
        {
          id: lineId(6),
          lineNo: 1,
          sku: "LY-GIAY-DEMO-12OZ-XANH",
          cartons: 40,
          unitsPerCarton: 1000,
          tiers: CUP_TIERS,
          ...VAT,
        },
      ],
      fees: [],
      history: [{ revision: 1, toStatus: "DRAFT", changedAt: at(0) }],
      version: 1,
    },
    {
      // Reopened by Sale after the customer asked for changes (BE PR #388): stored DRAFT with a
      // `sentAt`, revision 2; the customer reads it as CHANGES_REQUESTED, revision 1, validity of the
      // sent revision, and the history carries the DRAFT rows the page must hide.
      id: ids.revising,
      quoteNumber: "QT-20261110-0092",
      customerId,
      status: "DRAFT",
      revision: 2,
      ...sent(-8, 14),
      respondedAt: at(-5),
      customerFeedback: "Xin thêm mốc giá cho 200 thùng.",
      lines: [
        {
          id: lineId(8),
          lineNo: 1,
          sku: "LY-GIAY-DEMO-12OZ-XANH",
          cartons: 40,
          unitsPerCarton: 1000,
          tiers: CUP_TIERS,
          ...VAT,
        },
      ],
      fees: [],
      history: [
        { revision: 1, toStatus: "DRAFT", changedAt: at(-9) },
        { revision: 1, fromStatus: "DRAFT", toStatus: "SENT", changedAt: at(-8) },
        {
          revision: 1,
          fromStatus: "SENT",
          toStatus: "CHANGES_REQUESTED",
          reason: "Xin thêm mốc giá cho 200 thùng.",
          changedAt: at(-5),
        },
        { revision: 2, fromStatus: "CHANGES_REQUESTED", toStatus: "DRAFT", changedAt: at(-1) },
      ],
      version: 5,
    },
    {
      // Another customer's quote: 404 to this one.
      id: ids.foreign,
      quoteNumber: "QT-20261118-0107",
      customerId: "CUS-OTHER",
      status: "SENT",
      revision: 1,
      ...sent(-1, 14),
      lines: [
        {
          id: lineId(7),
          lineNo: 1,
          sku: "LY-KHAC-12OZ",
          cartons: 30,
          unitsPerCarton: 1000,
          tiers: CUP_TIERS,
          ...VAT,
        },
      ],
      fees: [],
      history: [{ revision: 1, toStatus: "SENT", changedAt: at(-1) }],
      version: 2,
    },
  ];
}
