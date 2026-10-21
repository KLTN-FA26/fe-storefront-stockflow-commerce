import { api } from "@/lib/api/client";

import {
  paymentTermsDtoSchema,
  placeOrderInputSchema,
  placedOrderDtoSchema,
  type PaymentTermsDto,
  type PlaceOrderInput,
  type PlacedOrder,
} from "./checkout-schemas";

/**
 * POST /orders (BE OrderController.place, 201). Creates the order and reserves its stock in one
 * transaction. The input is validated first so a request the BE would refuse never leaves the
 * client. Guest checkout (POST /orders/guest-checkout) is not offered: the BE denies it
 * (GUEST_CHECKOUT_DISABLED, B2B only).
 */
export async function placeOrder(input: PlaceOrderInput): Promise<PlacedOrder> {
  const body = placeOrderInputSchema.parse(input);
  const { data } = await api.post<unknown>("/orders", body);
  return placedOrderDtoSchema.parse(data);
}

/**
 * GET /orders/payment-terms (BE CreditHoldController.myTerms): the payment terms the signed-in
 * customer may use, their default, and the deposit share. Own customer only, taken from the token;
 * a sign-in without a customer profile is 404 CUSTOMER_NOT_FOUND.
 */
export async function getPaymentTerms(signal?: AbortSignal): Promise<PaymentTermsDto> {
  const { data } = await api.get<unknown>("/orders/payment-terms", signal ? { signal } : {});
  return paymentTermsDtoSchema.parse(data);
}
