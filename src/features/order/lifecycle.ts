import { ORDER_STATUS } from "@/lib/domain/status-map";
import type { SemanticTone } from "@/lib/domain/types";

import type { Order, OrderStatus, OrderStatusGroup } from "./types";

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
    ...ORDER_STATUS.AWAITING_CONTRACT,
    hint: "Hợp đồng mua bán đã được gửi. Đơn được xử lý khi hai bên ký hợp đồng.",
  },
  AWAITING_PAYMENT: {
    ...ORDER_STATUS.AWAITING_PAYMENT,
    hint: "Hệ thống tự xác nhận khoản chuyển vài giây sau khi tiền về, rồi đơn được xử lý tiếp.",
  },
  UNDER_REVIEW: {
    ...ORDER_STATUS.UNDER_REVIEW,
    hint: "Đơn đang được kiểm tra. Chúng tôi sẽ liên hệ bạn nếu cần thêm thông tin.",
  },
  CONFIRMED: {
    ...ORDER_STATUS.CONFIRMED,
    hint: "Chúng tôi đã xác nhận đơn và sắp bắt đầu chuẩn bị cho bạn.",
  },
  AWAITING_STOCK: {
    ...ORDER_STATUS.AWAITING_STOCK,
    hint: "Hàng của đơn đang được sản xuất và sẽ nhập kho trước khi giao cho bạn.",
  },
  IN_PRODUCTION: {
    ...ORDER_STATUS.IN_PRODUCTION,
    hint: "Sản phẩm của bạn đang được sản xuất.",
  },
  PREPARING: {
    ...ORDER_STATUS.PREPARING,
    hint: "Kho đang lấy và đóng gói đơn hàng của bạn.",
  },
  SHIPPING: {
    ...ORDER_STATUS.SHIPPING,
    hint: "Đơn đã rời kho và đang trên đường giao đến bạn.",
  },
  DELIVERED: {
    ...ORDER_STATUS.DELIVERED,
    hint: "Đơn đã được giao. Đơn hoàn tất khi hết hạn đổi trả và các đợt thanh toán đã đủ.",
  },
  // Apart from RETURNED: the goods are still with the customer while the return is decided.
  RETURN_REQUESTED: {
    ...ORDER_STATUS.RETURN_REQUESTED,
    hint: "Yêu cầu trả hàng của đơn đang được xử lý. Theo dõi từng bước trong mục Trả hàng.",
  },
  CANCELLED: { ...ORDER_STATUS.CANCELLED, hint: "Đơn đã bị huỷ và sẽ không được giao." },
  // Kept nothing: every delivered unit came back, returned by the customer or brought back by the
  // carrier (WF-05 F-2). Closed or not, the outcome is the same to the customer.
  RETURNED: {
    ...ORDER_STATUS.RETURNED,
    hint: "Đơn không còn hàng nào giao cho bạn: bạn đã trả hàng, đơn vị vận chuyển hoàn về kho, hoặc hàng thất lạc khi vận chuyển. Xem mục Thanh toán và Hoàn tiền để biết số tiền liên quan.",
  },
  // WF-05 F-2 (BE-35): part delivered and kept, the rest returned by the customer, brought back by
  // the carrier, or lost once the deliveries were over (a partly fulfilled order). Never "Đã trả hàng".
  PARTIALLY_RETURNED: {
    ...ORDER_STATUS.PARTIALLY_RETURNED,
    hint: "Bạn đã nhận và giữ một phần hàng của đơn. Phần còn lại không giao cho bạn nữa: bạn đã trả lại, đơn vị vận chuyển hoàn về kho hoặc làm thất lạc. Xem mục Thanh toán và Hoàn tiền để biết số tiền liên quan.",
  },
  // A group newer than this FE (see ORDER_STATUS_GROUP_UNKNOWN): neutral wording.
  UNKNOWN: {
    ...ORDER_STATUS.UNKNOWN,
    hint: "Đơn hàng đang được xử lý. Hãy chat với Sale nếu bạn cần hỗ trợ.",
  },
};

/**
 * What the badge and the status hero show: the status group, except a COMPLETED order and a CLOSED
 * one that was completed first. The BE folds both into the DELIVERED group
 * (CustomerOrders.StatusGroup), so read alone the customer would never see that the order is done —
 * and a closed order would read "hoàn tất khi hết hạn đổi trả" again (SF-02). A CLOSED order of the
 * refund branch keeps its group (RETURNED / PARTIALLY_RETURNED): that is what happened to its goods.
 */
export type OrderDisplayGroup = OrderStatusGroup | "COMPLETED" | "CLOSED";

export const ORDER_DISPLAY_META: Record<
  OrderDisplayGroup,
  { label: string; tone: SemanticTone; hint: string }
> = {
  ...ORDER_STATUS_GROUP_META,
  COMPLETED: {
    ...ORDER_STATUS.COMPLETED,
    hint: "Đơn đã hoàn tất: hết hạn đổi trả và các đợt thanh toán đã đủ.",
  },
  CLOSED: {
    ...ORDER_STATUS.CLOSED,
    hint: "Đơn đã hoàn tất và đã đóng: hết hạn đổi trả, không còn khoản nào phải thanh toán.",
  },
};

export function displayGroup(order: Pick<Order, "status" | "statusGroup">): OrderDisplayGroup {
  if (order.status === "COMPLETED") return "COMPLETED";
  if (order.status === "CLOSED" && order.statusGroup === "DELIVERED") return "CLOSED";
  return order.statusGroup;
}

/**
 * The order's progress as the B2B process runs (SF-UX-30): contract, first installment, production,
 * delivery, done. Derived from the status group and whether the first installment is paid — the BE
 * order has no per-step timestamps. CANCELLED / RETURNED leave the happy path, and a group newer than
 * this FE has no known place on it: no stepper (null).
 */
export type ProgressStepId = "contract" | "firstPayment" | "production" | "delivery" | "done";
/** `owed`: a step the order has moved past while it is still unpaid (the first installment). */
export type ProgressState = "done" | "current" | "owed" | "todo";
export interface ProgressStep {
  id: ProgressStepId;
  label: string;
  state: ProgressState;
}

const PROGRESS_STEPS: readonly { id: ProgressStepId; label: string }[] = [
  { id: "contract", label: "Hợp đồng" },
  { id: "firstPayment", label: "Thanh toán đợt đầu" },
  { id: "production", label: "Sản xuất" },
  { id: "delivery", label: "Giao hàng" },
  { id: "done", label: "Hoàn tất" },
];

/** Index of the current step per group; COMPLETED and CLOSED are past the last one. */
const CURRENT_STEP: Record<OrderDisplayGroup, number | null> = {
  AWAITING_CONTRACT: 0,
  AWAITING_PAYMENT: 1,
  UNDER_REVIEW: 1,
  CONFIRMED: 2,
  AWAITING_STOCK: 2,
  IN_PRODUCTION: 2,
  PREPARING: 3,
  SHIPPING: 3,
  DELIVERED: 4,
  // The goods reached the customer; a return of them is being decided.
  RETURN_REQUESTED: 4,
  COMPLETED: PROGRESS_STEPS.length,
  CLOSED: PROGRESS_STEPS.length,
  CANCELLED: null,
  RETURNED: null,
  // Goods came back: off the happy path, as RETURNED.
  PARTIALLY_RETURNED: null,
  UNKNOWN: null,
};

/**
 * @param firstInstallmentPaid whether the contract's first installment is paid; null while unknown
 *   (no installments read yet). The payment step is never ticked unless it is known to be paid:
 *   installments before and after delivery may still be owed (shown in the payment card instead).
 */
export function orderProgress(
  group: OrderDisplayGroup,
  firstInstallmentPaid: boolean | null,
): ProgressStep[] | null {
  let current = CURRENT_STEP[group];
  if (current === null) return null;
  // Under review after signing: past payment once the first installment is in.
  if (group === "UNDER_REVIEW" && firstInstallmentPaid) current = 2;
  const completed = group === "COMPLETED" || group === "CLOSED";
  return PROGRESS_STEPS.map((step, index) => {
    let state: ProgressState = index < current! ? "done" : index === current ? "current" : "todo";
    if (step.id === "firstPayment" && state === "done" && !completed && !firstInstallmentPaid) {
      state = "owed";
    }
    const label = step.id === "firstPayment" && state === "done" ? "Đã trả đợt 1" : step.label;
    return { id: step.id, label, state };
  });
}
