import { z } from "zod";

import { SKU_PATTERN, currencySchema } from "@/lib/catalog/schemas";

// ── Request — mirrors BE PlaceOrderRequest (POST /orders) ──

export const checkoutLineInputSchema = z.object({
  sku: z.string().trim().regex(SKU_PATTERN),
  // @Min(1) int.
  quantity: z.number().int().min(1).max(2_147_483_647),
  // BE OrderWebMapper.wholeVnd: a fractional amount is 400 VALIDATION_FAILED. It must also equal
  // the customer's price for the SKU's total quantity, or the BE answers 409 CHECKOUT_PRICE_CHANGED.
  unitPrice: z.number().int().nonnegative(),
});

/**
 * `paymentTerm` and `depositPercent` are deliberately not part of the request. The BE then uses the
 * customer's default term, and the customer cannot read which terms Sales allowed them
 * (/customers/{id}/credit-profile is back-office only), so offering a choice would be a guess.
 * `billingAddressId` is omitted too: the BE falls back to the default billing, then shipping.
 */
export const placeOrderInputSchema = z.object({
  // Idempotency key: resending it returns the original order (BE OrderServiceImpl.place).
  requestId: z.uuid(),
  customerId: z.uuid(),
  shippingAddressId: z.uuid(),
  lines: z.array(checkoutLineInputSchema).min(1),
});

// ── Response — the part of BE OrderResponse the storefront uses. Extra fields (stock holds,
// actors, contact block) are not read. ──

export const placedOrderDtoSchema = z.object({
  orderId: z.uuid(),
  orderNumber: z.string().min(1),
  // A string, not an enum: only ON_HOLD (credit order over its limit) changes what is said.
  status: z.string().min(1),
  totalAmount: z.number().nonnegative(),
  currency: currencySchema,
  paymentTerm: z.string().nullish(),
});

export type PlaceOrderInput = z.input<typeof placeOrderInputSchema>;
export type PlacedOrder = z.infer<typeof placedOrderDtoSchema>;
