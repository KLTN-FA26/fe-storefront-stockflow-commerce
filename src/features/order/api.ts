import { api } from "@/lib/api/client";

import { cancelOrderInputSchema, orderDtoSchema, orderPageDtoSchema } from "./schemas";
import type { CancelOrderInput, MyOrdersParams, Order, OrderPage } from "./types";

// BE OrderController: /api/v1/orders — the /v1 prefix lives in API_URL.

/** GET /orders/me — FE pages are 1-based, the BE PageResponse is 0-based. */
export async function getMyOrders(
  params: MyOrdersParams,
  signal?: AbortSignal,
): Promise<OrderPage> {
  const { data } = await api.get<unknown>("/orders/me", {
    params: { page: Math.max(params.page, 1) - 1, size: params.size },
    ...(signal ? { signal } : {}),
  });
  const page = orderPageDtoSchema.parse(data);
  return { ...page, page: page.page + 1 };
}

/**
 * GET /orders/me/{orderId} — the customer's own view. `/orders/{orderId}` is the staff one (the
 * whole order, internals included). Another customer's order answers 404 NOT_FOUND (BE hides it).
 */
export async function getOrder(orderId: string, signal?: AbortSignal): Promise<Order> {
  const { data } = await api.get<unknown>(
    `/orders/me/${encodeURIComponent(orderId)}`,
    signal ? { signal } : {},
  );
  return orderDtoSchema.parse(data);
}

/**
 * POST /orders/{orderId}/cancellation?reason= — `reason` is a query param (BE default
 * CUSTOMER_REQUEST). The input is validated first so a reason the BE would refuse never leaves
 * the client. Success is ApiResponse<Void> with no `data` key, so nothing is parsed.
 */
export async function cancelMyOrder(input: CancelOrderInput): Promise<void> {
  const { orderId, reason } = cancelOrderInputSchema.parse(input);
  await api.post(`/orders/${encodeURIComponent(orderId)}/cancellation`, undefined, {
    params: reason ? { reason } : {},
  });
}
