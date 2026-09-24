import { api } from "@/lib/api/client";
import type { PaginatedResponse, ListQueryParams } from "@/lib/api/query-factory";
import type { Order } from "./types";

export interface PaginatedOrderResponse {
  items: Order[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export type ListMyOrdersParams = ListQueryParams;

/** GET /orders/me — 1-indexed FE → 0-indexed BE bridge. */
export async function getMyOrders(
  params: ListMyOrdersParams,
  signal?: AbortSignal,
): Promise<PaginatedResponse<Order>> {
  const config = signal ? { signal } : {};
  const { data } = await api.get<PaginatedOrderResponse>("/orders/me", {
    params: { page: (params.page ?? 1) - 1, size: params.pageSize },
    ...config,
  });
  return {
    items: data.items,
    total: data.totalElements,
    page: data.page + 1, // BE 0-indexed → FE 1-indexed
    pageSize: data.size,
  };
}

export async function getOrder(id: string, signal?: AbortSignal): Promise<Order> {
  const config = signal ? { signal } : {};
  const { data } = await api.get<Order>(`/orders/${id}`, config);
  return data;
}

export async function cancelMyOrder(input: { id: string; reason?: string }): Promise<void> {
  await api.post(`/orders/${input.id}/cancellation`, undefined, {
    params: input.reason ? { reason: input.reason } : {},
  });
}
