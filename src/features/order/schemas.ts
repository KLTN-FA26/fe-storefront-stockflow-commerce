import { z } from "zod";

import { pageResponseSchema } from "@/lib/api/page-response";
import { beId } from "@/lib/validation/primitives";
import { tolerantEnum } from "@/lib/validation/tolerant-enum";

// BE OrderController takes `@PathVariable UUID orderId`; anything else answers
// 400 UNSUPPORTED_PARAMETER, so an id from the URL is checked before it is sent.
export const orderIdSchema = beId();
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

/** BE CustomerOrders.ProductionState; NOT_REQUIRED is a line of stock goods. */
export const PRODUCTION_STATES = [
  "NOT_REQUIRED",
  "NOT_STARTED",
  "IN_PROGRESS",
  "DONE",
  "CANCELLED",
] as const;
export const productionStateSchema = tolerantEnum(PRODUCTION_STATES);

/** BE payment status (kltn-docs 15 §5.2). */
export const PAYMENT_STATUSES = ["UNPAID", "PARTIALLY_PAID", "ON_CREDIT", "PAID"] as const;
export const paymentStatusSchema = tolerantEnum(PAYMENT_STATUSES);

/** BE order.api.PaymentTerm. */
export const PAYMENT_TERMS = ["PREPAID", "DEPOSIT", "CREDIT"] as const;
export const paymentTermSchema = tolerantEnum(PAYMENT_TERMS);

/** What an ON_HOLD order is waiting for, as the customer may be told (never the internal reason). */
export const HOLD_REASONS = ["AWAITING_CREDIT_APPROVAL", "UNDER_REVIEW"] as const;
export const holdReasonSchema = tolerantEnum(HOLD_REASONS);

/** BE order.api.CancellationReasonCode (SCRUM-460). */
export const CANCELLATION_REASON_CODES = [
  "CUSTOMER_REQUEST",
  "PAYMENT_NOT_RECEIVED",
  "PAYMENT_FAILED",
  "OUT_OF_STOCK",
  "SUSPECTED_FRAUD",
  "CREDIT_REJECTED",
  "DUPLICATE_ORDER",
  "PRODUCTION_ISSUE",
  "OTHER",
] as const;
export type KnownCancellationReasonCode = (typeof CANCELLATION_REASON_CODES)[number];
export const cancellationReasonCodeSchema = tolerantEnum(CANCELLATION_REASON_CODES);

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
  orderId: beId(),
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
  lineId: beId(),
  sku: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
  lineTotal: z.number().nonnegative(),
  designSnapshotId: beId().nullish(),
  // Only a line printed to the customer's design carries production progress.
  production: z
    .object({ state: productionStateSchema, goodQuantity: z.number().int().nonnegative() })
    .nullish(),
});

export const orderPaymentDtoSchema = z.object({
  status: paymentStatusSchema,
  paidAmount: z.number().nonnegative().nullish(),
  depositRequired: z.number().nonnegative().nullish(),
  creditTermDays: z.number().int().nonnegative().nullish(),
});

export const orderTimelineEntryDtoSchema = z.object({
  status: orderStatusSchema,
  statusGroup: orderStatusGroupSchema,
  occurredAt: instantSchema,
  // Set only on the cancellation step.
  reasonCode: cancellationReasonCodeSchema.nullish(),
});

/** GET /orders/me/{orderId} (CustomerOrderDetailResponse). */
export const orderDtoSchema = z.object({
  orderId: beId(),
  orderNumber: z.string().min(1),
  status: orderStatusSchema,
  statusGroup: orderStatusGroupSchema,
  // Set only while the order is ON_HOLD.
  holdReasonPublic: holdReasonSchema.nullish(),
  paymentTerm: paymentTermSchema.nullish(),
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

export const orderPageDtoSchema = pageResponseSchema(orderCardDtoSchema);

// ── Input — POST /orders/{orderId}/cancellation (BE CancelOrderRequest, SCRUM-460) ──
// Body `{ reasonCode?, note? }`, both optional (defaults to CUSTOMER_REQUEST); `note` is at most
// 1000 characters and required for OTHER ("other with no explanation is not a reason"). The
// legacy `?reason=` free text is not used.
export const CANCELLATION_NOTE_MAX = 1000;

/**
 * Reasons a customer can honestly give. The rest of CancellationReasonCode (payment failed, out
 * of stock, suspected fraud, credit rejected, production issue) are decided by the system or by
 * staff, so they are not offered.
 */
export const CUSTOMER_CANCELLATION_REASONS = [
  "CUSTOMER_REQUEST",
  "DUPLICATE_ORDER",
  "OTHER",
] as const;

export const cancelOrderInputSchema = z
  .object({
    orderId: orderIdSchema,
    reasonCode: z.enum(CANCELLATION_REASON_CODES).optional(),
    note: z
      .string()
      .trim()
      .max(CANCELLATION_NOTE_MAX)
      .optional()
      .transform((note) => (note ? note : undefined)),
  })
  .refine((input) => input.reasonCode !== "OTHER" || input.note !== undefined, {
    path: ["note"],
    message: "Vui lòng nhập lý do khi chọn “Lý do khác”.",
  });

/** The dialog's form: the reasons a customer can give, and a note that OTHER cannot do without. */
export const cancellationFormSchema = z
  .object({
    reasonCode: z.enum(CUSTOMER_CANCELLATION_REASONS),
    note: z.string().trim().max(CANCELLATION_NOTE_MAX, "Tối đa 1000 ký tự"),
  })
  .refine((form) => form.reasonCode !== "OTHER" || form.note.length > 0, {
    path: ["note"],
    message: "Vui lòng nhập lý do khi chọn “Lý do khác”.",
  });

/**
 * What a customer's cancellation did (BE CancellationResultResponse): CANCELLED at once (200), or
 * REQUESTED (202) for Sales to decide, with the request's id. A result newer than this FE is
 * UNKNOWN, and the screen simply re-reads the order. The `order` echo is not read.
 */
export const CANCELLATION_RESULTS = ["CANCELLED", "REQUESTED"] as const;
export const cancellationResultDtoSchema = z.object({
  result: tolerantEnum(CANCELLATION_RESULTS),
  requestId: beId().nullish(),
});
