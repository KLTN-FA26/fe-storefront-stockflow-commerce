import { z } from "zod";

// BE OrderController takes `@PathVariable UUID orderId`; anything else answers
// 400 UNSUPPORTED_PARAMETER, so an id from the URL is checked before it is sent.
export const orderIdSchema = z.uuid();
export const isValidOrderId = (orderId: string) => orderIdSchema.safeParse(orderId).success;

// Mirrors BE order.api.OrderStatus (develop). Lifecycle rules for these live in lifecycle.ts.
export const ORDER_STATUSES = [
  "DRAFT",
  "PENDING_PAYMENT",
  "PAID",
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
 * A status the FE does not know yet. The BE will add more (Sprint 2 B2B plans CONFIRMED and
 * IN_PRODUCTION, SCRUM-423/427); one such order must not fail the whole /orders/me page as a
 * contract error, so it is shown as "Đang xử lý" and never offered for cancellation.
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

// ── DTOs — mirror BE OrderResponse. Jackson runs with `default-property-inclusion: non_null`,
// so every nullable field may be absent from the JSON, not just null. ──

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

export const orderLineDtoSchema = z.object({
  lineId: z.uuid(),
  sku: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
  lineTotal: z.number().nonnegative(),
  reservationIds: z.array(z.uuid()).nullish(),
  designSnapshotId: z.uuid().nullish(),
  designChecksum: z.string().nullish(),
});

export const orderDtoSchema = z.object({
  orderId: z.uuid(),
  orderNumber: z.string().min(1),
  // Kept as string like the customer features (dev mock uses non-UUID customer ids).
  // ordering.customer_order.customer_id is nullable (guest checkout), so NON_NULL may drop it.
  customerId: z.string().min(1).nullish(),
  status: orderStatusSchema,
  totalAmount: z.number().nonnegative(),
  // ISO 4217 code; the storefront only sells in VND today.
  currency: z.enum(["VND", "USD", "CNY"]),
  lines: z.array(orderLineDtoSchema),
  placedAt: z.iso.datetime({ offset: true }),
  createdBy: z.string().nullish(),
  // last_modified_at is nullable: an order never touched after insert (e.g. seeded rows) has none,
  // and NON_NULL then omits the key.
  lastModifiedAt: z.iso.datetime({ offset: true }).nullish(),
  lastModifiedBy: z.string().nullish(),
  contactName: z.string().nullish(),
  contactEmail: z.string().nullish(),
  contactPhone: z.string().nullish(),
  shippingAddress: orderAddressDtoSchema.nullish(),
  billingAddress: orderAddressDtoSchema.nullish(),
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

export const orderPageDtoSchema = pageResponseSchema(orderDtoSchema);

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
