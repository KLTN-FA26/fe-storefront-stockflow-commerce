import { useQuery } from "@tanstack/react-query";

import { ApiError } from "@/lib/api/error";
import { QUERY_TIMES } from "@/lib/api/query-client";
import { ORDERS_QUERY_ROOT } from "@/lib/api/query-keys";
import { retryTransient } from "@/lib/api/retry";

import { getMyOrderRefund } from "./api";
import { shippingFeeWaivedOf } from "./schemas";

import type { OrderRefund } from "./schemas";

/**
 * Đơn có gì để khách xem ở thẻ Hoàn tiền: tiền phải hoàn, phí vận chuyển được miễn (Q-19) hoặc phí còn phải trả
 * (`feeOwed`). Khách trả sau giao chưa trả đồng nào mà hàng bị hoàn: `refundable` = 0 nhưng vẫn được miễn phí vận chuyển
 * — thẻ phải hiện (audit r2 money M-4, tu-quyet "Thẻ Hoàn tiền hiện Phí vận chuyển được miễn").
 */
export function hasRefundCard(refund: OrderRefund): boolean {
  return refund.refundable > 0 || (refund.feeOwed ?? 0) > 0 || shippingFeeWaivedOf(refund) > 0;
}

export const refundKeys = {
  ofOrder: (orderId: string) => [...ORDERS_QUERY_ROOT, "refund", orderId] as const,
};

/** Đơn không có gì để xem (404, hoặc không có tiền hoàn / phí miễn / phí còn nợ): "không có" — không phải lỗi với khách. */
export function useMyOrderRefund(orderId: string, enabled = true) {
  return useQuery({
    queryKey: refundKeys.ofOrder(orderId),
    queryFn: async ({ signal }) => {
      try {
        const refund = await getMyOrderRefund(orderId, signal);
        return hasRefundCard(refund) ? refund : null;
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
