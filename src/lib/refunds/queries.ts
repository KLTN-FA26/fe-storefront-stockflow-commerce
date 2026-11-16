import { useQuery } from "@tanstack/react-query";

import { ApiError } from "@/lib/api/error";
import { QUERY_TIMES } from "@/lib/api/query-client";
import { ORDERS_QUERY_ROOT } from "@/lib/api/query-keys";
import { retryTransient } from "@/lib/api/retry";

import { getMyOrderRefund } from "./api";

export const refundKeys = {
  ofOrder: (orderId: string) => [...ORDERS_QUERY_ROOT, "refund", orderId] as const,
};

/** Đơn không có gì phải hoàn: 404 hay `refundable` = 0 đều là "không có" — không phải lỗi với khách. */
export function useMyOrderRefund(orderId: string, enabled = true) {
  return useQuery({
    queryKey: refundKeys.ofOrder(orderId),
    queryFn: async ({ signal }) => {
      try {
        const refund = await getMyOrderRefund(orderId, signal);
        return refund.refundable > 0 ? refund : null;
      } catch (error: unknown) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
    enabled,
    retry: retryTransient,
    ...QUERY_TIMES.list,
  });
}
