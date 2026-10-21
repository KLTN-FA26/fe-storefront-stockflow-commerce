import { api } from "@/lib/api/client";

import {
  placeOrderInputSchema,
  placedOrderDtoSchema,
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
