import { api } from "@/lib/api/client";

import {
  cancelOrderInputSchema,
  cancellationResultDtoSchema,
  orderDtoSchema,
  orderPageDtoSchema,
} from "./schemas";
import type {
  CancelOrderInput,
  CancellationResult,
  MyOrdersParams,
  Order,
  OrderPage,
} from "./types";

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
 * POST /orders/{orderId}/cancellation with `{ reasonCode?, note? }` (BE CancelOrderRequest). Before
 * anything is released to production or the warehouse the order is cancelled at once (200,
 * CANCELLED); after that the BE records a request Sales decides (202, REQUESTED, with its id).
 * The input is validated first so a body the BE would refuse never leaves the client.
 */
export async function cancelMyOrder(input: CancelOrderInput): Promise<CancellationResult> {
  const { orderId, reasonCode, note } = cancelOrderInputSchema.parse(input);
  const body = reasonCode || note ? { reasonCode, note } : undefined;
  const { data } = await api.post<unknown>(
    `/orders/${encodeURIComponent(orderId)}/cancellation`,
    body,
  );
  return cancellationResultDtoSchema.parse(data);
}
