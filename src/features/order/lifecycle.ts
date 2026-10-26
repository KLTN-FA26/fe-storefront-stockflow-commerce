import type { SemanticTone } from "@/lib/domain/types";

import type { OrderStatus, OrderStatusGroup } from "./types";

/**
 * Source: BE order.api.OrderStatus#customerMayCancelDirectly (develop): a customer cancels on
 * their own only before anything is released to production or the warehouse. UI gating only —
 * the BE decides (the answer says CANCELLED or REQUESTED) and re-checks (409).
 */
const CANCELLABLE: ReadonlySet<OrderStatus> = new Set<OrderStatus>([
  "DRAFT",
  "PENDING_PAYMENT",
  "CONFIRMED",
]);

/**
 * Past that point the customer may still ask (BE OrderServiceImpl.cancelOwn → 202): every status
 * OrderStatus#canTransitionTo(CANCELLED) allows that is not directly cancellable. From SHIPPED on
 * it is a return, not a cancellation (kltn-docs 17 §4.5, BR-031). The BE also refuses once the
 * order is packed (ORDER_NOT_CANCELLABLE) and while a request is already waiting.
 */
const CANCELLATION_REQUESTABLE: ReadonlySet<OrderStatus> = new Set<OrderStatus>([
  "IN_PRODUCTION",
  "READY_TO_FULFILL",
  "IN_FULFILMENT",
  "ON_HOLD",
]);

/** BE OrderStatus#isTerminal. */
const TERMINAL: ReadonlySet<OrderStatus> = new Set<OrderStatus>([
  "COMPLETED",
  "CANCELLED",
  "RETURNED",
]);

export const isOrderCancellable = (status: OrderStatus) => CANCELLABLE.has(status);
export const isCancellationRequestable = (status: OrderStatus) =>
  CANCELLATION_REQUESTABLE.has(status);
export const isOrderTerminal = (status: OrderStatus) => TERMINAL.has(status);

/**
 * Customer-facing label, semantic tone (special > danger > positive > warning > info > muted >
 * neutral) and a one-line "what happens next" hint for each status group — the wording the BE
 * itself says the customer reads (CustomerOrderCardResponse#statusGroup).
 */
export const ORDER_STATUS_GROUP_META: Record<
  OrderStatusGroup,
  { label: string; tone: SemanticTone; hint: string }
> = {
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
    hint: "Đơn đã được giao. Cảm ơn bạn đã mua sắm.",
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
