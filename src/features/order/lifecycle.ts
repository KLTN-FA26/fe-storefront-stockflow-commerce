import { ORDER_STATUS, type OrderStatus } from "@/constants";

/**
 * BR-031: không được huỷ đơn từ "Shipped" trở đi.
 * CHƯƠNG 17 / D5 — khách tự huỷ chỉ khi đơn chưa rời kho.
 */
const NON_CANCELLABLE: readonly OrderStatus[] = [
  ORDER_STATUS.SHIPPED,
  "In Transit",
  "Delivery Failed",
  "Delivered",
  "Return Requested",
  "Returned",
  "Refunded",
  "Partially Refunded",
  "Completed",
  ORDER_STATUS.CANCELLED,
  "Closed",
];

export function isOrderCancellable(status: OrderStatus): boolean {
  return !NON_CANCELLABLE.includes(status);
}
