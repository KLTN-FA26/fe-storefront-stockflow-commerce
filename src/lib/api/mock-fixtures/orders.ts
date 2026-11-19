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
import { MOCK_COMPANY_BANK, mockInstallmentsOf, mockOrderInstallments } from "./installments";

export type MockOrderStatus =
  | "DRAFT"
  | "PENDING_CONTRACT"
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

/** What one shipment carried of an order line (BE `CustomerOrderShipmentLine`, before returns). */
export interface MockShipmentLine {
  lineId: string;
  quantity: number;
}

/** One handed-over shipment of the order (BE `CustomerOrderShipment`, WF-05 TH-1). */
export interface MockShipment {
  shipmentId: string;
  shipmentCode: string;
  status: "HANDED_OVER" | "DELIVERED" | "DELIVERY_FAILED" | "RETURNED";
  packageCount: number;
  carrierName: string;
  handedOverAt: string;
  outcomeAt?: string;
  lines: MockShipmentLine[];
}

/** What one return line holds of an order line (BE `ReturnLine.claimedUnits`), for its shipment. */
export interface MockReturnClaim {
  shipmentId: string | null;
  orderLineId: string;
  units: number;
  /** The return is still open: no second return of the line on the same shipment. */
  open: boolean;
}

export interface MockHistoryEntry {
  status: MockOrderStatus;
  occurredAt: string;
  reasonCode?: string;
}

/** BE CancellationRequestStatus. EXPIRED is closed by the system (no decider): the order moved on first. */
export type MockCancellationStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";

export interface MockCancellationRequest {
  requestId: string;
  status: MockCancellationStatus;
  reasonCode: string;
  note?: string;
  requestedAt: string;
  decidedAt?: string;
  /** What Sales (or the system, in English) answered. */
  decisionNote?: string;
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
  /** Bought through an accepted quote (seed data; every order is, since 14 BR-01). */
  fromQuote?: boolean;
  /** Idempotency key of the checkout that placed it (absent on seeded history). */
  requestId?: string;
  paymentTerm: MockPaymentTerm;
  paidAmount: number;
  depositRequired?: number;
  creditTermDays?: number;
  /** Status changes, oldest first (BE order status history). */
  history: MockHistoryEntry[];
  cancellationReasonCode?: string;
  /** The customer's latest cancellation request; GET /orders/me/{id} returns it as `cancellationRequest`. */
  pendingCancellation?: MockCancellationRequest;
  /** Stock was held by this mock when the order was placed, so cancelling gives it back. */
  stockHeld?: boolean;
  /** Handed-over shipments, oldest first; absent: the order left as a whole with none recorded. */
  shipments?: MockShipment[];
}

/** The customer's commercial terms, as the BE's CreditTerms (the customer reads them at GET /orders/payment-terms). */
export interface MockCreditTerms {
  defaultTerm: MockPaymentTerm;
  allowed: readonly MockPaymentTerm[];
  depositPercent: number;
  creditLimit: number;
  creditTermDays: number;
  /** Owed on credit orders delivered-not-yet-paid before this session (added to what the session places). */
  exposure?: number;
  /** An overdue receivable: credit orders wait for approval whatever the limit. */
  overdue?: boolean;
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
  details?: Record<string, unknown>,
): MockResult => ({
  status,
  data: {
    success: false,
    errorCode,
    message,
    ...(fieldErrors ? { fieldErrors } : {}),
    ...(details ? { details } : {}),
    correlationId: `mock-${Date.now()}`,
    timestamp: new Date().toISOString(),
  },
});

// BE OrderStatus#customerMayCancelDirectly — kept here because lib/ must not import features/.
const CANCELLABLE = new Set<MockOrderStatus>(["DRAFT", "PENDING_PAYMENT", "CONFIRMED"]);
// OrderStatus#canTransitionTo(CANCELLED) for the rest: the customer may ask (202).
const REQUESTABLE = new Set<MockOrderStatus>([
  "PENDING_CONTRACT",
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
    case "PENDING_CONTRACT":
      return "AWAITING_CONTRACT";
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

const DAY = 86_400_000;
const VN = 7 * 3_600_000;
/** BE `ReturnPolicy.windowDays` default; the contract may set another. */
export const MOCK_RETURN_WINDOW_DAYS = 7;

/** BE `ReturnPolicy.endOfDays`: the start of the VN day `days` whole days after `from`'s day. */
export const endOfVnDays = (fromIso: string, days: number) =>
  new Date(Math.floor((Date.parse(fromIso) + VN) / DAY) * DAY + (days + 1) * DAY - VN);

/**
 * How many units of an order line a return opened now against `shipment` may claim (BE
 * `CustomerOrderShipmentLine.returnableQuantity`): what the shipment delivered less what its other
 * returns hold, bounded by what the line's returns hold in all; `open` when a return of the line is
 * open on this shipment. The order status and the window are the caller's.
 */
export function mockShipmentReturnable(
  order: Pick<MockOrder, "lines">,
  shipment: Pick<MockShipment, "shipmentId" | "lines">,
  lineId: string,
  claims: readonly MockReturnClaim[],
): { open: boolean; max: number } {
  const carried = shipment.lines.find((line) => line.lineId === lineId)?.quantity ?? 0;
  const ordered = order.lines.find((line) => line.lineId === lineId)?.quantity ?? 0;
  const ofLine = claims.filter((claim) => claim.orderLineId === lineId);
  const here = ofLine.filter((claim) => claim.shipmentId === shipment.shipmentId);
  const sum = (list: readonly MockReturnClaim[]) => list.reduce((s, c) => s + c.units, 0);
  return {
    open: here.some((claim) => claim.open),
    max: Math.max(0, Math.min(carried - sum(here), ordered - sum(ofLine))),
  };
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

/** What the detail needs beyond the order: the clock and what the customer's returns hold. */
interface DetailContext {
  now: Date;
  claims: readonly MockReturnClaim[];
}

/** BE `CustomerOrderShipment` with its lines and what a return of each may still claim. */
function toShipment(order: MockOrder, shipment: MockShipment, context: DetailContext) {
  const windowOpen =
    order.status === "DELIVERED" &&
    shipment.status === "DELIVERED" &&
    !!shipment.outcomeAt &&
    endOfVnDays(shipment.outcomeAt, MOCK_RETURN_WINDOW_DAYS).getTime() > context.now.getTime();
  return {
    shipmentId: shipment.shipmentId,
    shipmentCode: shipment.shipmentCode,
    status: shipment.status,
    packageCount: shipment.packageCount,
    carrierName: shipment.carrierName,
    handedOverAt: shipment.handedOverAt,
    ...(shipment.outcomeAt ? { outcomeAt: shipment.outcomeAt } : {}),
    lines: shipment.lines.map((line) => {
      const { open, max } = mockShipmentReturnable(order, shipment, line.lineId, context.claims);
      return {
        orderLineId: line.lineId,
        sku: order.lines.find((l) => l.lineId === line.lineId)?.sku ?? "",
        quantity: line.quantity,
        returnableQuantity: windowOpen && !open ? max : 0,
      };
    }),
  };
}

/** CustomerOrderDetailResponse: no reservations, checksums, actors or contact block. */
const toDetail = (order: MockOrder, context: DetailContext) => {
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
    ...(order.pendingCancellation
      ? {
          cancellationRequest: {
            status: order.pendingCancellation.status,
            reasonCode: order.pendingCancellation.reasonCode,
            ...(order.pendingCancellation.note ? { note: order.pendingCancellation.note } : {}),
            requestedAt: order.pendingCancellation.requestedAt,
            ...(order.pendingCancellation.decidedAt
              ? { decidedAt: order.pendingCancellation.decidedAt }
              : {}),
            ...(order.pendingCancellation.decisionNote
              ? { decisionNote: order.pendingCancellation.decisionNote }
              : {}),
          },
        }
      : {}),
    // CustomerOrdersService#allowedActions
    allowedActions: {
      cancel: CANCELLABLE.has(order.status),
      // A decided request (approved, rejected, expired) does not stop the customer asking again.
      requestCancellation:
        REQUESTABLE.has(order.status) && order.pendingCancellation?.status !== "PENDING",
    },
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
      // Where the SKU is on sale today; NON_NULL drops them for a SKU that is not, and for a design line.
    })),
    timeline: order.history.map((entry) => ({
      status: entry.status,
      statusGroup: statusGroup(entry.status),
      occurredAt: entry.occurredAt,
      // Only the cancellation step carries a reason code; the free-text note is never exposed.
      ...(entry.reasonCode ? { reasonCode: entry.reasonCode } : {}),
    })),
    ...(order.shipments
      ? { shipments: order.shipments.map((shipment) => toShipment(order, shipment, context)) }
      : {}),
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

/** BE stockflow.order.duplicate-window default (PT24H, awaiting the owner's confirmation). */
const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 20;
const NOTE_MAX = 1000;

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

const ymd = (iso: string) => iso.slice(0, 10).replaceAll("-", "");

/**
 * The issued invoices of a delivered order (BE `CustomerEInvoiceResponse`): one per delivered
 * shipment (one for an order that left as a whole), 8 % VAT. A completed order's first invoice was
 * replaced two days later (TT 91 Điều 10), each naming the other by id and code.
 */
function mockInvoicesOf(order: MockOrder, index: number) {
  const deliveredAt =
    order.history.find((h) => h.status === "DELIVERED")?.occurredAt ?? order.lastModifiedAt;
  const priceOf = (lineId: string) => order.lines.find((l) => l.lineId === lineId)?.unitPrice ?? 0;
  const deliveries = order.shipments
    ? order.shipments
        .filter((s) => s.status === "DELIVERED")
        .map((s) => ({
          code: s.shipmentCode,
          at: s.outcomeAt ?? deliveredAt,
          subtotal: s.lines.reduce((sum, l) => sum + priceOf(l.lineId) * l.quantity, 0),
        }))
    : [{ code: `${order.orderNumber}-S1`, at: deliveredAt, subtotal: order.totalAmount }];
  const invoices = deliveries.map((delivery, k) => {
    const tax = Math.round(delivery.subtotal * 0.08);
    return {
      id: `5e1a000${k}${order.orderId.slice(8)}`,
      code: `EINV-${ymd(delivery.at)}-${String(100 + index * 10 + k).padStart(4, "0")}`,
      type: "ORIGINAL",
      status: "ISSUED",
      adjusted: false,
      orderId: order.orderId,
      orderNumber: order.orderNumber,
      shipmentCode: delivery.code,
      issueDate: delivery.at.slice(0, 10),
      templateCode: "1",
      symbol: "C26TAA",
      invoiceNumber: 100 + index * 10 + k,
      subtotal: delivery.subtotal,
      taxTotal: tax,
      grandTotal: delivery.subtotal + tax,
      issuedAt: delivery.at,
    };
  });
  const original = invoices[0];
  if (order.status !== "COMPLETED" || !original) return invoices.map(({ code: _code, ...i }) => i);
  const at = new Date(Date.parse(original.issuedAt) + 2 * 86_400_000).toISOString();
  const replacement = {
    ...original,
    id: `5e1a00f0${order.orderId.slice(8)}`,
    code: `EINV-${ymd(at)}-${String(900 + index).padStart(4, "0")}`,
    type: "REPLACEMENT",
    issueDate: at.slice(0, 10),
    invoiceNumber: 900 + index,
    issuedAt: at,
  };
  return [
    ...invoices.slice(1),
    { ...original, status: "REPLACED", replacedBy: { id: replacement.id, code: replacement.code } },
    { ...replacement, replaces: { id: original.id, code: original.code } },
  ].map(({ code: _code, ...i }) => i);
}

/** What the book needs from the rest of the mock BE: stock, prices, and the address book. */
export interface MockOrderDeps {
  catalog?: MockCatalog;
  /** The customer's saved SHIPPING address with this id, if any. */
  shippingAddress?: (addressId: string) => MockOrderAddress | undefined;
  /** The customer's default SHIPPING address id, if any. */
  defaultShippingAddressId?: () => string | undefined;
  terms?: MockCreditTerms;
  /** The clock the return windows run on (tests pin it). */
  now?: () => Date;
}

export function createMockOrderBook(
  customerId: string,
  seed: MockOrder[],
  deps: MockOrderDeps = {},
) {
  const orders = seed.map((order) => structuredClone(order));
  const terms = deps.terms ?? DEFAULT_MOCK_TERMS;
  const now = deps.now ?? (() => new Date());
  // What the customer's returns hold, per order; the returns mock attaches itself (mock-orders.ts).
  let returnClaims: (orderId: string) => readonly MockReturnClaim[] = () => [];
  let sequence = 1000;
  const own = (orderId: string) =>
    orders.find((o) => o.orderId === orderId && o.customerId === customerId);
  const notFound = (orderId: string) => fail(404, "NOT_FOUND", `No order with id ${orderId}`);

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
      return order
        ? ok(toDetail(order, { now: now(), claims: returnClaims(order.orderId) }))
        : notFound(orderId);
    },

    /**
     * GET /einvoices/me?orderId= (BE CustomerEInvoiceController): one issued invoice per delivery of a
     * delivered order, dated the delivery day (kltn-docs 21 §4.1), newest first; `orderId` narrows it
     * to one of the customer's orders (any other id: an empty page). A completed order's invoice was
     * replaced once, so the chain (`replaces` / `replacedBy`, omitted when null) is on screen.
     */
    myEInvoices(query: { orderId?: unknown } = {}): MockResult {
      const items = orders
        .filter(
          (o) =>
            o.customerId === customerId && (o.status === "DELIVERED" || o.status === "COMPLETED"),
        )
        .flatMap((o, index) => mockInvoicesOf(o, index))
        .filter((invoice) => query.orderId == null || invoice.orderId === query.orderId)
        // Newest invoice date first; the same day, the later issued first.
        .sort((a, b) => `${b.issueDate}${b.issuedAt}`.localeCompare(`${a.issueDate}${a.issuedAt}`));
      return ok({
        items,
        page: 0,
        size: items.length || 1,
        totalElements: items.length,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false,
      });
    },

    /** GET /einvoices/me/{id}/files/{kind}: a short-lived link to the file. */
    myEInvoiceFile(id: string, kind: string): MockResult {
      return ok({
        url: `https://files.example/einvoices/${id}.${kind.toLowerCase()}`,
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
      });
    },

    /** GET /refunds/me/orders/{orderId}: what a cancelled order that had money paid gets back (15 §4.5). */
    myOrderRefund(orderId: string): MockResult {
      const order = own(orderId);
      if (!order) return notFound(orderId);
      const refundable = order.status === "CANCELLED" ? order.paidAmount : 0;
      return ok({
        orderId,
        orderNumber: order.orderNumber,
        currency: order.currency,
        refundStatus: refundable > 0 ? "PENDING" : "NONE",
        refundable,
        refunded: 0,
        remaining: refundable,
        records: [],
      });
    },

    /** GET /installments/me/orders/{orderId} (BE InstallmentController.myOrder). */
    orderInstallments(orderId: string): MockResult {
      const order = own(orderId);
      const plan = order ? mockOrderInstallments(order) : undefined;
      return plan
        ? ok(plan)
        : fail(404, "INSTALLMENT_NOT_FOUND", `Order ${orderId} has no installments`);
    },

    /** GET /installments/me?orderId=&status=&page=&size= (earliest due first). */
    myInstallments(
      query: { orderId?: unknown; status?: unknown; page?: unknown; size?: unknown } = {},
    ): MockResult {
      const page = toInt(query.page, 0);
      const size = toInt(query.size, DEFAULT_PAGE_SIZE);
      if (!(page >= 0) || !(size >= 1) || size > MAX_PAGE_SIZE) {
        return fail(
          400,
          "UNSUPPORTED_PARAMETER",
          `page must be >= 0 and size between 1 and ${MAX_PAGE_SIZE}`,
        );
      }
      const all = orders
        .filter((o) => o.customerId === customerId)
        .filter((o) => query.orderId == null || o.orderId === query.orderId)
        .flatMap((o) => mockInstallmentsOf(o) ?? [])
        .filter((i) => query.status == null || i.status === query.status)
        .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
      const totalPages = Math.ceil(all.length / size);
      return ok({
        items: all.slice(page * size, (page + 1) * size),
        page,
        size,
        totalElements: all.length,
        totalPages,
        hasNext: page + 1 < totalPages,
        hasPrevious: page > 0,
      });
    },

    /** GET /installments/me/{installmentId}/transfer-instructions (15 §4.2 step 5). */
    installmentTransfer(installmentId: string): MockResult {
      const installment = orders
        .filter((o) => o.customerId === customerId)
        .flatMap((o) => mockInstallmentsOf(o) ?? [])
        .find((i) => i.installmentId === installmentId);
      if (!installment) return fail(404, "INSTALLMENT_NOT_FOUND", "Installment not found");
      if (installment.status === "PAID" || installment.status === "CANCELLED") {
        return fail(409, "INSTALLMENT_NOT_PAYABLE", "This installment is paid or cancelled");
      }
      return ok({
        installmentId,
        contractNumber: installment.contractNumber,
        orderNumber: installment.orderNumber,
        seq: installment.seq,
        name: installment.name,
        ...MOCK_COMPANY_BANK,
        amountDue: installment.outstanding,
        currency: installment.currency,
        reference: installment.transferReference,
        ...(installment.dueDate ? { dueDate: installment.dueDate } : {}),
      });
    },

    /**
     * GET /orders/credit-position/me (BE CreditPositionResponse, 15 §4.3): the limit, what the
     * AFTER_DELIVERY installments still owe, what is overdue among them.
     */
    creditPosition(): MockResult {
      const owed = orders
        .filter((o) => o.customerId === customerId)
        .flatMap((o) => mockInstallmentsOf(o) ?? [])
        .filter((i) => i.milestone === "AFTER_DELIVERY" && i.status !== "CANCELLED");
      const exposureNow = owed.reduce((sum, i) => sum + i.outstanding, 0);
      const overdue = owed.filter((i) => i.overdue);
      const oldest = overdue
        .map((i) => i.dueDate)
        .filter((d): d is string => d !== undefined)
        .sort()[0];
      return ok({
        customerId,
        ...(terms.creditLimit > 0
          ? {
              creditLimit: terms.creditLimit,
              creditTermDays: terms.creditTermDays,
              availableCredit: Math.max(0, terms.creditLimit - exposureNow),
            }
          : {}),
        exposure: exposureNow,
        currency: "VND",
        hasOverdue: overdue.length > 0 || terms.overdue === true,
        overdueAmount: overdue.reduce((sum, i) => sum + i.outstanding, 0),
        ...(oldest ? { oldestOverdueDueDate: oldest } : {}),
      });
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
      if (order.pendingCancellation?.status === "PENDING") {
        return fail(
          409,
          "ORDER_CANCELLATION_REQUEST_PENDING",
          `Order ${order.orderNumber} already has a cancellation request waiting`,
        );
      }
      sequence += 1;
      order.pendingCancellation = {
        requestId: `c4a1ce11-0000-4000-8000-${sequence.toString(16).padStart(12, "0")}`,
        status: "PENDING",
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

    /** The customer's own order as stored (returns mock reads its lines and delivery). */
    ownOrder: (orderId: string): Readonly<MockOrder> | undefined => own(orderId),

    /** The returns mock tells the book what its returns hold, so shipments say what is left. */
    attachReturnClaims(claimsOf: (orderId: string) => readonly MockReturnClaim[]) {
      returnClaims = claimsOf;
    },

    /** Test hook: the order's latest cancellation request, as Sales see it (with its id). */
    pendingCancellationOf: (orderId: string) => own(orderId)?.pendingCancellation,

    /** Test hook: Sales decide the waiting request, or the system closes it (EXPIRED) because the order moved on. */
    closeCancellationRequest(
      orderId: string,
      status: Exclude<MockCancellationStatus, "PENDING">,
      decisionNote?: string,
    ) {
      const request = own(orderId)?.pendingCancellation;
      if (!request) return;
      request.status = status;
      request.decidedAt = new Date().toISOString();
      if (decisionNote) request.decisionNote = decisionNote;
    },
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
  PENDING_CONTRACT: ["DRAFT", "PENDING_CONTRACT"],
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

/**
 * A delivered order of several lines left in two shipments (WF-05 TH-1, G4-Q3): the first line is
 * split across both, the others alternate. The first arrived an hour before the second.
 */
function seedShipments(
  n: number,
  orderNumber: string,
  placed: Date,
  lines: readonly MockOrderLine[],
): MockShipment[] {
  const at = (hours: number) => new Date(placed.getTime() + hours * HOUR).toISOString();
  const carried = (k: 1 | 2): MockShipmentLine[] =>
    lines.flatMap((line, i) => {
      if (i === 0) {
        const quantity =
          k === 1 ? line.quantity - Math.floor(line.quantity / 2) : Math.floor(line.quantity / 2);
        return quantity > 0 ? [{ lineId: line.lineId, quantity }] : [];
      }
      return (i % 2 === 1) === (k === 1) ? [{ lineId: line.lineId, quantity: line.quantity }] : [];
    });
  return ([1, 2] as const).map((k) => ({
    shipmentId: uuid("5b1d0e00", n * 10 + k),
    shipmentCode: `${orderNumber}-S${k}`,
    status: "DELIVERED",
    packageCount: k,
    carrierName: "Giao Hàng Nhanh",
    // Both left with the order's SHIPPED step (placed + 8 h); the second arrived at its DELIVERED step.
    handedOverAt: at(8),
    outcomeAt: at(k === 1 ? 9 : 10),
    lines: carried(k),
  }));
}

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
  const orderNumber = orderNumberFor(placed, 431 + n);
  return {
    orderId: uuid("0b7d3c1e", n),
    orderNumber,
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
    // One shipped order shows a request the system closed because the order moved on (EXPIRED).
    ...(status === "SHIPPED" && n === 2
      ? {
          pendingCancellation: {
            requestId: uuid("c4a1ce11", n),
            status: "EXPIRED" as const,
            reasonCode: "CUSTOMER_REQUEST",
            note: "Tôi muốn đổi địa chỉ nhận hàng",
            requestedAt: new Date(placed.getTime() + 3 * HOUR).toISOString(),
            decidedAt: new Date(placed.getTime() + 8 * HOUR).toISOString(),
            decisionNote:
              "Closed: the order is SHIPPED and can no longer be cancelled; ask for a return instead.",
          },
        }
      : {}),
    history: PATH[status].map((step, i) => ({
      status: step,
      occurredAt: new Date(placed.getTime() + i * 2 * HOUR).toISOString(),
      ...(step === "CANCELLED"
        ? { reasonCode: n % 2 === 0 ? "CUSTOMER_REQUEST" : "PAYMENT_NOT_RECEIVED" }
        : {}),
    })),
    ...(status === "DELIVERED" && lines.length > 1
      ? { shipments: seedShipments(n, orderNumber, placed, lines) }
      : {}),
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

/**
 * WF-02 DS-02a's order (kltn-docs 14 §4.2–§4.3): made from the accepted quote of 60 cartons of the
 * customer's own cup, its contract SENT and waiting to be signed. Its id is
 * `MOCK_CONTRACT_ORDER_IDS.sent` of wf02.ts (spelled out here: wf02.ts imports this file). Placed
 * before the cycle's orders so the history pages keep their order.
 */
export const MOCK_PENDING_CONTRACT_ORDER_ID = "0c0e0000-0000-4000-8000-000000000001";

function seedContractOrder(customerId: string): MockOrder {
  const placed = Date.UTC(2026, 8, 10, 3, 0);
  return {
    orderId: MOCK_PENDING_CONTRACT_ORDER_ID,
    orderNumber: "SO-20260910-900001",
    customerId,
    status: "PENDING_CONTRACT",
    // 60 cartons × 1.000 cups × 1.150 đ + plate fee 1.500.000 đ, VAT 8 % (plan §3 DS-02a step 3).
    totalAmount: 76_140_000,
    currency: "VND",
    lines: [
      {
        lineId: uuid("1a2b3c4d", 9001),
        sku: "LY-GIAY-DEMO-12OZ-XANH",
        quantity: 60_000,
        unitPrice: 1150,
        lineTotal: 69_000_000,
        reservationIds: [],
      },
    ],
    placedAt: new Date(placed).toISOString(),
    createdBy: "sales",
    lastModifiedAt: new Date(placed + 2 * HOUR).toISOString(),
    lastModifiedBy: "sales",
    shippingAddress: SHIPPING,
    fromQuote: true,
    paymentTerm: "DEPOSIT",
    paidAmount: 0,
    history: [
      { status: "DRAFT", occurredAt: new Date(placed).toISOString() },
      { status: "PENDING_CONTRACT", occurredAt: new Date(placed + 2 * HOUR).toISOString() },
    ],
  };
}

/**
 * Orders of `customerId` (more than one page, the WF-02 order awaiting its contract last) plus one
 * order owned by somebody else.
 */
export function seedMockOrders(customerId: string, count = 24): MockOrder[] {
  const mine = Array.from({ length: count }, (_, n) =>
    seedOrder(n, customerId, STATUS_CYCLE[n % STATUS_CYCLE.length]!),
  );
  return [...mine, seedContractOrder(customerId), seedOrder(count, "CUS-OTHER", "CONFIRMED")];
}

/** Id of the n-th seeded order (its status is the n-th of the status cycle). */
export const seededMockOrderId = (n: number) => uuid("0b7d3c1e", n);
/** Index of the first seeded order with this status. */
export const seededMockOrderIndex = (status: MockOrderStatus) => STATUS_CYCLE.indexOf(status);

/** Id of the seeded order that belongs to another customer (404 demo). */
export const foreignMockOrderId = (count = 24) => uuid("0b7d3c1e", count);
