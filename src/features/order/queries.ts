import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { z } from "zod";

import { QUERY_TIMES } from "@/lib/api/query-client";

import { getMyOrders, getOrder } from "./api";
import { isApiError } from "./errors";
import { isValidOrderId } from "./schemas";
import type { MyOrdersParams } from "./types";

export const orderKeys = {
  all: ["orders"] as const,
  lists: () => [...orderKeys.all, "list"] as const,
  list: (params: MyOrdersParams) => [...orderKeys.lists(), params] as const,
  details: () => [...orderKeys.all, "detail"] as const,
  detail: (orderId: string) => [...orderKeys.details(), orderId] as const,
};

export const ORDER_PAGE_SIZE = 10;

/**
 * Retry only what can change on a second try: network blips and 5xx. A 4xx (missing order, no
 * customer profile, bad parameter) and a contract break (ZodError) give the same answer again.
 */
const retryTransient = (failureCount: number, error: unknown) =>
  !(isApiError(error) && error.isClientError) && !(error instanceof z.ZodError) && failureCount < 2;

export function useMyOrders(params: MyOrdersParams) {
  return useQuery({
    queryKey: orderKeys.list(params),
    queryFn: ({ signal }) => getMyOrders(params, signal),
    placeholderData: keepPreviousData, // no flash between pages
    retry: retryTransient,
    ...QUERY_TIMES.list,
  });
}

export function useOrder(orderId: string) {
  return useQuery({
    queryKey: orderKeys.detail(orderId),
    queryFn: ({ signal }) => getOrder(orderId, signal),
    // A malformed id never reaches the BE; the screen renders not-found for it instead.
    enabled: isValidOrderId(orderId),
    retry: retryTransient,
    ...QUERY_TIMES.detail,
  });
}
