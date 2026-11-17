import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { QUERY_TIMES } from "@/lib/api/query-client";
import { ORDERS_QUERY_ROOT } from "@/lib/api/query-keys";
import { retryTransient } from "@/lib/api/retry";

import { getMyReturn, listMyReturns, type MyReturnsParams } from "./api";

/** Dưới gốc `orders`: huỷ / đổi đơn làm mới luôn trả hàng của đơn, và ngược lại. */
export const returnKeys = {
  all: [...ORDERS_QUERY_ROOT, "returns"] as const,
  lists: () => [...returnKeys.all, "list"] as const,
  list: (params: MyReturnsParams) => [...returnKeys.lists(), params] as const,
  ofOrder: (orderId: string) => [...returnKeys.all, "order", orderId] as const,
  detail: (returnId: string) => [...returnKeys.all, "detail", returnId] as const,
};

/** Đủ cho mọi yêu cầu của một đơn (BE `Pages` ≤ 200). */
const ORDER_RETURNS_SCAN_SIZE = 100;

export function useMyReturns(params: MyReturnsParams) {
  return useQuery({
    queryKey: returnKeys.list(params),
    queryFn: ({ signal }) => listMyReturns(params, signal),
    placeholderData: keepPreviousData,
    retry: retryTransient,
    ...QUERY_TIMES.list,
  });
}

export function useMyReturn(returnId: string, enabled = true) {
  return useQuery({
    queryKey: returnKeys.detail(returnId),
    queryFn: ({ signal }) => getMyReturn(returnId, signal),
    enabled,
    retry: retryTransient,
    ...QUERY_TIMES.detail,
  });
}

/**
 * Mọi yêu cầu trả hàng của một đơn, đủ dòng (danh sách không có dòng nên đọc từng cái): trang đơn
 * hiện chúng, và form mở yêu cầu tính từ đó số còn trả được của mỗi dòng.
 */
export function useMyOrderReturns(orderId: string, enabled = true) {
  return useQuery({
    queryKey: returnKeys.ofOrder(orderId),
    queryFn: async ({ signal }) => {
      const page = await listMyReturns({ orderId, size: ORDER_RETURNS_SCAN_SIZE }, signal);
      return Promise.all(page.items.map((row) => getMyReturn(row.id, signal)));
    },
    enabled,
    retry: retryTransient,
    ...QUERY_TIMES.list,
  });
}
