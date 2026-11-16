import { api } from "@/lib/api/client";

import { orderRefundDtoSchema, type OrderRefund } from "./schemas";

/**
 * GET /refunds/me/orders/{orderId} (payment-refunds:READ scope OWN): số phải hoàn của đơn do huỷ, đóng
 * phần còn lại hoặc trả hàng (kltn-docs 15 §4.5) và các lần Kế toán đã ghi nhận hoàn.
 */
export async function getMyOrderRefund(
  orderId: string,
  signal?: AbortSignal,
): Promise<OrderRefund> {
  const { data } = await api.get<unknown>(
    `/refunds/me/orders/${encodeURIComponent(orderId)}`,
    signal ? { signal } : {},
  );
  return orderRefundDtoSchema.parse(data);
}
