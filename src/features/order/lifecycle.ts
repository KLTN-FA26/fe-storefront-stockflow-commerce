import type { SemanticTone } from "@/lib/domain/types";

import type { OrderStatus, OrderStatusGroup } from "./types";

/**
 * Source: BE order.api.OrderStatus#customerMayCancelDirectly (main), which is false for every status
 * since the 4B rescope: an order runs under a signed contract, so the customer never cancels it on
 * their own and asks Sales instead (kltn-docs 17 §4.8). Used only when the BE sends no
 * `allowedActions` (an older BE); otherwise those decide (see allowedCancellation).
 */
const CANCELLABLE: ReadonlySet<OrderStatus> = new Set<OrderStatus>([]);

/**
 * The statuses OrderStatus#canTransitionTo(CANCELLED) allows: the customer may ask Sales to cancel.
 * From packing on it is a return, not a cancellation (17 §4.8). The BE re-checks (409).
 */
const CANCELLATION_REQUESTABLE: ReadonlySet<OrderStatus> = new Set<OrderStatus>([
  "PENDING_CONTRACT",
  "PENDING_PAYMENT",
  "CONFIRMED",
  "AWAITING_STOCK",
  "IN_PRODUCTION",
  "READY_TO_FULFILL",
  "PICKING",
  "ON_HOLD",
]);

/**
 * Where the order's journey has ended for the customer: nothing more will be shipped or charged on
 * its own (BE OrderStatus#isTerminal is CANCELLED and CLOSED; a completed, returned or refunded
 * order only waits to be closed, 17 §4.6 steps 21-22).
 */
const TERMINAL: ReadonlySet<OrderStatus> = new Set<OrderStatus>([
  "COMPLETED",
  "CLOSED",
  "CANCELLED",
  "RETURNED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
]);

export const isOrderCancellable = (status: OrderStatus) => CANCELLABLE.has(status);
export const isCancellationRequestable = (status: OrderStatus) =>
  CANCELLATION_REQUESTABLE.has(status);
export const isOrderTerminal = (status: OrderStatus) => TERMINAL.has(status);

/**
 * What the customer may do about cancelling: the BE's `allowedActions` when it sends them (the
 * portal shows these buttons instead of keeping its own list of statuses, G3-2), else the status.
 */
export function allowedCancellation(
  status: OrderStatus,
  allowed: { cancel: boolean; requestCancellation: boolean } | null | undefined,
): "cancel" | "request" | null {
  if (allowed) return allowed.cancel ? "cancel" : allowed.requestCancellation ? "request" : null;
  if (isOrderCancellable(status)) return "cancel";
  return isCancellationRequestable(status) ? "request" : null;
}

/**
 * Customer-facing label, semantic tone (special > danger > positive > warning > info > muted >
 * neutral) and a one-line "what happens next" hint for each status group — the wording the BE
 * itself says the customer reads (CustomerOrderCardResponse#statusGroup).
 */
export const ORDER_STATUS_GROUP_META: Record<
  OrderStatusGroup,
  { label: string; tone: SemanticTone; hint: string }
> = {
  AWAITING_CONTRACT: {
    label: "Chờ ký hợp đồng",
    tone: "warning",
    hint: "Hợp đồng mua bán đã được gửi. Đơn được xử lý khi hai bên ký hợp đồng.",
  },
  AWAITING_PAYMENT: {
    label: "Chờ thanh toán",
    tone: "warning",
    hint: "Đơn sẽ được xử lý ngay khi bạn thanh toán.",
  },
  UNDER_REVIEW: {
    label: "Đang xem xét",
    tone: "warning",
    hint: "Đơn đang được kiểm tra. Chúng tôi sẽ liên hệ bạn nếu cần thêm thông tin.",
  },
  CONFIRMED: {
    label: "Đã xác nhận",
    tone: "positive",
    hint: "Chúng tôi đã xác nhận đơn và sắp bắt đầu chuẩn bị cho bạn.",
  },
  AWAITING_STOCK: {
    label: "Đang chờ hàng",
    tone: "info",
    hint: "Hàng của đơn đang được sản xuất và sẽ nhập kho trước khi giao cho bạn.",
  },
  IN_PRODUCTION: {
    label: "Đang sản xuất",
    tone: "info",
    hint: "Sản phẩm của bạn đang được sản xuất.",
  },
  PREPARING: {
    label: "Đang chuẩn bị hàng",
    tone: "info",
    hint: "Kho đang lấy và đóng gói đơn hàng của bạn.",
  },
  SHIPPING: {
    label: "Đang giao hàng",
    tone: "info",
    hint: "Đơn đã rời kho và đang trên đường giao đến bạn.",
  },
  DELIVERED: {
    label: "Đã giao hàng",
    tone: "positive",
    hint: "Đơn đã được giao. Đơn hoàn tất khi hết hạn đổi trả và các đợt thanh toán đã đủ.",
  },
  CANCELLED: { label: "Đã huỷ", tone: "danger", hint: "Đơn đã bị huỷ và sẽ không được giao." },
  RETURNED: { label: "Đã trả hàng", tone: "special", hint: "Đơn hàng đã được trả lại." },
  // A group newer than this FE (see ORDER_STATUS_GROUP_UNKNOWN): neutral wording.
  UNKNOWN: {
    label: "Đang xử lý",
    tone: "info",
    hint: "Đơn hàng đang được xử lý. Hãy chat với chúng tôi nếu bạn cần hỗ trợ.",
  },
};

/**
 * Fulfilment progress derived from the status group alone — the BE order has no per-status timestamps.
 * `done` is how many steps are complete; CANCELLED/RETURNED leave the happy path (null).
 */
export const ORDER_PROGRESS_STEPS = [
  { id: "placed", label: "Đặt hàng" },
  { id: "paid", label: "Thanh toán" },
  { id: "fulfilment", label: "Chuẩn bị" },
  { id: "shipping", label: "Đang giao" },
  { id: "received", label: "Đã nhận" },
] as const;

const DONE_STEPS: Record<OrderStatusGroup, number | null> = {
  AWAITING_CONTRACT: 1,
  AWAITING_STOCK: 2,
  AWAITING_PAYMENT: 1,
  UNDER_REVIEW: 1,
  CONFIRMED: 2,
  IN_PRODUCTION: 2,
  PREPARING: 2,
  SHIPPING: 3,
  DELIVERED: 5,
  CANCELLED: null,
  RETURNED: null,
  // Unknown to this FE, so where it sits on the happy path is unknown too: no stepper.
  UNKNOWN: null,
};

export const orderProgressOf = (group: OrderStatusGroup) => DONE_STEPS[group];
