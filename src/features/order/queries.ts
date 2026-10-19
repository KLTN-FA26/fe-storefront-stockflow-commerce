import { keepPreviousData, skipToken, useQuery } from "@tanstack/react-query";
import { z } from "zod";

import { QUERY_TIMES } from "@/lib/api/query-client";
import { ORDERS_QUERY_ROOT } from "@/lib/api/query-keys";

import { getMyOrders, getOrder } from "./api";
import { isApiError } from "./errors";
import { isValidOrderId } from "./schemas";
import type { MyOrdersParams } from "./types";

export const orderKeys = {
  all: ORDERS_QUERY_ROOT,
  lists: () => [...orderKeys.all, "list"] as const,
  list: (params: MyOrdersParams) => [...orderKeys.lists(), params] as const,
  details: () => [...orderKeys.all, "detail"] as const,
  detail: (orderId: string) => [...orderKeys.details(), orderId] as const,
  cancellationRequest: (orderId: string) =>
    [...orderKeys.all, "cancellation-request", orderId.toLowerCase()] as const,
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

/**
 * A cancellation request this browser knows is waiting for Sales. The BE gives a customer no way
 * to read their own requests (the queue GET /orders/cancellation-requests is back-office only,
 * and the order detail carries no trace of it), so this is learnt from the 202 that created it or
 * from the 409 ORDER_CANCELLATION_REQUEST_PENDING a repeat gets, and lives in the query cache
 * only. After a reload the order looks as it did, and asking again shows the 409 and this state.
 */
export interface KnownCancellationRequest {
  /** The request's id; null when learnt from the 409, which does not carry it. */
  requestId: string | null;
}

export function useKnownCancellationRequest(orderId: string) {
  return useQuery<KnownCancellationRequest>({
    queryKey: orderKeys.cancellationRequest(orderId),
    queryFn: skipToken, // never fetched: only set by the cancel mutation
    staleTime: Infinity,
  });
}
