import { z } from "zod";

import { SKU_PATTERN, currencySchema } from "@/lib/catalog/schemas";
import { beId } from "@/lib/validation/primitives";

// ── Request — mirrors BE PlaceOrderRequest (POST /orders) ──

export const checkoutLineInputSchema = z.object({
  sku: z.string().trim().regex(SKU_PATTERN),
  // @Min(1) int.
  quantity: z.number().int().min(1).max(2_147_483_647),
  // BE OrderWebMapper.wholeVnd: a fractional amount is 400 VALIDATION_FAILED. It must also equal
  // the customer's price for the SKU's total quantity, or the BE answers 409 CHECKOUT_PRICE_CHANGED.
  unitPrice: z.number().int().nonnegative(),
});

// kltn-docs 15-payment §1, BR-01: PREPAID (100% up front), DEPOSIT, CREDIT; the order may use only
// a term the customer is allowed. Same names as BE `PaymentTerm` / `CommercialTerm`.
export const PAYMENT_TERMS = ["PREPAID", "DEPOSIT", "CREDIT"] as const;
export type CheckoutPaymentTerm = (typeof PAYMENT_TERMS)[number];

/**
 * `paymentTerm` is the term the customer picked among those GET /orders/payment-terms allows them;
 * omitted, the BE uses the customer's default. A term they may not use is 409
 * PAYMENT_TERM_NOT_ALLOWED. `depositPercent` is deliberately not part of the request: the BE
 * ignores a customer's own share and applies the one in their terms (OrderController.place).
 * `billingAddressId` is omitted too: the BE falls back to the default billing, then shipping.
 */
export const placeOrderInputSchema = z.object({
  // Idempotency key: resending it returns the original order (BE OrderServiceImpl.place).
  requestId: z.uuid(),
  customerId: beId(),
  shippingAddressId: beId(),
  lines: z.array(checkoutLineInputSchema).min(1),
  paymentTerm: z.enum(PAYMENT_TERMS).optional(),
});

// ── Response — the part of BE OrderResponse the storefront uses. Extra fields (stock holds,
// actors, contact block) are not read. ──

export const placedOrderDtoSchema = z.object({
  orderId: beId(),
  orderNumber: z.string().min(1),
  // A string, not an enum: only ON_HOLD (credit order over its limit) changes what is said.
  status: z.string().min(1),
  totalAmount: z.number().nonnegative(),
  currency: currencySchema,
  paymentTerm: z.string().nullish(),
});

export type PlaceOrderInput = z.input<typeof placeOrderInputSchema>;
export type PlacedOrder = z.infer<typeof placedOrderDtoSchema>;
