/**
 * Customer-facing wording for a delivery's outcome, shared by the order pages and the chat's
 * ORDER_STATUS card (features must not import each other).
 */

/** Why staff recorded a delivery as failed (BE DeliveryFailureReason), in the customer's words. */
export const DELIVERY_FAILURE_REASON_LABEL = {
  CUSTOMER_ABSENT: "Không gặp được người nhận",
  REFUSED: "Người nhận từ chối nhận hàng",
  WRONG_ADDRESS: "Địa chỉ giao hàng không đúng",
  LOST: "Hàng thất lạc khi vận chuyển",
  DAMAGED: "Hàng hư hỏng khi vận chuyển",
  OTHER: "Lý do khác",
  UNKNOWN: "Đang cập nhật lý do",
} as const satisfies Record<string, string>;

/** A reason code the FE does not know (newer than this build) reads as "Đang cập nhật lý do". */
export function deliveryFailureLabel(code: string | null | undefined): string {
  return code && code in DELIVERY_FAILURE_REASON_LABEL
    ? DELIVERY_FAILURE_REASON_LABEL[code as keyof typeof DELIVERY_FAILURE_REASON_LABEL]
    : DELIVERY_FAILURE_REASON_LABEL.UNKNOWN;
}
