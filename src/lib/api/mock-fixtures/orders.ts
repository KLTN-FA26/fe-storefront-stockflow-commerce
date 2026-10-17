/**
 * In-memory customer order history that mirrors the BE contract, for USE_MOCK=true and tests.
 *
 * Shapes follow `CustomerOrderCardResponse` (list), `CustomerOrderDetailResponse` (detail) and
 * `PageResponse`; rules follow `order.internal.controller.OrderController` and
 * `order.api.OrderStatus` (develop):
 *  - GET /orders/me pages are zero-based, sorted by lastModifiedAt DESC; page < 0 or size < 1 → 400;
 *  - GET /orders/me/{orderId}: another customer's order answers 404 NOT_FOUND (the BE hides it);
 *  - a customer cancels directly only from DRAFT, PENDING_PAYMENT, CONFIRMED, otherwise 409
 *    CONFLICT (the BE's 202 cancellation request is not mocked).
 * NON_NULL serialisation: absent optional fields are omitted, never sent as null.
 * Intentionally independent from mock-data.ts (legacy, non-BE shapes).
 */

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
}

export interface MockResult {
  status: number;
  data: unknown;
}

const ok = (data?: unknown): MockResult => ({
  status: 200,
  data: {
    success: true,
    ...(data === undefined ? {} : { data }),
    timestamp: new Date().toISOString(),
  },
});

const fail = (status: number, errorCode: string, message: string): MockResult => ({
  status,
  data: {
    success: false,
    errorCode,
    message,
    correlationId: `mock-${Date.now()}`,
    timestamp: new Date().toISOString(),
  },
});

// BE OrderStatus#customerMayCancelDirectly — kept here because lib/ must not import features/.
const CANCELLABLE = new Set<MockOrderStatus>(["DRAFT", "PENDING_PAYMENT", "CONFIRMED"]);

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
    ...(order.shippingAddress ? { shippingAddress: order.shippingAddress } : {}),
    lines: order.lines.map(({ lineId, sku, quantity, unitPrice, lineTotal, designSnapshotId }) => ({
      lineId,
      sku,
      quantity,
      unitPrice,
      lineTotal,
      ...(designSnapshotId ? { designSnapshotId } : {}),
    })),
    timeline: [
      {
        status: "PENDING_PAYMENT",
        statusGroup: "AWAITING_PAYMENT",
        occurredAt: order.placedAt,
      },
    ],
  };
};

const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 20;

function toInt(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  return Number.isInteger(n) ? n : Number.NaN;
}

export function createMockOrderBook(customerId: string, seed: MockOrder[]) {
  const orders = seed.map((order) => structuredClone(order));
  const own = (orderId: string) =>
    orders.find((o) => o.orderId === orderId && o.customerId === customerId);
  const notFound = (orderId: string) => fail(404, "NOT_FOUND", `No order with id ${orderId}`);

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

    /** POST /orders/{orderId}/cancellation — ApiResponse<Void>: no `data` key on success. */
    cancel(orderId: string, reason = "CUSTOMER_REQUEST"): MockResult {
      const order = own(orderId);
      if (!order) return notFound(orderId);
      if (!CANCELLABLE.has(order.status)) {
        return fail(
          409,
          "CONFLICT",
          `Order ${order.orderNumber} cannot be cancelled from status ${order.status}; raise a return instead`,
        );
      }
      order.status = "CANCELLED";
      order.lastModifiedAt = new Date().toISOString();
      order.lastModifiedBy = `customer:${reason}`;
      return ok();
    },
  };
}

export type MockOrderBook = ReturnType<typeof createMockOrderBook>;

/* ── Seed ─────────────────────────────────────────────────────────────── */

const uuid = (prefix: string, n: number) =>
  `${prefix}-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;

const SHIPPING: MockOrderAddress = {
  recipientName: "Nguyễn Hoài Nam",
  phone: "+84908111222",
  line1: "12 Nguyễn Huệ",
  wardCode: "26734",
  wardName: "Phường Sài Gòn",
  provinceCode: "79",
  provinceName: "Thành phố Hồ Chí Minh",
  countryCode: "VN",
};

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

function seedOrder(n: number, customerId: string, status: MockOrderStatus): MockOrder {
  const placed = new Date(Date.UTC(2026, 9, 7, 3, 0) - n * 26 * 3_600_000);
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
      ...(i === 0 && n % 4 === 0
        ? { designSnapshotId: uuid("9c0d1e2f", n), designChecksum: `sha256:mock${n}` }
        : {}),
    };
  });
  // Order numbers carry the Vietnam calendar day (UTC+7), like the date the customer sees.
  const day = new Date(placed.getTime() + 7 * 3_600_000)
    .toISOString()
    .slice(0, 10)
    .replaceAll("-", "");
  return {
    orderId: uuid("0b7d3c1e", n),
    orderNumber: `SO-${day}-${String(431 + n).padStart(6, "0")}`,
    customerId,
    status,
    totalAmount: lines.reduce((sum, line) => sum + line.lineTotal, 0),
    currency: "VND",
    lines,
    placedAt: placed.toISOString(),
    createdBy: "customer",
    lastModifiedAt: new Date(placed.getTime() + 3_600_000).toISOString(),
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
