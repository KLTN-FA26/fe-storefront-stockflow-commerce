import type { SemanticTone } from "@/lib/domain/types";

import type {
  CancellationReasonCode,
  CancellationRequestStatus,
  DeliveryState,
  HoldReason,
  PaymentStatus,
  PaymentTerm,
  ProductionState,
} from "./types";

// Customer-facing wording for the BE's enums. UNKNOWN (a value newer than this FE) always has a
// neutral line, never the raw code.

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  UNPAID: "Chưa thanh toán",
  PARTIALLY_PAID: "Đã thanh toán một phần",
  ON_CREDIT: "Ghi nhận công nợ",
  PAID: "Đã thanh toán đủ",
  UNKNOWN: "Đang cập nhật",
};

export const PAYMENT_TERM_LABEL: Record<PaymentTerm, string> = {
  PREPAID: "Trả trước 100%",
  DEPOSIT: "Đặt cọc",
  CREDIT: "Công nợ",
  UNKNOWN: "Theo thoả thuận",
};

export const PRODUCTION_STATE_LABEL: Record<ProductionState, string> = {
  NOT_REQUIRED: "Hàng có sẵn, không cần sản xuất",
  NOT_STARTED: "Chưa bắt đầu sản xuất",
  IN_PROGRESS: "Đang sản xuất",
  DONE: "Đã sản xuất xong",
  CANCELLED: "Đã huỷ sản xuất",
  UNKNOWN: "Đang cập nhật tiến độ",
};

export const DELIVERY_STATE_LABEL: Record<DeliveryState, string> = {
  NOT_SHIPPED: "Chưa giao cho đơn vị vận chuyển",
  IN_TRANSIT: "Đang trên đường giao",
  DELIVERED: "Đã giao",
  RETURNED: "Đã trả lại",
  UNKNOWN: "Đang cập nhật",
};

/** Why an ON_HOLD order waits (BE holdReasonPublic): the only two things a customer is told. */
export const HOLD_REASON_LABEL: Record<HoldReason, string> = {
  AWAITING_CREDIT_APPROVAL: "Đơn đang chờ duyệt hạn mức công nợ.",
  UNDER_REVIEW: "Đơn đang được chúng tôi xem xét.",
  UNKNOWN: "Đơn đang được chúng tôi xem xét.",
};

export const CANCELLATION_REASON_LABEL: Record<CancellationReasonCode, string> = {
  CUSTOMER_REQUEST: "Theo yêu cầu của bạn",
  PAYMENT_NOT_RECEIVED: "Chưa nhận được thanh toán đúng hạn",
  PAYMENT_FAILED: "Thanh toán không thành công",
  OUT_OF_STOCK: "Không đủ hàng để giao",
  SUSPECTED_FRAUD: "Huỷ sau khi rà soát đơn hàng",
  CREDIT_REJECTED: "Đơn công nợ không được duyệt",
  DUPLICATE_ORDER: "Đơn đặt trùng",
  PRODUCTION_ISSUE: "Sự cố trong sản xuất",
  OTHER: "Lý do khác",
  UNKNOWN: "Đơn đã bị huỷ",
};

/** What a customer picks when cancelling or asking for cancellation. */
export const CUSTOMER_REASON_OPTIONS = [
  { value: "CUSTOMER_REQUEST", label: "Tôi không cần đơn này nữa" },
  { value: "DUPLICATE_ORDER", label: "Tôi đặt trùng đơn" },
  { value: "OTHER", label: "Lý do khác" },
] as const;

/**
 * Why the customer is asking Sales rather than cancelling: a released order has work in progress,
 * but an ON_HOLD one (credit limit, review) never reached production or the warehouse, so it must
 * not be told it did. `holdReason` is the BE's holdReasonPublic.
 */
export function requestReason(
  status: string,
  holdReason: HoldReason | null | undefined,
): { help: string; dialog: string } {
  if (status === "ON_HOLD") {
    const state =
      holdReason === "AWAITING_CREDIT_APPROVAL"
        ? "Đơn đang chờ duyệt hạn mức công nợ"
        : "Đơn đang được chúng tôi xem xét";
    return {
      help: `${state}, chưa chuyển cho sản xuất hoặc kho. Bạn có thể gửi yêu cầu huỷ để Sales xử lý, hoặc chat với chúng tôi.`,
      dialog: `${state} và chưa được chuyển cho sản xuất hoặc kho. Yêu cầu huỷ của bạn sẽ được Sales xem xét; đơn giữ nguyên cho đến khi có quyết định.`,
    };
  }
  return {
    help: "Đơn đã chuyển cho sản xuất hoặc kho nên cần Sales xem xét việc huỷ. Bạn có thể gửi yêu cầu huỷ hoặc chat với chúng tôi.",
    dialog:
      "Đơn đã được chuyển cho sản xuất hoặc kho nên bạn không thể tự huỷ. Yêu cầu của bạn sẽ được Sales xem xét; việc huỷ có thể phát sinh chi phí cho phần việc đã làm. Đơn giữ nguyên cho đến khi có quyết định.",
  };
}

/**
 * A cancellation request's state in the customer's wording, with a tone for its badge and what it
 * means for the order. `note` is fixed text, not the BE's `decisionNote`: for EXPIRED that is
 * English system text, and for the others Sales' own answer is shown beside it.
 */
export const CANCELLATION_REQUEST_META: Record<
  CancellationRequestStatus,
  { label: string; tone: SemanticTone; note: string }
> = {
  PENDING: {
    label: "Đang chờ xem xét",
    tone: "info",
    note: "Sales đang xem xét. Đơn giữ nguyên trạng thái cho đến khi có quyết định.",
  },
  APPROVED: {
    label: "Đã chấp nhận",
    tone: "positive",
    note: "Sales đã chấp nhận yêu cầu huỷ của bạn.",
  },
  REJECTED: {
    label: "Không được chấp nhận",
    tone: "warning",
    note: "Sales không chấp nhận yêu cầu huỷ nên đơn vẫn được xử lý bình thường.",
  },
  EXPIRED: {
    label: "Đã đóng",
    tone: "muted",
    note: "Đơn đã được đóng gói, giao đi, kết thúc hoặc huỷ theo cách khác trước khi Sales kịp quyết định, vì vậy yêu cầu huỷ này đã được đóng. Hãy xem trạng thái hiện tại của đơn; nếu cần hỗ trợ hoặc muốn trả hàng, hãy chat với chúng tôi.",
  },
  UNKNOWN: {
    label: "Đang cập nhật",
    tone: "muted",
    note: "Hãy chat với chúng tôi nếu bạn cần biết tình trạng yêu cầu huỷ này.",
  },
};
