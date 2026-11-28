/**
 * One status map per domain (FRONTEND-AI-RULES §0.6, SF-UX-2): what a customer reads for a quote, a
 * contract, an order, an installment and a payment milestone, and the badge tone of each. The pages
 * and the chat cards both read these tables, so a quote followed from a chat card to its page shows
 * the same words in the same colour. A status that waits on the customer is worded from the
 * customer's side ("Chờ bạn phản hồi", "Chờ bạn ký").
 *
 * Tone priority when a status could fit several: special > danger > positive > warning > info >
 * muted > neutral. UNKNOWN is a value newer than this FE (`tolerantEnum`): never the raw code.
 *
 * The generic English-keyed table still lives at `@/lib/status-map` (StatusDot).
 */

import type { SemanticTone } from "./types";

export { toneOf, STATUS_LABEL_VI, type SemanticTone } from "@/lib/status-map";
export type { StatusDomain, Currency } from "./types";

export interface StatusMeta {
  label: string;
  tone: SemanticTone;
}

/** A label and tone from a table, or a neutral `fallback` for a value the table does not know. */
export function statusMetaOf(
  table: Readonly<Record<string, StatusMeta>>,
  value: string | null | undefined,
  fallback: string,
): StatusMeta {
  return (value ? table[value] : undefined) ?? { label: fallback, tone: "neutral" };
}

// ── Quote (kltn-docs 14 §5.1) ──

export type QuoteStatusKey =
  | "DRAFT"
  | "SENT"
  | "CHANGES_REQUESTED"
  | "ACCEPTED"
  | "EXPIRED"
  | "CANCELLED"
  | "CONVERTED"
  | "UNKNOWN";

export const QUOTE_STATUS: Readonly<Record<QuoteStatusKey, StatusMeta>> = {
  DRAFT: { label: "Nháp", tone: "neutral" },
  SENT: { label: "Chờ bạn phản hồi", tone: "warning" },
  CHANGES_REQUESTED: { label: "Đã yêu cầu sửa", tone: "info" },
  ACCEPTED: { label: "Đã chấp nhận", tone: "positive" },
  EXPIRED: { label: "Hết hiệu lực", tone: "muted" },
  CANCELLED: { label: "Đã huỷ", tone: "danger" },
  CONVERTED: { label: "Đã tạo đơn", tone: "positive" },
  UNKNOWN: { label: "Đang cập nhật", tone: "neutral" },
};

// ── Sales contract (kltn-docs 14 §5.2) ──

export type ContractStatusKey =
  | "DRAFT"
  | "SENT"
  | "CUSTOMER_SIGNED"
  | "CHANGES_REQUESTED"
  | "SIGNED"
  | "COMPLETED"
  | "LIQUIDATED"
  | "CANCELLED"
  | "UNKNOWN";

export const CONTRACT_STATUS: Readonly<Record<ContractStatusKey, StatusMeta>> = {
  DRAFT: { label: "Nháp", tone: "neutral" },
  SENT: { label: "Chờ bạn ký", tone: "warning" },
  CHANGES_REQUESTED: { label: "Đã yêu cầu chỉnh sửa", tone: "info" },
  CUSTOMER_SIGNED: { label: "Đã ký, chờ công ty ký", tone: "info" },
  SIGNED: { label: "Đã ký", tone: "positive" },
  COMPLETED: { label: "Hoàn tất", tone: "muted" },
  // WF-05 Q-6 (14 §5.2): the order ended with nothing delivered (all came back, all lost, cancelled
  // after signing) and its money is settled. Not "Hoàn tất": the contract was not performed.
  // Label exactly as decided ("Thanh lý", decision Q-6) and as the back office shows it.
  LIQUIDATED: { label: "Thanh lý", tone: "muted" },
  CANCELLED: { label: "Đã huỷ", tone: "danger" },
  UNKNOWN: { label: "Đang cập nhật", tone: "neutral" },
};

// ── Order, by the status group the BE reports to a customer (CustomerOrders.StatusGroup) plus
// COMPLETED and CLOSED-after-completion, which the BE folds into DELIVERED. ──

export type OrderDisplayGroupKey =
  | "AWAITING_CONTRACT"
  | "AWAITING_PAYMENT"
  | "UNDER_REVIEW"
  | "CONFIRMED"
  | "AWAITING_STOCK"
  | "IN_PRODUCTION"
  | "PREPARING"
  | "SHIPPING"
  | "DELIVERED"
  | "RETURN_REQUESTED"
  | "COMPLETED"
  | "CANCELLED"
  | "RETURNED"
  | "PARTIALLY_RETURNED"
  | "CLOSED"
  | "UNKNOWN";

export const ORDER_STATUS: Readonly<Record<OrderDisplayGroupKey, StatusMeta>> = {
  AWAITING_CONTRACT: { label: "Chờ ký hợp đồng", tone: "warning" },
  AWAITING_PAYMENT: { label: "Chờ thanh toán", tone: "warning" },
  UNDER_REVIEW: { label: "Đang xem xét", tone: "warning" },
  CONFIRMED: { label: "Đã xác nhận", tone: "positive" },
  AWAITING_STOCK: { label: "Đang chờ hàng", tone: "info" },
  IN_PRODUCTION: { label: "Đang sản xuất", tone: "info" },
  PREPARING: { label: "Đang chuẩn bị hàng", tone: "info" },
  SHIPPING: { label: "Đang giao hàng", tone: "info" },
  DELIVERED: { label: "Đã giao hàng", tone: "positive" },
  RETURN_REQUESTED: { label: "Đang yêu cầu trả hàng", tone: "warning" },
  COMPLETED: { label: "Hoàn tất", tone: "positive" },
  CANCELLED: { label: "Đã huỷ", tone: "danger" },
  RETURNED: { label: "Đã trả hàng", tone: "special" },
  // WF-05 F-2 (BE-35): the customer kept part of the goods; the rest came back (their return, the
  // carrier's) or was lost - not "Đã trả hàng", which would say they kept nothing, nor "hoàn về",
  // which a lost shipment never was.
  PARTIALLY_RETURNED: { label: "Giữ một phần hàng", tone: "info" },
  // A completed order the shop has since closed (SF-02): its journey is over.
  CLOSED: { label: "Đã đóng", tone: "muted" },
  UNKNOWN: { label: "Đang xử lý", tone: "info" },
};

// ── Installment (kltn-docs 15 §5.1). Overdue is a flag, not a status (WF-05 fix plan §8). ──

export type InstallmentStatusKey =
  "NOT_DUE" | "DUE" | "PARTIALLY_PAID" | "PAID" | "CANCELLED" | "UNKNOWN";

export const INSTALLMENT_STATUS: Readonly<Record<InstallmentStatusKey, StatusMeta>> = {
  NOT_DUE: { label: "Chưa đến hạn", tone: "neutral" },
  DUE: { label: "Đến hạn", tone: "warning" },
  PARTIALLY_PAID: { label: "Đã trả một phần", tone: "warning" },
  PAID: { label: "Đã thanh toán", tone: "positive" },
  CANCELLED: { label: "Đã huỷ", tone: "muted" },
  UNKNOWN: { label: "Đang cập nhật", tone: "neutral" },
};

export const INSTALLMENT_OVERDUE: StatusMeta = { label: "Quá hạn", tone: "danger" };

/**
 * What the customer reads for an installment: a DUE or PARTIALLY_PAID one past its due day reads
 * "Quá hạn" in danger; a paid or cancelled one never does.
 */
export function installmentStatusOf(
  status: string | null | undefined,
  overdue: boolean,
): StatusMeta {
  if (overdue && status !== "PAID" && status !== "CANCELLED") return INSTALLMENT_OVERDUE;
  return statusMetaOf(INSTALLMENT_STATUS, status, INSTALLMENT_STATUS.UNKNOWN.label);
}

// ── Payment milestone: when an installment falls due (kltn-docs 15 §4.1 step 2). ──

export type InstallmentMilestoneKey =
  | "ON_SIGNING"
  | "BEFORE_DELIVERY"
  | "AFTER_DELIVERY"
  | "CANCELLATION_FEE"
  | "FAILED_TRIP_FEE"
  | "UNKNOWN";

export const INSTALLMENT_MILESTONE: Readonly<Record<InstallmentMilestoneKey, string>> = {
  ON_SIGNING: "Khi ký hợp đồng",
  BEFORE_DELIVERY: "Trước khi giao hàng",
  AFTER_DELIVERY: "Sau khi giao hàng",
  // Khoản phí lập khi huỷ đơn hoặc khi đóng phần còn lại; nhãn của từng khoản theo tên BE (`installmentMilestoneLabel`)
  CANCELLATION_FEE: "Phí huỷ đơn / đóng phần còn lại",
  FAILED_TRIP_FEE: "Phí chuyến giao không thành",
  UNKNOWN: "Theo hợp đồng",
};

export const milestoneLabelOf = (milestone: string | null | undefined): string =>
  (milestone ? (INSTALLMENT_MILESTONE as Record<string, string>)[milestone] : undefined) ??
  INSTALLMENT_MILESTONE.UNKNOWN;
