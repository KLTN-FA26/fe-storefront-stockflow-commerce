import type { SemanticTone } from "@/lib/domain/types";

import type { OrderStatus } from "./types";

/**
 * BR-031 — cancellation is refused from SHIPPED onwards; the goods are with the carrier and the
 * correct process is a return. Source: BE order.api.OrderStatus#canTransitionTo(CANCELLED)
 * (develop): true only for DRAFT, PENDING_PAYMENT, PAID, IN_FULFILMENT, ON_HOLD.
 * UI gating only — the BE re-checks and answers 409 CONFLICT.
 */
const CANCELLABLE: ReadonlySet<OrderStatus> = new Set<OrderStatus>([
  "DRAFT",
  "PENDING_PAYMENT",
  "PAID",
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
export const isOrderTerminal = (status: OrderStatus) => TERMINAL.has(status);

/**
 * Customer-facing label, semantic tone (special > danger > positive > warning > info > muted >
 * neutral) and a one-line "what happens next" hint for each status.
 */
export const ORDER_STATUS_META: Record<
  OrderStatus,
  { label: string; tone: SemanticTone; hint: string }
> = {
  DRAFT: {
    label: "Nháp",
    tone: "neutral",
    hint: "Đơn chưa được gửi. Hoàn tất đặt hàng để chúng tôi giữ hàng cho bạn.",
  },
  PENDING_PAYMENT: {
    label: "Chờ thanh toán",
    tone: "warning",
    hint: "Đơn sẽ được chuẩn bị ngay khi bạn thanh toán.",
  },
  PAID: {
    label: "Đã thanh toán",
    tone: "positive",
    hint: "Chúng tôi đã nhận thanh toán và đang chuẩn bị hàng cho bạn.",
  },
  IN_FULFILMENT: {
    label: "Đang chuẩn bị hàng",
    tone: "info",
    hint: "Kho đang lấy và đóng gói đơn hàng của bạn.",
  },
  ON_HOLD: {
    label: "Tạm giữ",
    tone: "warning",
    hint: "Đơn đang tạm giữ để kiểm tra. Chúng tôi sẽ liên hệ bạn nếu cần thêm thông tin.",
  },
  SHIPPED: {
    label: "Đang giao hàng",
    tone: "info",
    hint: "Đơn đã rời kho và đang trên đường giao đến bạn.",
  },
  DELIVERED: {
    label: "Đã giao hàng",
    tone: "positive",
    hint: "Đơn đã được giao. Cảm ơn bạn đã mua sắm.",
  },
  COMPLETED: { label: "Hoàn tất", tone: "positive", hint: "Đơn hàng đã hoàn tất." },
  CANCELLED: { label: "Đã huỷ", tone: "danger", hint: "Đơn đã bị huỷ và sẽ không được giao." },
  RETURNED: { label: "Đã trả hàng", tone: "special", hint: "Đơn hàng đã được trả lại." },
};

/**
 * Fulfilment progress derived from the status alone — the BE order has no per-status timestamps.
 * `done` is how many steps are complete; CANCELLED/RETURNED leave the happy path (null).
 */
export const ORDER_PROGRESS_STEPS = [
  { id: "placed", label: "Đặt hàng" },
  { id: "paid", label: "Thanh toán" },
  { id: "fulfilment", label: "Chuẩn bị" },
  { id: "shipping", label: "Đang giao" },
  { id: "received", label: "Đã nhận" },
] as const;

const DONE_STEPS: Record<OrderStatus, number | null> = {
  DRAFT: 0,
  PENDING_PAYMENT: 1,
  PAID: 2,
  IN_FULFILMENT: 2,
  ON_HOLD: 2,
  SHIPPED: 3,
  DELIVERED: 5,
  COMPLETED: 5,
  CANCELLED: null,
  RETURNED: null,
};

export const orderProgressOf = (status: OrderStatus) => DONE_STEPS[status];
