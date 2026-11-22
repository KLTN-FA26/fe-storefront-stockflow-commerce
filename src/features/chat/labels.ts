/**
 * Vietnamese labels and tones for the chat's statuses (kltn-docs 16 §5, plan B.0.1 and B.7). A
 * value the table does not know keeps a neutral label instead of showing the BE's enum name.
 */

import type { SemanticTone } from "@/lib/domain/types";

export interface StatusMeta {
  label: string;
  tone: SemanticTone;
}

const meta = (
  table: Record<string, StatusMeta>,
  value: string | null | undefined,
  fallback: string,
) => (value ? table[value] : undefined) ?? { label: fallback, tone: "neutral" as const };

/** ConversationStatus as the customer reads it: staff-side nuances collapse to "đang trao đổi". */
const CONVERSATION_STATUS: Record<string, StatusMeta> = {
  NEW: { label: "Chờ Sale nhận", tone: "info" },
  QUEUED: { label: "Chờ Sale nhận", tone: "info" },
  ASSIGNED: { label: "Đã có Sale phụ trách", tone: "info" },
  ACTIVE: { label: "Đang trao đổi", tone: "positive" },
  WAITING_ON_CUSTOMER: { label: "Chờ bạn phản hồi", tone: "warning" },
  WAITING_ON_INTERNAL: { label: "Sale đang kiểm tra", tone: "info" },
  ESCALATED: { label: "Đang được xử lý", tone: "info" },
  REOPENED: { label: "Đã mở lại", tone: "info" },
  RESOLVED: { label: "Đã giải quyết", tone: "muted" },
  AUTO_CLOSED: { label: "Đã đóng", tone: "muted" },
  CLOSED: { label: "Đã đóng", tone: "muted" },
};
export const conversationStatusMeta = (status: string) =>
  meta(CONVERSATION_STATUS, status, "Đang trao đổi");

const CONTEXT_KIND: Record<string, string> = {
  PRODUCT: "Sản phẩm",
  CUSTOMER_SKU: "SKU riêng",
  DESIGN: "Bản thiết kế",
  DESIGN_PROJECT: "Dự án thiết kế",
  QUOTE: "Báo giá",
  ORDER: "Đơn hàng",
  CONTRACT: "Hợp đồng",
  // Staff document: its chip is hidden (SF-UX-26); "Lô in" wherever its name still shows.
  PRODUCTION_ORDER: "Lô in",
  EINVOICE: "Hoá đơn",
};
export const contextKindLabel = (kind: string) => CONTEXT_KIND[kind] ?? "Chứng từ";

/** Design status on a quote request card (16 §4.2): chờ duyệt / đã duyệt / bị trả lại. */
const DESIGN_STATUS: Record<string, StatusMeta> = {
  PENDING_REVIEW: { label: "Chờ duyệt thiết kế", tone: "warning" },
  APPROVED: { label: "Đã duyệt", tone: "positive" },
  DRAFT: { label: "Bị trả lại", tone: "danger" },
  ARCHIVED: { label: "Đã xoá", tone: "muted" },
};
/** A DRAFT design on a request card was returned (with `returnReason`); without one it is a draft. */
export const designStatusMeta = (status: string, returned: boolean) =>
  status === "DRAFT" && !returned
    ? { label: "Bản nháp", tone: "neutral" as const }
    : meta(DESIGN_STATUS, status, "Đang cập nhật");

const REQUEST_STATUS: Record<string, StatusMeta> = {
  OPEN: { label: "Đang chờ báo giá", tone: "info" },
  CLOSED: { label: "Đã đóng", tone: "muted" },
};
export const requestStatusMeta = (status: string | null | undefined) =>
  meta(REQUEST_STATUS, status, "Đang chờ báo giá");

const QUOTE_STATUS: Record<string, StatusMeta> = {
  // Waiting on the customer, said from their side (SF-UX-2; the same words as the quote pages).
  SENT: { label: "Chờ bạn phản hồi", tone: "warning" },
  ACCEPTED: { label: "Đã chấp nhận", tone: "positive" },
  CHANGES_REQUESTED: { label: "Đã yêu cầu sửa", tone: "info" },
  EXPIRED: { label: "Hết hiệu lực", tone: "muted" },
  CANCELLED: { label: "Đã huỷ", tone: "danger" },
  CONVERTED: { label: "Đã lên đơn", tone: "positive" },
};
export const quoteStatusMeta = (status: string) => meta(QUOTE_STATUS, status, "Báo giá");

/** CONTRACT card status (plan E1): Chờ bạn ký / Đã ký / Đã huỷ / Hoàn tất. */
const CONTRACT_STATUS: Record<string, StatusMeta> = {
  SENT: { label: "Chờ bạn ký", tone: "warning" },
  SIGNED: { label: "Đã ký", tone: "positive" },
  CANCELLED: { label: "Đã huỷ", tone: "danger" },
  COMPLETED: { label: "Hoàn tất", tone: "muted" },
};
export const contractStatusMeta = (status: string) => meta(CONTRACT_STATUS, status, "Hợp đồng");

/** A SENT contract whose signed copy the customer already sent in the chat: Sales have to record it (SF-UX-24). */
export const SIGNED_COPY_SENT: StatusMeta = { label: "Chờ Sale xác nhận", tone: "info" };

const INSTALLMENT_STATUS: Record<string, StatusMeta> = {
  NOT_DUE: { label: "Chưa đến hạn", tone: "neutral" },
  DUE: { label: "Đến hạn", tone: "warning" },
  PARTIALLY_PAID: { label: "Trả một phần", tone: "info" },
  PAID: { label: "Đã thanh toán", tone: "positive" },
  CANCELLED: { label: "Đã huỷ", tone: "muted" },
};
export const installmentStatusMeta = (status: string | null | undefined, overdue: boolean) =>
  overdue && status !== "PAID" && status !== "CANCELLED"
    ? { label: "Quá hạn", tone: "danger" as const }
    : meta(INSTALLMENT_STATUS, status, "Đợt thanh toán");

const MILESTONE: Record<string, string> = {
  ON_SIGNING: "Khi ký hợp đồng",
  BEFORE_DELIVERY: "Trước khi giao",
  AFTER_DELIVERY: "Sau khi giao",
};
export const milestoneLabel = (milestone: string) => MILESTONE[milestone] ?? "Theo hợp đồng";

/** ORDER_STATUS card: what happened to a shipment (BE shipmentChanged). */
const SHIPMENT_STATUS: Record<string, StatusMeta> = {
  HANDED_OVER: { label: "Đã bàn giao cho đơn vị vận chuyển", tone: "info" },
  DELIVERED: { label: "Đã giao", tone: "positive" },
  DELIVERY_FAILED: { label: "Giao không thành công", tone: "danger" },
};
export const shipmentStatusMeta = (status: string) =>
  meta(SHIPMENT_STATUS, status, "Cập nhật giao hàng");

/** SAMPLE_APPROVAL card: the round of print samples waiting for the customer's answer. */
const SAMPLE_STATUS: Record<string, StatusMeta> = {
  WAITING: { label: "Chờ bạn duyệt", tone: "warning" },
  APPROVED: { label: "Đã duyệt", tone: "positive" },
  REPRINT_REQUESTED: { label: "Đã yêu cầu in lại", tone: "info" },
};
export const sampleStatusMeta = (status: string) => meta(SAMPLE_STATUS, status, "Mẫu in");

/** A card that no longer waits for anyone (plan B.7): what replaces its own status badge. */
const CLOSED_CARD_STATE: Record<string, StatusMeta> = {
  SUPERSEDED: { label: "Đã thay bằng bản mới", tone: "muted" },
  EXPIRED: { label: "Hết hiệu lực", tone: "muted" },
  CANCELLED: { label: "Đã huỷ", tone: "danger" },
  // BE closes a card (e.g. a sample round whose production order stopped) without touching its payload.
  CLOSED: { label: "Đã đóng", tone: "muted" },
};
export const closedCardMeta = (state: string): StatusMeta | null =>
  CLOSED_CARD_STATE[state] ?? null;

/** BE refusals the chat words itself; every other 4xx shows the BE's Vietnamese `message`. */
export const CHAT_MESSAGE_BY_CODE: Record<string, string> = {
  CHAT_CONTEXT_NOT_FOUND:
    "Không tìm thấy chứng từ này trong tài khoản của bạn, hoặc chứng từ chưa được gửi cho bạn. Bạn vẫn có thể chat với Sale mà không gắn chứng từ.",
  CHAT_CONVERSATION_NOT_FOUND: "Không tìm thấy cuộc trò chuyện này trong tài khoản của bạn.",
  CHAT_CONVERSATION_ENDED: "Cuộc trò chuyện đã kết thúc. Hãy mở lại để nhắn tiếp cho Sale.",
};
