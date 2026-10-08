import { ORDER_STATUS, type OrderStatus } from "@/constants";

/** Raw 0-indexed order status value returned by the backend (scrub-242/245). */
export type BackendOrderStatus =
  | "DRAFT"
  | "PENDING_PAYMENT"
  | "PAYMENT_FAILED"
  | "CONFIRMED"
  | "IN_PRODUCTION"
  | "READY_TO_FULFILL"
  | "SHIPPED"
  | "DELIVERED"
  | "COMPLETED"
  | "CANCELLED";

// ASSUMPTION (open-question 1): BE "PAID" → "Confirmed", "IN_FULFILMENT" →
// "Ready to Fulfill". Re-check with Uông Thanh Tú when the real API lands.
const BACKEND_ORDER_STATUS_MAP: Record<BackendOrderStatus, OrderStatus> = {
  DRAFT: ORDER_STATUS.DRAFT,
  PENDING_PAYMENT: ORDER_STATUS.PENDING_PAYMENT,
  PAYMENT_FAILED: ORDER_STATUS.PAYMENT_FAILED,
  CONFIRMED: ORDER_STATUS.CONFIRMED,
  IN_PRODUCTION: ORDER_STATUS.IN_PRODUCTION,
  READY_TO_FULFILL: ORDER_STATUS.READY_TO_FULFILL,
  SHIPPED: ORDER_STATUS.SHIPPED,
  DELIVERED: ORDER_STATUS.DELIVERED,
  COMPLETED: ORDER_STATUS.COMPLETED,
  CANCELLED: ORDER_STATUS.CANCELLED,
};

export function mapBackendOrderStatus(status: BackendOrderStatus): OrderStatus {
  return BACKEND_ORDER_STATUS_MAP[status];
}
