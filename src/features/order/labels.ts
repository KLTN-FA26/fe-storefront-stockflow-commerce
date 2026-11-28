import type { SemanticTone } from "@/lib/domain/types";

import type {
  CancellationReasonCode,
  CancellationRequestStatus,
  DeliveryState,
  HoldReason,
  ProductionState,
  VehicleMilestone,
  VehicleShipment,
} from "./types";

// Customer-facing wording for the BE's enums. UNKNOWN (a value newer than this FE) always has a
// neutral line, never the raw code.

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
  PARTIALLY_DELIVERED: "Đã giao một phần",
  DELIVERY_FAILED: "Giao không thành công",
  DELIVERED: "Đã giao",
  RETURNED: "Đã trả lại",
  // WF-05 F-2: never "Đã trả lại" for an order whose customer kept a delivered part. The rest may also
  // be a shipment the carrier lost (BE-35 for a partly fulfilled order), so not "về kho" either.
  PARTIALLY_RETURNED: "Bạn giữ một phần hàng; phần còn lại đã trả về hoặc thất lạc",
  UNKNOWN: "Đang cập nhật",
};

/**
 * What happens to the money paid on an order waiting for its credit limit (WF-02 Q-10): a credit
 * hold comes before CONFIRMED, so nothing is in production yet and a refusal refunds all of it.
 */
export const CREDIT_HOLD_REFUND =
  "Nếu hạn mức không được duyệt, hợp đồng bị huỷ bỏ và bạn được hoàn toàn bộ số tiền đã trả.";

/** Why an ON_HOLD order waits (BE holdReasonPublic): the only two things a customer is told. */
export const HOLD_REASON_LABEL: Record<HoldReason, string> = {
  AWAITING_CREDIT_APPROVAL: `Đơn đang chờ duyệt hạn mức công nợ. ${CREDIT_HOLD_REFUND}`,
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
 * Why the customer is asking Sales rather than cancelling: a released order has work in progress.
 * An ON_HOLD order is said to be short of production or the warehouse only on a credit hold, which
 * comes before CONFIRMED (WF-02 LC-4). Any other hold (payment, a trip, a short pick, a review) can
 * fall anywhere from CONFIRMED to PACKED, and the BE does not say where, so it gets a neutral
 * sentence. `holdReason` is the BE's holdReasonPublic.
 */
/** Signed or awaiting its contract, nothing released yet (BE OrderStatus, kltn-docs 17 §4.8). */
const BEFORE_RELEASE = new Set(["DRAFT", "PENDING_CONTRACT", "PENDING_PAYMENT", "CONFIRMED"]);

export function requestReason(
  status: string,
  holdReason: HoldReason | null | undefined,
): { help: string; dialog: string } {
  if (status === "ON_HOLD" && holdReason === "AWAITING_CREDIT_APPROVAL") {
    return {
      help: `Đơn đang chờ duyệt hạn mức công nợ, chưa chuyển cho sản xuất hoặc kho. ${CREDIT_HOLD_REFUND} Bạn có thể gửi yêu cầu huỷ để Sale xử lý, hoặc chat với Sale.`,
      dialog: `Đơn đang chờ duyệt hạn mức công nợ và chưa được chuyển cho sản xuất hoặc kho. ${CREDIT_HOLD_REFUND} Yêu cầu huỷ của bạn sẽ được Sale xem xét; đơn giữ nguyên cho đến khi có quyết định.`,
    };
  }
  if (status === "ON_HOLD") {
    return {
      help: "Đơn đang được chúng tôi xem xét. Bạn có thể gửi yêu cầu huỷ để Sale xử lý, hoặc chat với Sale.",
      dialog:
        "Đơn đang được chúng tôi xem xét. Yêu cầu huỷ của bạn sẽ được Sale xem xét theo điều khoản hợp đồng; đơn giữ nguyên cho đến khi có quyết định.",
    };
  }
  if (BEFORE_RELEASE.has(status)) {
    return {
      help: "Đơn chưa chuyển cho kho. Bạn có thể gửi yêu cầu huỷ để Sale xử lý theo hợp đồng, hoặc chat với Sale.",
      dialog:
        "Đơn chưa được chuyển cho kho. Yêu cầu huỷ của bạn sẽ được Sale xem xét theo điều khoản hợp đồng; tiền đã thanh toán (nếu có) được hoàn theo hợp đồng. Đơn giữ nguyên cho đến khi có quyết định.",
    };
  }
  return {
    help: "Đơn đã chuyển cho sản xuất hoặc kho nên cần Sale xem xét việc huỷ. Bạn có thể gửi yêu cầu huỷ hoặc chat với Sale.",
    dialog:
      "Đơn đã được chuyển cho sản xuất hoặc kho nên bạn không thể tự huỷ. Yêu cầu của bạn sẽ được Sale xem xét; việc huỷ có thể phát sinh chi phí cho phần việc đã làm. Đơn giữ nguyên cho đến khi có quyết định.",
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
    note: "Sale đang xem xét. Đơn giữ nguyên trạng thái cho đến khi có quyết định.",
  },
  APPROVED: {
    label: "Đã chấp nhận",
    tone: "positive",
    note: "Sale đã chấp nhận yêu cầu huỷ của bạn.",
  },
  REJECTED: {
    label: "Không được chấp nhận",
    tone: "warning",
    note: "Sale không chấp nhận yêu cầu huỷ nên đơn vẫn được xử lý bình thường.",
  },
  EXPIRED: {
    label: "Đã đóng",
    tone: "muted",
    note: "Đơn đã được đóng gói, giao đi, kết thúc hoặc huỷ theo cách khác trước khi Sale kịp quyết định, vì vậy yêu cầu huỷ này đã được đóng. Hãy xem trạng thái hiện tại của đơn; nếu cần hỗ trợ hoặc muốn trả hàng, hãy chat với Sale.",
  },
  UNKNOWN: {
    label: "Đang cập nhật",
    tone: "muted",
    note: "Hãy chat với Sale nếu bạn cần biết tình trạng yêu cầu huỷ này.",
  },
};

/** Journey milestones the carrier reports for a vehicle (kltn-docs 17 §5.2). */
export const VEHICLE_MILESTONE_LABEL: Record<VehicleMilestone["milestone"], string> = {
  PICKED_UP: "Đã lấy hàng",
  IN_TRANSIT: "Đang giao",
  RETURNING: "Đang hoàn hàng",
  UNKNOWN: "Đang cập nhật",
};

/** Outcome of one shipment on a vehicle, in the customer's wording. */
export const VEHICLE_SHIPMENT_STATUS_LABEL: Record<VehicleShipment["status"], string> = {
  READY_TO_DISPATCH: "Chưa giao",
  HANDED_OVER: "Đang giao",
  DELIVERED: "Đã giao",
  DELIVERY_FAILED: "Giao thất bại",
  RETURNED: "Đã trả",
  CANCELLED: "Đã huỷ",
  UNKNOWN: "Đang cập nhật",
};
