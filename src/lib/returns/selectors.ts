import type { SemanticTone } from "@/lib/domain/types";
import { RETURN_WINDOW_DAYS, returnWindowEnd } from "@/lib/domain/return-window";

import type {
  CustomerReturn,
  ReturnReason,
  ReturnRefusalReason,
  ReturnRow,
  ReturnStatus,
} from "./schemas";

/**
 * Trạng thái khách đọc (BE `ReturnStatus`, 17 §4.10). `RESOLVED` ở đây là nhãn của yêu cầu đã hoàn
 * tiền; một yêu cầu xong mà không hoàn đồng nào đọc `RETURN_NOT_REFUNDED_META` — luôn qua
 * `returnStatusMeta`, không đọc thẳng bảng này cho một yêu cầu cụ thể.
 */
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

/**
 * Nhãn tiếng Việt của lý do không hoàn tiền — đúng chữ của bundle `_vi` BE
 * (`label.ReturnRefusalReason.*`, WF-05 Q-4). Lý do mới hơn FE: null, không đoán chữ.
 */
export const RETURN_REFUSAL_REASON_LABEL: Record<ReturnRefusalReason, string | null> = {
  CUSTOMER_DAMAGE: "Hư hỏng do bảo quản/sử dụng",
  NOT_DEFECTIVE: "Không phát hiện lỗi",
  OUT_OF_POLICY: "Ngoài chính sách đổi trả",
  OTHER: "Lý do khác",
  UNKNOWN: null,
};

/** Một yêu cầu đã xong mà không hoàn đồng nào (WF-05 Q-4, SF-01): không bao giờ "Đã hoàn tiền". */
export const RETURN_NOT_REFUNDED_META: { label: string; tone: SemanticTone; help: string } = {
  label: "Đã xử lý — không hoàn tiền",
  tone: "neutral",
  help: "Yêu cầu đã được xử lý xong và không có khoản hoàn tiền nào.",
};

/** Yêu cầu đã xong kết thúc thế nào, như khách đọc. */
export type RefundOutcome = "REFUNDED" | "REFUSED" | "NOTHING_TO_REFUND";

type OutcomeSource = Pick<ReturnRow, "status" | "refundedAmount" | "offsetAmount" | "outcome"> &
  Partial<Pick<ReturnRow, "settlementAmount">> &
  Partial<Pick<CustomerReturn, "refusalReason" | "lines">>;

/**
 * Một yêu cầu `RESOLVED` có hoàn tiền thật hay không (SF-01); null khi chưa xong. BE nói
 * `outcome` (REFUSED / NOTHING_TO_REFUND được tin ngay); còn lại chỉ coi là đã hoàn khi có tiền
 * thật — phần chuyển lại, phần trừ vào đợt còn nợ, tiền hoàn của dòng hay số đề nghị lớn hơn 0 —
 * nên một yêu cầu xong với 0 đồng không bao giờ đọc "Đã hoàn tiền", kể cả trên BE cũ không gửi
 * `outcome` (Σ`refundQuantity` = 0, hai khoản tiền 0 hay vắng).
 */
export function refundOutcome(request: OutcomeSource): RefundOutcome | null {
  if (request.status !== "RESOLVED") return null;
  if (request.outcome === "REFUSED" || request.outcome === "NOTHING_TO_REFUND") {
    return request.outcome;
  }
  const lineMoney = (request.lines ?? []).reduce(
    (sum, line) => sum + Math.max(line.refundAmount ?? 0, 0),
    0,
  );
  const money = Math.max(
    (request.refundedAmount ?? 0) + (request.offsetAmount ?? 0),
    lineMoney,
    request.settlementAmount ?? 0,
  );
  if (money > 0) return "REFUNDED";
  return request.refusalReason ? "REFUSED" : "NOTHING_TO_REFUND";
}

/** Nhãn, màu và lời giải thích của một yêu cầu cụ thể: như bảng, trừ RESOLVED không hoàn tiền. */
export function returnStatusMeta(request: OutcomeSource): {
  label: string;
  tone: SemanticTone;
  help: string;
} {
  const outcome = refundOutcome(request);
  return outcome !== null && outcome !== "REFUNDED"
    ? RETURN_NOT_REFUNDED_META
    : RETURN_STATUS_META[request.status];
}

/** Hàng chưa về: khách còn rút được (BE `cancel`: REQUESTED, AWAITING_RETURN). */
export const isWithdrawable = (status: ReturnStatus) =>
  status === "REQUESTED" || status === "AWAITING_RETURN";

/**
 * Khách rút được yêu cầu này không: trạng thái còn rút được và chưa kiện hàng trả nào về kho. Mỗi
 * kiện kho nhận ghi `receivedAt` và `lines[].receivedQuantity` trong khi yêu cầu vẫn
 * `AWAITING_RETURN`; khi đó BE từ chối rút (`RETURN_GOODS_PARTLY_RECEIVED`, WF-05 TH-3).
 */
export const canWithdrawReturn = (
  request: Pick<CustomerReturn, "status" | "receivedAt" | "lines">,
): boolean =>
  isWithdrawable(request.status) &&
  !request.receivedAt &&
  !request.lines.some((line) => (line.receivedQuantity ?? 0) > 0);

/**
 * Ảnh vấn đề thêm được khi yêu cầu còn chờ duyệt hoặc đã duyệt và đang chờ hàng về — đúng hai trạng
 * thái BE nhận ảnh của khiếu nại (`ReturnRequest.requireEvidenceAllowed`, stage CLAIM; SF-04).
 */
export const acceptsPhotos = (status: ReturnStatus) =>
  status === "REQUESTED" || status === "AWAITING_RETURN";

/** Còn mở: giữ số lượng của dòng và giữ đơn khỏi hoàn tất (BE `ReturnStatus.isOpen`). */
export const isReturnOpen = (status: ReturnStatus) =>
  status === "REQUESTED" ||
  status === "AWAITING_RETURN" ||
  status === "RECEIVED" ||
  status === "SETTLEMENT_PENDING";

/**
 * Chỉ cho BE cũ không gửi lần giao nào kèm `returnableQuantity`: khách tự mở yêu cầu được không
 * (BE `ReturnRequest.requireReturnable`, BR-RMA-001) — đơn `DELIVERED` / `RETURN_REQUESTED`, còn
 * trong hạn (`windowDays`, mặc định 7) từ ngày giao. Khi BE gửi số trả được của từng lần giao thì
 * `returnEligibility` đọc số đó, không dùng hàm này (SF-05). BE vẫn kiểm lại.
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
 * Số cái của một dòng đơn mà một yêu cầu đang giữ, như BE `ReturnLine.claimedUnits` tính sau BE-21
 * (WF-05): hàng đã về kho luôn bị giữ, để không khiếu nại lại được hàng đã trả về. Đang chờ duyệt:
 * số yêu cầu; đã duyệt, đang chờ hàng hay chờ hoàn: số lớn hơn giữa số duyệt và số kho đã nhận; đã
 * xong: số lớn hơn giữa số được hoàn và số kho đã nhận (hoàn 0 đồng vẫn giữ hàng đã về); từ chối /
 * rút / quá hạn: chỉ số kho đã nhận (thường là 0). Chỉ dùng để hiển thị và cho BE cũ không gửi
 * `returnableQuantity`; số trả được thật là của BE.
 */
export function claimedUnits(
  line: {
    requestedQuantity: number;
    approvedQuantity?: number | null | undefined;
    receivedQuantity?: number | null | undefined;
    refundQuantity: number;
  },
  status: ReturnStatus,
): number {
  const received = Math.max(line.receivedQuantity ?? 0, 0);
  switch (status) {
    case "REQUESTED":
      return Math.max(line.requestedQuantity, received);
    case "AWAITING_RETURN":
    case "RECEIVED":
    case "SETTLEMENT_PENDING":
      return Math.max(line.approvedQuantity ?? 0, received);
    case "RESOLVED":
      return Math.max(line.refundQuantity, received);
    default:
      return received;
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
