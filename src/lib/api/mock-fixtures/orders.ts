/**
 * In-memory customer order history that mirrors the BE contract, for USE_MOCK=true and tests.
 *
 * Shapes follow `CustomerOrderCardResponse` (list), `CustomerOrderDetailResponse` (detail) and
 * `PageResponse`; rules follow `order.internal.controller.OrderController` and
 * `order.api.OrderStatus` (develop):
 *  - GET /orders/me pages are zero-based, sorted by lastModifiedAt DESC; page < 0 or size < 1 → 400;
 *  - GET /orders/me/{orderId}: another customer's order answers 404 NOT_FOUND (the BE hides it);
 *  - POST /orders/{id}/cancellation (OrderServiceImpl.cancelOwn): DRAFT, PENDING_PAYMENT and
 *    CONFIRMED are cancelled at once (200 CANCELLED); IN_PRODUCTION, READY_TO_FULFILL,
 *    IN_FULFILMENT and ON_HOLD record a request Sales decide (202 REQUESTED, one at a time:
 *    409 ORDER_CANCELLATION_REQUEST_PENDING); later statuses are 409 ORDER_NOT_CANCELLABLE;
 *  - POST /orders (OrderServiceImpl.place) prices the SKU's total quantity from the catalogue,
 *    refuses a price the client did not expect (409 CHECKOUT_PRICE_CHANGED), holds stock
 *    (409 INSUFFICIENT_STOCK), takes the customer's default payment term, and is idempotent on
 *    `requestId`.
 * NON_NULL serialisation: absent optional fields are omitted, never sent as null.
 * Intentionally independent from mock-data.ts (legacy, non-BE shapes).
 */

import type { MockCatalog } from "./catalog";

export type MockOrderStatus =
  | "DRAFT"
  | "PENDING_PAYMENT"
  | "CONFIRMED"
  | "IN_PRODUCTION"
  | "READY_TO_FULFILL"
  | "IN_FULFILMENT"
  | "ON_HOLD"
  | "SHIPPED"
  | "DELIVERED"
  | "COMPLETED"
  | "CANCELLED"
  | "RETURNED";

export interface MockOrderAddress {
  recipientName: string;
  phone: string;
  line1: string;
  line2?: string;
  wardCode: string;
  wardName: string;
  provinceCode: string;
  provinceName: string;
  countryCode: string;
  postalCode?: string;
}

export interface MockOrderLine {
  lineId: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  reservationIds: string[];
  designSnapshotId?: string;
  designChecksum?: string;
}

export type MockPaymentTerm = "PREPAID" | "DEPOSIT" | "CREDIT";

export interface MockHistoryEntry {
  status: MockOrderStatus;
  occurredAt: string;
  reasonCode?: string;
}

export interface MockCancellationRequest {
  requestId: string;
  reasonCode: string;
  note?: string;
  requestedAt: string;
}

export interface MockOrder {
  orderId: string;
  orderNumber: string;
  customerId: string;
  status: MockOrderStatus;
  totalAmount: number;
  currency: "VND";
  lines: MockOrderLine[];
  placedAt: string;
  createdBy?: string;
  lastModifiedAt: string;
  lastModifiedBy?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  shippingAddress?: MockOrderAddress;
  billingAddress?: MockOrderAddress;
  /** Idempotency key of the checkout that placed it (absent on seeded history). */
  requestId?: string;
  paymentTerm: MockPaymentTerm;
  paidAmount: number;
  depositRequired?: number;
  creditTermDays?: number;
  /** Status changes, oldest first (BE order status history). */
  history: MockHistoryEntry[];
  cancellationReasonCode?: string;
  /** A customer's cancellation request waiting for Sales; the BE gives the customer no read of it. */
  pendingCancellation?: MockCancellationRequest;
  /** Stock was held by this mock when the order was placed, so cancelling gives it back. */
  stockHeld?: boolean;
}

/** The customer's commercial terms, as the BE's CreditTerms (the customer cannot read them). */
export interface MockCreditTerms {
  defaultTerm: MockPaymentTerm;
  allowed: readonly MockPaymentTerm[];
  depositPercent: number;
  creditLimit: number;
  creditTermDays: number;
}

export const DEFAULT_MOCK_TERMS: MockCreditTerms = {
  defaultTerm: "PREPAID",
  allowed: ["PREPAID", "DEPOSIT"],
  depositPercent: 30,
  creditLimit: 0,
  creditTermDays: 30,
};

export interface MockResult {
  status: number;
  data: unknown;
}

const ok = (data?: unknown, status = 200): MockResult => ({
  status,
  data: {
    success: true,
    ...(data === undefined ? {} : { data }),
    timestamp: new Date().toISOString(),
  },
});

const fail = (
  status: number,
  errorCode: string,
  message: string,
  fieldErrors?: Array<{ field: string; message: string; code?: string }>,
): MockResult => ({
  status,
  data: {
    success: false,
    errorCode,
    message,
    ...(fieldErrors ? { fieldErrors } : {}),
    correlationId: `mock-${Date.now()}`,
    timestamp: new Date().toISOString(),
  },
});

// BE OrderStatus#customerMayCancelDirectly — kept here because lib/ must not import features/.
const CANCELLABLE = new Set<MockOrderStatus>(["DRAFT", "PENDING_PAYMENT", "CONFIRMED"]);
// OrderStatus#canTransitionTo(CANCELLED) for the rest: the customer may ask (202).
const REQUESTABLE = new Set<MockOrderStatus>([
  "IN_PRODUCTION",
  "READY_TO_FULFILL",
  "IN_FULFILMENT",
  "ON_HOLD",
]);
// CustomerOrdersService.PAST_PRODUCTION: printing, if any, is over.
const PAST_PRODUCTION = new Set<MockOrderStatus>([
  "READY_TO_FULFILL",
  "IN_FULFILMENT",
  "SHIPPED",
  "DELIVERED",
  "COMPLETED",
  "RETURNED",
]);

const CANCELLATION_REASON_CODES = [
  "CUSTOMER_REQUEST",
  "PAYMENT_NOT_RECEIVED",
  "PAYMENT_FAILED",
  "OUT_OF_STOCK",
  "SUSPECTED_FRAUD",
  "CREDIT_REJECTED",
  "DUPLICATE_ORDER",
  "PRODUCTION_ISSUE",
  "OTHER",
];

// BE CustomerOrdersService#statusGroup / #deliveryState.
function statusGroup(status: MockOrderStatus): string {
  switch (status) {
    case "DRAFT":
    case "PENDING_PAYMENT":
      return "AWAITING_PAYMENT";
    case "ON_HOLD":
      return "UNDER_REVIEW";
    case "READY_TO_FULFILL":
    case "IN_FULFILMENT":
      return "PREPARING";
    case "SHIPPED":
      return "SHIPPING";
    case "DELIVERED":
    case "COMPLETED":
      return "DELIVERED";
    default:
      return status; // CONFIRMED, IN_PRODUCTION, CANCELLED, RETURNED share their name
  }
}

function deliveryState(status: MockOrderStatus): string {
  if (status === "SHIPPED") return "IN_TRANSIT";
  if (status === "DELIVERED" || status === "COMPLETED") return "DELIVERED";
  return status === "RETURNED" ? "RETURNED" : "NOT_SHIPPED";
}

/** CustomerOrdersService#production: every line has one; stock goods are NOT_REQUIRED. */
function production(order: MockOrder, line: MockOrderLine) {
  if (!line.designSnapshotId) return { state: "NOT_REQUIRED", goodQuantity: 0 };
  const produced = order.status === "IN_PRODUCTION" ? Math.floor(line.quantity / 2) : line.quantity;
  if (order.status === "CANCELLED") return { state: "CANCELLED", goodQuantity: 0 };
  if (PAST_PRODUCTION.has(order.status)) return { state: "DONE", goodQuantity: line.quantity };
  if (order.status === "IN_PRODUCTION") return { state: "IN_PROGRESS", goodQuantity: produced };
  return { state: "NOT_STARTED", goodQuantity: 0 };
}

/** payment.status (kltn-docs 15 §5.2), derived from what has arrived. */
function paymentStatus(order: MockOrder): string {
  if (order.paymentTerm === "CREDIT") return "ON_CREDIT";
  if (order.paidAmount <= 0) return "UNPAID";
  return order.paidAmount >= order.totalAmount ? "PAID" : "PARTIALLY_PAID";
}

/** CustomerOrderCardResponse. */
const toCard = (order: MockOrder) => ({
  orderId: order.orderId,
  orderNumber: order.orderNumber,
  status: order.status,
  statusGroup: statusGroup(order.status),
  total: order.totalAmount,
  currency: order.currency,
  placedAt: order.placedAt,
  lineCount: order.lines.length,
  deliveryState: deliveryState(order.status),
});

/** CustomerOrderDetailResponse: no reservations, checksums, actors or contact block. */
const toDetail = (order: MockOrder) => {
  const { lineCount: _lineCount, ...card } = toCard(order);
  return {
    ...card,
    // Set only while ON_HOLD: a credit hold waits for an approver, any other is a plain review.
    ...(order.status === "ON_HOLD"
      ? {
          holdReasonPublic:
            order.paymentTerm === "CREDIT" ? "AWAITING_CREDIT_APPROVAL" : "UNDER_REVIEW",
        }
      : {}),
    paymentTerm: order.paymentTerm,
    ...(order.shippingAddress ? { shippingAddress: order.shippingAddress } : {}),
    payment: {
      status: paymentStatus(order),
      paidAmount: order.paidAmount,
      ...(order.depositRequired !== undefined ? { depositRequired: order.depositRequired } : {}),
      ...(order.creditTermDays !== undefined ? { creditTermDays: order.creditTermDays } : {}),
    },
    lines: order.lines.map((line) => ({
      lineId: line.lineId,
      sku: line.sku,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      lineTotal: line.lineTotal,
      ...(line.designSnapshotId ? { designSnapshotId: line.designSnapshotId } : {}),
      production: production(order, line),
    })),
    timeline: order.history.map((entry) => ({
      status: entry.status,
      statusGroup: statusGroup(entry.status),
      occurredAt: entry.occurredAt,
      // Only the cancellation step carries a reason code; the free-text note is never exposed.
      ...(entry.reasonCode ? { reasonCode: entry.reasonCode } : {}),
    })),
  };
};

/** OrderResponse as POST /orders and the cancellation answer return it (the part the FE reads). */
const toPlaced = (order: MockOrder) => ({
  orderId: order.orderId,
  orderNumber: order.orderNumber,
  customerId: order.customerId,
  status: order.status,
  totalAmount: order.totalAmount,
  currency: order.currency,
  lines: order.lines.map((line) => ({
    lineId: line.lineId,
    sku: line.sku,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    lineTotal: line.lineTotal,
    reservationIds: line.reservationIds,
  })),
  placedAt: order.placedAt,
  lastModifiedAt: order.lastModifiedAt,
  paymentTerm: order.paymentTerm,
  paymentStatus: paymentStatus(order),
});

const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 20;
const NOTE_MAX = 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toInt(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  return Number.isInteger(n) ? n : Number.NaN;
}

const orderNumberFor = (placed: Date, sequence: number) => {
  // Order numbers carry the Vietnam calendar day (UTC+7), like the date the customer sees.
  const day = new Date(placed.getTime() + 7 * 3_600_000)
    .toISOString()
    .slice(0, 10)
    .replaceAll("-", "");
  return `SO-${day}-${String(sequence).padStart(6, "0")}`;
};

/** What the book needs from the rest of the mock BE: stock, prices, and the address book. */
export interface MockOrderDeps {
  catalog?: MockCatalog;
  /** The customer's saved SHIPPING address with this id, if any. */
  shippingAddress?: (addressId: string) => MockOrderAddress | undefined;
  /** The customer's default SHIPPING address id, if any. */
  defaultShippingAddressId?: () => string | undefined;
  terms?: MockCreditTerms;
}

export function createMockOrderBook(
  customerId: string,
  seed: MockOrder[],
  deps: MockOrderDeps = {},
) {
  const orders = seed.map((order) => structuredClone(order));
  const terms = deps.terms ?? DEFAULT_MOCK_TERMS;
  let sequence = 1000;
  const own = (orderId: string) =>
    orders.find((o) => o.orderId === orderId && o.customerId === customerId);
  const notFound = (orderId: string) => fail(404, "NOT_FOUND", `No order with id ${orderId}`);

  /** BE PlaceOrderRequest bean validation, plus OrderWebMapper.wholeVnd. */
  function validatePlace(body: Record<string, unknown>) {
    const errors: Array<{ field: string; message: string; code: string }> = [];
    if (typeof body.requestId !== "string" || !UUID_RE.test(body.requestId)) {
      errors.push({ field: "requestId", message: "requestId is required", code: "NotNull" });
    }
    if (typeof body.customerId !== "string" || !UUID_RE.test(body.customerId)) {
      errors.push({ field: "customerId", message: "customerId is required", code: "NotNull" });
    }
    const lines = Array.isArray(body.lines) ? (body.lines as Array<Record<string, unknown>>) : [];
    if (lines.length === 0) {
      errors.push({
        field: "lines",
        message: "An order needs at least one line",
        code: "NotEmpty",
      });
    }
    let fractional = false;
    lines.forEach((line, i) => {
      if (typeof line.sku !== "string" || !line.sku.trim()) {
        errors.push({ field: `lines[${i}].sku`, message: "sku is required", code: "NotBlank" });
      }
      if (!Number.isInteger(line.quantity) || (line.quantity as number) < 1) {
        errors.push({
          field: `lines[${i}].quantity`,
          message: "quantity must be at least 1",
          code: "Min",
        });
      }
      if (typeof line.unitPrice !== "number" || line.unitPrice < 0) {
        errors.push({
          field: `lines[${i}].unitPrice`,
          message: "unitPrice must not be negative",
          code: "DecimalMin",
        });
      } else if (!Number.isInteger(line.unitPrice)) {
        fractional = true; // OrderWebMapper.wholeVnd: VALIDATION_FAILED without a field
      }
    });
    if (errors.length === 0 && fractional) return { wholeVnd: false as const };
    return errors.length ? { errors } : { lines };
  }

  const releaseStock = (order: MockOrder) => {
    if (!order.stockHeld || !deps.catalog) return;
    for (const line of order.lines) deps.catalog.release(line.sku, line.quantity);
    order.stockHeld = false;
  };

  return {
    customerId,

    /** GET /orders/me?page=&size= */
    page(query: { page?: unknown; size?: unknown } = {}): MockResult {
      const page = toInt(query.page, 0);
      const size = toInt(query.size, DEFAULT_PAGE_SIZE);
      // Same refusals as BE Pages.of: negative page, size < 1, size above the 200 cap.
      if (!(page >= 0) || !(size >= 1) || size > MAX_PAGE_SIZE) {
        return fail(
          400,
          "UNSUPPORTED_PARAMETER",
          `page must be >= 0 and size between 1 and ${MAX_PAGE_SIZE}`,
        );
      }
      const mine = orders
        .filter((o) => o.customerId === customerId)
        .sort((a, b) => b.lastModifiedAt.localeCompare(a.lastModifiedAt));
      const totalPages = Math.ceil(mine.length / size);
      return ok({
        items: mine.slice(page * size, (page + 1) * size).map(toCard),
        page,
        size,
        totalElements: mine.length,
        totalPages,
        hasNext: page + 1 < totalPages,
        hasPrevious: page > 0,
      });
    },

    /** GET /orders/me/{orderId} */
    get(orderId: string): MockResult {
      const order = own(orderId);
      return order ? ok(toDetail(order)) : notFound(orderId);
    },

    /** POST /orders — the checkout: one transaction, nothing is left behind on a refusal. */
    place(body: Record<string, unknown>): MockResult {
      const catalog = deps.catalog;
      if (!catalog) return fail(501, "INTERNAL_ERROR", "The mock order book has no catalogue");
      // Controller: a customerId that is not the caller's is hidden behind a plain 404.
      if (typeof body.customerId === "string" && body.customerId !== customerId) {
        return fail(404, "NOT_FOUND", "Resource not found");
      }
      const checked = validatePlace(body);
      if ("wholeVnd" in checked) return fail(400, "VALIDATION_FAILED", "Invalid request data");
      if ("errors" in checked)
        return fail(400, "VALIDATION_FAILED", "Dữ liệu không hợp lệ", checked.errors);
      const requestId = body.requestId as string;

      // Idempotency first: the original order comes back, whatever the new request says.
      const already = orders.find((o) => o.requestId === requestId);
      if (already) {
        return already.customerId === customerId
          ? ok(toPlaced(already), 201)
          : fail(
              422,
              "IDEMPOTENCY_KEY_REUSED",
              "This idempotency key was already used for a different request",
            );
      }

      const lines = checked.lines.map((l) => ({
        sku: String(l.sku).trim().toUpperCase(),
        quantity: l.quantity as number,
        unitPrice: l.unitPrice as number,
      }));
      // SCRUM-428: a SKU is priced on the order's total of it; the client's price is only what it expects.
      const totals = new Map<string, number>();
      for (const l of lines) totals.set(l.sku, (totals.get(l.sku) ?? 0) + l.quantity);
      const prices = new Map<string, number>();
      for (const [sku, total] of totals) {
        const priced = catalog.checkoutPrice(sku, total);
        if ("error" in priced) {
          return priced.error === "NOT_PURCHASABLE"
            ? fail(
                409,
                "PRODUCT_NOT_PURCHASABLE",
                "This product is not currently available for purchase",
              )
            : priced.error === "NO_PRICE"
              ? fail(409, "PRICE_NOT_AVAILABLE", "No selling price is available for this SKU")
              : fail(
                  409,
                  "CUSTOMER_PRICE_BELOW_MOQ",
                  "The quantity is below this customer's price list minimum for the SKU; ask Sales for a quote",
                );
        }
        prices.set(sku, priced.price);
      }
      if (lines.some((l) => prices.get(l.sku) !== l.unitPrice)) {
        return fail(
          409,
          "CHECKOUT_PRICE_CHANGED",
          "The selling price changed; review the basket and confirm again",
        );
      }

      const addressId =
        typeof body.shippingAddressId === "string"
          ? body.shippingAddressId
          : deps.defaultShippingAddressId?.();
      if (!addressId)
        return fail(
          409,
          "SHIPPING_ADDRESS_REQUIRED",
          "Add a shipping address before placing an order",
        );
      const shipping = deps.shippingAddress?.(addressId);
      if (!shipping) return fail(404, "ADDRESS_NOT_FOUND", "Address not found");

      const term = terms.defaultTerm; // the request carries no term: the customer's default applies
      if (!terms.allowed.includes(term) && !(term === "CREDIT" && terms.creditLimit > 0)) {
        return fail(409, "PAYMENT_TERM_NOT_ALLOWED", `Customer may not be sold on ${term} terms`);
      }

      // inventory.reserve: all or nothing.
      const held: typeof lines = [];
      for (const l of lines) {
        if (!catalog.reserve(l.sku, l.quantity)) {
          for (const h of held) catalog.release(h.sku, h.quantity);
          return fail(
            409,
            "INSUFFICIENT_STOCK",
            `Insufficient stock for SKU ${l.sku}: requested ${l.quantity}, available ${catalog.stockOf(l.sku)}`,
          );
        }
        held.push(l);
      }

      const now = new Date();
      const total = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
      sequence += 1;
      const status: MockOrderStatus =
        term === "CREDIT"
          ? total <= terms.creditLimit
            ? "CONFIRMED"
            : "ON_HOLD"
          : "PENDING_PAYMENT";
      const order: MockOrder = {
        orderId: `0b7d3c1e-0000-4000-8000-${(0xf000 + sequence).toString(16).padStart(12, "0")}`,
        orderNumber: orderNumberFor(now, 431 + sequence),
        customerId,
        status,
        totalAmount: total,
        currency: "VND",
        lines: lines.map((l, i) => ({
          lineId: `1a2b3c4d-0000-4000-8000-${(0xf0000 + sequence * 100 + i).toString(16).padStart(12, "0")}`,
          sku: l.sku,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          lineTotal: l.unitPrice * l.quantity,
          reservationIds: [
            `5e6f7a8b-0000-4000-8000-${(0xf0000 + sequence * 100 + i).toString(16).padStart(12, "0")}`,
          ],
        })),
        placedAt: now.toISOString(),
        createdBy: "customer",
        lastModifiedAt: now.toISOString(),
        shippingAddress: shipping,
        requestId,
        paymentTerm: term,
        paidAmount: 0,
        ...(term === "DEPOSIT"
          ? { depositRequired: Math.round((total * terms.depositPercent) / 100) }
          : {}),
        ...(term === "CREDIT" ? { creditTermDays: terms.creditTermDays } : {}),
        history: [{ status, occurredAt: now.toISOString() }],
        stockHeld: true,
      };
      orders.push(order);
      return ok(toPlaced(order), 201);
    },

    /**
     * POST /orders/{orderId}/cancellation with `{ reasonCode?, note? }`. A body that cannot be
     * read is 400 MALFORMED_REQUEST; a note over 1000 characters, or OTHER without a note, is 400
     * VALIDATION_FAILED.
     */
    cancel(orderId: string, body: { reasonCode?: unknown; note?: unknown } = {}): MockResult {
      const order = own(orderId);
      if (!order) return notFound(orderId);
      if (
        body.reasonCode !== undefined &&
        !CANCELLATION_REASON_CODES.includes(String(body.reasonCode))
      ) {
        return fail(400, "MALFORMED_REQUEST", "The request body could not be read");
      }
      const note = typeof body.note === "string" ? body.note.trim() : undefined;
      if (note && note.length > NOTE_MAX) {
        return fail(400, "VALIDATION_FAILED", "Dữ liệu không hợp lệ", [
          { field: "note", message: "note is at most 1000 characters", code: "Size" },
        ]);
      }
      const reasonCode = typeof body.reasonCode === "string" ? body.reasonCode : "CUSTOMER_REQUEST";
      if (reasonCode === "OTHER" && !note) {
        return fail(400, "VALIDATION_FAILED", "A note is required when the reason is OTHER");
      }

      if (CANCELLABLE.has(order.status)) {
        const at = new Date().toISOString();
        order.status = "CANCELLED";
        order.cancellationReasonCode = reasonCode;
        order.history.push({ status: "CANCELLED", occurredAt: at, reasonCode });
        order.lastModifiedAt = at;
        order.lastModifiedBy = `customer:${reasonCode}`;
        releaseStock(order);
        return ok({ result: "CANCELLED", order: toPlaced(order) });
      }
      if (!REQUESTABLE.has(order.status)) {
        return fail(
          409,
          "ORDER_NOT_CANCELLABLE",
          `Order ${order.orderNumber} is ${order.status} and can no longer be cancelled; raise a return instead`,
        );
      }
      if (order.pendingCancellation) {
        return fail(
          409,
          "ORDER_CANCELLATION_REQUEST_PENDING",
          `Order ${order.orderNumber} already has a cancellation request waiting`,
        );
      }
      sequence += 1;
      order.pendingCancellation = {
        requestId: `c4a1ce11-0000-4000-8000-${sequence.toString(16).padStart(12, "0")}`,
        reasonCode,
        ...(note ? { note } : {}),
        requestedAt: new Date().toISOString(),
      };
      return ok(
        {
          result: "REQUESTED",
          requestId: order.pendingCancellation.requestId,
          order: toPlaced(order),
        },
        202,
      );
    },

    /** Test hook: what a pending request looks like to Sales (the customer cannot read it). */
    pendingCancellationOf: (orderId: string) => own(orderId)?.pendingCancellation,
  };
}

export type MockOrderBook = ReturnType<typeof createMockOrderBook>;

/* ── Seed ─────────────────────────────────────────────────────────────── */

const uuid = (prefix: string, n: number) =>
  `${prefix}-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;

export const MOCK_SHIPPING_ADDRESS: MockOrderAddress = {
  recipientName: "Nguyễn Hoài Nam",
  phone: "+84908111222",
  line1: "12 Nguyễn Huệ",
  wardCode: "26734",
  wardName: "Phường Sài Gòn",
  provinceCode: "79",
  provinceName: "Thành phố Hồ Chí Minh",
  countryCode: "VN",
};
const SHIPPING = MOCK_SHIPPING_ADDRESS;

const PRODUCTS = [
  { sku: "TEE-CLASSIC-WHT-M", unitPrice: 189000 },
  { sku: "HOODIE-ESS-BLK-L", unitPrice: 459000 },
  { sku: "MUG-CERAMIC-11OZ", unitPrice: 129000 },
  { sku: "TOTE-CANVAS-NAT", unitPrice: 159000 },
];

// Newest first after sorting: the first page shows every status with a cancel/no-cancel mix.
const STATUS_CYCLE: MockOrderStatus[] = [
  "PENDING_PAYMENT",
  "CONFIRMED",
  "SHIPPED",
  "IN_FULFILMENT",
  "ON_HOLD",
  "DELIVERED",
  "COMPLETED",
  "CANCELLED",
  "RETURNED",
  "IN_PRODUCTION",
  "READY_TO_FULFILL",
  "DRAFT",
];

/** The statuses an order went through to reach `status`, oldest first (BE status history). */
const PATH: Record<MockOrderStatus, MockOrderStatus[]> = {
  DRAFT: ["DRAFT"],
  PENDING_PAYMENT: ["PENDING_PAYMENT"],
  CONFIRMED: ["PENDING_PAYMENT", "CONFIRMED"],
  IN_PRODUCTION: ["PENDING_PAYMENT", "CONFIRMED", "IN_PRODUCTION"],
  READY_TO_FULFILL: ["PENDING_PAYMENT", "CONFIRMED", "IN_PRODUCTION", "READY_TO_FULFILL"],
  IN_FULFILMENT: ["PENDING_PAYMENT", "CONFIRMED", "READY_TO_FULFILL", "IN_FULFILMENT"],
  ON_HOLD: ["PENDING_PAYMENT", "CONFIRMED", "ON_HOLD"],
  SHIPPED: ["PENDING_PAYMENT", "CONFIRMED", "READY_TO_FULFILL", "IN_FULFILMENT", "SHIPPED"],
  DELIVERED: [
    "PENDING_PAYMENT",
    "CONFIRMED",
    "READY_TO_FULFILL",
    "IN_FULFILMENT",
    "SHIPPED",
    "DELIVERED",
  ],
  COMPLETED: [
    "PENDING_PAYMENT",
    "CONFIRMED",
    "READY_TO_FULFILL",
    "IN_FULFILMENT",
    "SHIPPED",
    "DELIVERED",
    "COMPLETED",
  ],
  CANCELLED: ["PENDING_PAYMENT", "CANCELLED"],
  RETURNED: [
    "PENDING_PAYMENT",
    "CONFIRMED",
    "READY_TO_FULFILL",
    "IN_FULFILMENT",
    "SHIPPED",
    "DELIVERED",
    "RETURNED",
  ],
};

const HOUR = 3_600_000;

function seedOrder(n: number, customerId: string, status: MockOrderStatus): MockOrder {
  const placed = new Date(Date.UTC(2026, 9, 7, 3, 0) - n * 26 * HOUR);
  const lineCount = (n % 3) + 1;
  const lines: MockOrderLine[] = Array.from({ length: lineCount }, (_, i) => {
    const product = PRODUCTS[(n + i) % PRODUCTS.length]!;
    const quantity = ((n + i) % 2) + 1;
    return {
      lineId: uuid("1a2b3c4d", n * 10 + i),
      sku: product.sku,
      quantity,
      unitPrice: product.unitPrice,
      lineTotal: product.unitPrice * quantity,
      reservationIds: status === "DRAFT" ? [] : [uuid("5e6f7a8b", n * 10 + i)],
      ...(i === 0 && (n % 4 === 0 || status === "IN_PRODUCTION")
        ? { designSnapshotId: uuid("9c0d1e2f", n), designChecksum: `sha256:mock${n}` }
        : {}),
    };
  });
  const totalAmount = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  // Terms vary so every payment shape is on screen: prepaid, deposit, credit.
  const paymentTerm: MockPaymentTerm = n % 3 === 1 ? "DEPOSIT" : n % 7 === 3 ? "CREDIT" : "PREPAID";
  const received = status !== "DRAFT" && status !== "PENDING_PAYMENT" && status !== "CANCELLED";
  const finished = status === "DELIVERED" || status === "COMPLETED";
  const depositRequired = Math.round(totalAmount * 0.3);
  const paidAmount =
    paymentTerm === "CREDIT"
      ? 0
      : !received
        ? 0
        : paymentTerm === "DEPOSIT" && !finished
          ? depositRequired
          : totalAmount;
  return {
    orderId: uuid("0b7d3c1e", n),
    orderNumber: orderNumberFor(placed, 431 + n),
    customerId,
    status,
    totalAmount,
    currency: "VND",
    lines,
    placedAt: placed.toISOString(),
    createdBy: "customer",
    lastModifiedAt: new Date(placed.getTime() + HOUR).toISOString(),
    paymentTerm,
    paidAmount,
    ...(paymentTerm === "DEPOSIT" ? { depositRequired } : {}),
    ...(paymentTerm === "CREDIT" ? { creditTermDays: 30 } : {}),
    history: PATH[status].map((step, i) => ({
      status: step,
      occurredAt: new Date(placed.getTime() + i * 2 * HOUR).toISOString(),
      ...(step === "CANCELLED"
        ? { reasonCode: n % 2 === 0 ? "CUSTOMER_REQUEST" : "PAYMENT_NOT_RECEIVED" }
        : {}),
    })),
    // Older orders were placed before contact/billing were captured — NON_NULL omits them.
    ...(n % 5 === 4
      ? {}
      : {
          lastModifiedBy: "system",
          contactName: SHIPPING.recipientName,
          contactEmail: "nam.nguyen@example.vn",
          contactPhone: SHIPPING.phone,
          shippingAddress: SHIPPING,
          ...(n % 2 === 0 ? { billingAddress: { ...SHIPPING, line2: "Tầng 5" } } : {}),
        }),
  };
}

/** Orders of `customerId` (more than one page) plus one order owned by somebody else. */
export function seedMockOrders(customerId: string, count = 24): MockOrder[] {
  const mine = Array.from({ length: count }, (_, n) =>
    seedOrder(n, customerId, STATUS_CYCLE[n % STATUS_CYCLE.length]!),
  );
  return [...mine, seedOrder(count, "CUS-OTHER", "CONFIRMED")];
}

/** Id of the seeded order that belongs to another customer (404 demo). */
export const foreignMockOrderId = (count = 24) => uuid("0b7d3c1e", count);
