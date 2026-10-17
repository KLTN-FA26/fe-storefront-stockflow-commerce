import { z } from "zod";

// BE OrderController takes `@PathVariable UUID orderId`; anything else answers
// 400 UNSUPPORTED_PARAMETER, so an id from the URL is checked before it is sent.
export const orderIdSchema = z.uuid();
export const isValidOrderId = (orderId: string) => orderIdSchema.safeParse(orderId).success;

// Mirrors BE order.api.OrderStatus (develop). Lifecycle rules for these live in lifecycle.ts.
export const ORDER_STATUSES = [
  "DRAFT",
  "PENDING_PAYMENT",
  "CONFIRMED",
  "IN_PRODUCTION",
  "READY_TO_FULFILL",
  "IN_FULFILMENT",
  "ON_HOLD",
  "SHIPPED",
  "DELIVERED",
  "COMPLETED",
  "CANCELLED",
  "RETURNED",
] as const;
export type KnownOrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * A status the FE does not know yet. The BE keeps adding some (CONFIRMED, IN_PRODUCTION and
 * READY_TO_FULFILL arrived after the first FE cut); one such order must not fail the whole
 * /orders/me page as a contract error, so it is shown as "Đang xử lý" and never offered for
 * cancellation.
 */
export const ORDER_STATUS_UNKNOWN = "UNKNOWN";

const isKnownOrderStatus = (status: string): status is KnownOrderStatus =>
  (ORDER_STATUSES as readonly string[]).includes(status);

// Still a contract error when `status` is missing or not a string.
export const orderStatusSchema = z
  .string()
  .transform((status): KnownOrderStatus | typeof ORDER_STATUS_UNKNOWN =>
    isKnownOrderStatus(status) ? status : ORDER_STATUS_UNKNOWN,
  );

/**
 * What the customer reads (BE CustomerOrders.StatusGroup): one wording per group, whatever the
 * order's own status is. Tolerant like the status: a group newer than this FE becomes UNKNOWN.
 */
export const ORDER_STATUS_GROUPS = [
  "AWAITING_PAYMENT",
  "UNDER_REVIEW",
  "CONFIRMED",
  "IN_PRODUCTION",
  "PREPARING",
  "SHIPPING",
  "DELIVERED",
  "CANCELLED",
  "RETURNED",
] as const;
export type KnownOrderStatusGroup = (typeof ORDER_STATUS_GROUPS)[number];

export const ORDER_STATUS_GROUP_UNKNOWN = "UNKNOWN";

export const orderStatusGroupSchema = z
  .string()
  .transform((group): KnownOrderStatusGroup | typeof ORDER_STATUS_GROUP_UNKNOWN =>
    (ORDER_STATUS_GROUPS as readonly string[]).includes(group)
      ? (group as KnownOrderStatusGroup)
      : ORDER_STATUS_GROUP_UNKNOWN,
  );

/** BE CustomerOrders.DeliveryState; only what staff recorded. Free-form on purpose: display only. */
export const DELIVERY_STATES = ["NOT_SHIPPED", "IN_TRANSIT", "DELIVERED", "RETURNED"] as const;
export type KnownDeliveryState = (typeof DELIVERY_STATES)[number];
export const DELIVERY_STATE_UNKNOWN = "UNKNOWN";

export const deliveryStateSchema = z
  .string()
  .transform((state): KnownDeliveryState | typeof DELIVERY_STATE_UNKNOWN =>
    (DELIVERY_STATES as readonly string[]).includes(state)
      ? (state as KnownDeliveryState)
      : DELIVERY_STATE_UNKNOWN,
  );

// ── DTOs — mirror BE CustomerOrderCardResponse / CustomerOrderDetailResponse. Jackson runs with
// `default-property-inclusion: non_null`, so every nullable field may be absent from the JSON,
// not just null. ──

// ISO 4217 code; the storefront only sells in VND today.
const currencySchema = z.enum(["VND", "USD", "CNY"]);
const instantSchema = z.iso.datetime({ offset: true });

/** BE OrderResponse.Address, as the customer detail returns it. */
export const orderAddressDtoSchema = z.object({
  recipientName: z.string(),
  phone: z.string(),
  line1: z.string(),
  line2: z.string().nullish(),
  wardCode: z.string(),
  wardName: z.string(),
  provinceCode: z.string(),
  provinceName: z.string(),
  countryCode: z.string(),
  postalCode: z.string().nullish(),
});

/** One row of GET /orders/me (CustomerOrderCardResponse): no lines, only their count. */
export const orderCardDtoSchema = z.object({
  orderId: z.uuid(),
  orderNumber: z.string().min(1),
  status: orderStatusSchema,
  statusGroup: orderStatusGroupSchema,
  total: z.number().nonnegative(),
  currency: currencySchema,
  placedAt: instantSchema,
  lineCount: z.number().int().nonnegative(),
  deliveryState: deliveryStateSchema.nullish(),
});

export const orderLineDtoSchema = z.object({
  lineId: z.uuid(),
  sku: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
  lineTotal: z.number().nonnegative(),
  designSnapshotId: z.uuid().nullish(),
  // Only a line printed to the customer's design carries production progress.
  production: z
    .object({ state: z.string(), goodQuantity: z.number().int().nonnegative() })
    .nullish(),
});

export const orderPaymentDtoSchema = z.object({
  status: z.string(),
  paidAmount: z.number().nonnegative().nullish(),
  depositRequired: z.number().nonnegative().nullish(),
  creditTermDays: z.number().int().nonnegative().nullish(),
});

export const orderTimelineEntryDtoSchema = z.object({
  status: orderStatusSchema,
  statusGroup: orderStatusGroupSchema,
  occurredAt: instantSchema,
  reasonCode: z.string().nullish(),
});

/** GET /orders/me/{orderId} (CustomerOrderDetailResponse). */
export const orderDtoSchema = z.object({
  orderId: z.uuid(),
  orderNumber: z.string().min(1),
  status: orderStatusSchema,
  statusGroup: orderStatusGroupSchema,
  // Set only while the order is ON_HOLD.
  holdReasonPublic: z.string().nullish(),
  paymentTerm: z.string().nullish(),
  total: z.number().nonnegative(),
  currency: currencySchema,
  placedAt: instantSchema,
  shippingAddress: orderAddressDtoSchema.nullish(),
  payment: orderPaymentDtoSchema.nullish(),
  lines: z.array(orderLineDtoSchema),
  // Oldest first.
  timeline: z.array(orderTimelineEntryDtoSchema).nullish(),
  deliveryState: deliveryStateSchema.nullish(),
});

/** BE common.api.PageResponse — `page` is zero-based; hasNext/hasPrevious come from the BE. */
export function pageResponseSchema<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    page: z.number().int().nonnegative(),
    size: z.number().int().positive(),
    totalElements: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
    hasNext: z.boolean(),
    hasPrevious: z.boolean(),
  });
}

export const orderPageDtoSchema = pageResponseSchema(orderCardDtoSchema);

// ── Input — POST /orders/{orderId}/cancellation?reason= ──
// Order.cancel rejects a blank reason (IllegalArgumentException → 400 VALIDATION_FAILED) and
// ordering.customer_order.cancellation_reason is VARCHAR(500). Omitting it lets the BE record
// CUSTOMER_REQUEST, so a blank reason is dropped rather than sent.
export const CANCELLATION_REASON_MAX = 500;
export const cancelOrderInputSchema = z.object({
  orderId: orderIdSchema,
  reason: z
    .string()
    .trim()
    .max(CANCELLATION_REASON_MAX)
    .optional()
    .transform((reason) => (reason ? reason : undefined)),
});
