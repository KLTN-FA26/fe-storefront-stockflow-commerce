import type { SemanticTone } from "@/lib/domain/types";
import { RETURN_WINDOW_DAYS, returnWindowEnd } from "@/lib/domain/return-window";

import type { CustomerReturn, ReturnReason, ReturnStatus } from "./schemas";

/** Trạng thái khách đọc (BE `ReturnStatus`, 17 §4.10). */
export const RETURN_STATUS_META: Record<
  ReturnStatus,
  { label: string; tone: SemanticTone; help: string }
> = {
  REQUESTED: {
    label: "Chờ duyệt",
    tone: "neutral",
    help: "Sales đang xem ảnh và mô tả của bạn để quyết định.",
  },
  AWAITING_RETURN: {
    label: "Chờ gửi hàng về",
    tone: "warning",
    help: "Yêu cầu đã được duyệt. Hãy gửi số hàng được duyệt về kho trước hạn, ghi số RMA trên kiện hàng.",
  },
  RECEIVED: {
    label: "Kho đã nhận hàng",
    tone: "info",
    help: "Kho đã nhận hàng trả về. Sales đang lập đề nghị hoàn tiền.",
  },
  INSPECTED: {
    label: "Đã kiểm hàng",
    tone: "info",
    help: "Hàng trả về đã được kiểm.",
  },
  SETTLEMENT_PENDING: {
    label: "Đang duyệt hoàn tiền",
    tone: "info",
    help: "Đề nghị hoàn tiền đang chờ Kế toán duyệt.",
  },
  RESOLVED: {
    label: "Đã hoàn tiền",
    tone: "special",
    help: "Giá trị hàng trả được trừ vào các đợt còn nợ; phần đã thanh toán sẽ được chuyển khoản lại.",
  },
  REJECTED: { label: "Bị từ chối", tone: "danger", help: "Yêu cầu không được chấp nhận." },
  CANCELLED: { label: "Đã rút", tone: "muted", help: "Yêu cầu đã được rút." },
  EXPIRED: {
    label: "Quá hạn gửi hàng",
    tone: "danger",
    help: "Hàng không về kho trước hạn nên yêu cầu đã hết hiệu lực.",
  },
  UNKNOWN: { label: "Đang cập nhật", tone: "neutral", help: "" },
};

export const RETURN_REASON_LABEL: Record<ReturnReason, string> = {
  PRINT_DEFECT: "Lỗi in (nhoè, phai, lệch, sai màu)",
  DESIGN_MISMATCH: "In không đúng mẫu đã duyệt",
  DAMAGED_IN_TRANSIT: "Hư hỏng khi vận chuyển",
  WRONG_ITEM: "Giao sai hàng",
  SHORT_DELIVERY: "Giao thiếu",
  CHANGED_MIND: "Đổi ý",
  OTHER: "Khác",
  UNKNOWN: "Khác",
};

/** Hàng chưa về: khách còn rút được (BE `cancel`: REQUESTED, AWAITING_RETURN). */
export const isWithdrawable = (status: ReturnStatus) =>
  status === "REQUESTED" || status === "AWAITING_RETURN";

/** Ảnh vấn đề chỉ thêm được khi yêu cầu còn chờ duyệt. */
export const acceptsPhotos = (status: ReturnStatus) => status === "REQUESTED";

/** Còn mở: giữ số lượng của dòng và giữ đơn khỏi hoàn tất (BE `ReturnStatus.isOpen`). */
export const isReturnOpen = (status: ReturnStatus) =>
  status === "REQUESTED" ||
  status === "AWAITING_RETURN" ||
  status === "RECEIVED" ||
  status === "SETTLEMENT_PENDING";

/**
 * Khách tự mở yêu cầu được không (BE `ReturnRequest.requireReturnable`, BR-RMA-001): đơn
 * `DELIVERED` / `RETURN_REQUESTED`, còn trong hạn (`windowDays`, mặc định 7) từ ngày giao. Ngoài hạn hay đơn đã tất toán
 * do trả hàng thì phải nhờ Sales. BE vẫn kiểm lại.
 */
export function canOpenReturn(
  orderStatus: string,
  deliveredAt: string | undefined,
  now: Date = new Date(),
  windowDays: number = RETURN_WINDOW_DAYS,
): boolean {
  if (orderStatus !== "DELIVERED" && orderStatus !== "RETURN_REQUESTED") return false;
  if (!deliveredAt) return orderStatus === "RETURN_REQUESTED";
  return returnWindowEnd(deliveredAt, windowDays).getTime() > now.getTime();
}

/**
 * Số cái của một dòng đơn khách còn yêu cầu trả được: đã giao trừ phần các yêu cầu khác còn giữ
 * (BE `ReturnLine.claimedUnits`: yêu cầu đang mở giữ số yêu cầu / duyệt; đã xong giữ số hoàn;
 * bị từ chối / rút / quá hạn không giữ gì).
 */
export function claimedUnits(
  line: {
    requestedQuantity: number;
    approvedQuantity?: number | null | undefined;
    refundQuantity: number;
  },
  status: ReturnStatus,
): number {
  switch (status) {
    case "REQUESTED":
      return line.requestedQuantity;
    case "AWAITING_RETURN":
    case "RECEIVED":
    case "SETTLEMENT_PENDING":
      return line.approvedQuantity ?? 0;
    case "RESOLVED":
      return line.refundQuantity;
    default:
      return 0;
  }
}

/**
 * Đơn vị đã bị các yêu cầu khác giữ, theo dòng đơn (mọi lần giao); và các dòng đang có yêu cầu mở.
 * Có `delivery`: chỉ yêu cầu của cùng lần giao đó chặn dòng (BE `ReturnRequestService.openOwn`,
 * WF-05 TH-1 — `Objects.equals(other.shipmentId, shipmentId)`, null là đơn giao một lần).
 */
export function claimsByOrderLine(
  returns: readonly CustomerReturn[],
  delivery?: { shipmentId: string | null },
): {
  claimed: Map<string, number>;
  open: Set<string>;
} {
  const claimed = new Map<string, number>();
  const open = new Set<string>();
  for (const request of returns) {
    const sameDelivery = !delivery || (request.shipmentId ?? null) === delivery.shipmentId;
    for (const line of request.lines) {
      const units = claimedUnits(line, request.status);
      claimed.set(line.orderLineId, (claimed.get(line.orderLineId) ?? 0) + units);
      if (sameDelivery && isReturnOpen(request.status)) open.add(line.orderLineId);
    }
  }
  return { claimed, open };
}
