import type { SemanticTone } from "@/lib/domain/types";

import type { CustomerEInvoice, CustomerEInvoiceErrorNotice } from "./schemas";

/** "1C26TAA-0000042" — mẫu số + ký hiệu + số hoá đơn. */
export function invoiceNumberText(
  invoice: Pick<CustomerEInvoice, "templateCode" | "symbol" | "invoiceNumber">,
): string {
  if (invoice.invoiceNumber == null) return "Đang cập nhật";
  return `${invoice.templateCode ?? ""}${invoice.symbol ?? ""}-${String(invoice.invoiceNumber).padStart(7, "0")}`;
}

const TYPE_LABEL = {
  ORIGINAL: "Hoá đơn",
  ADJUSTMENT: "Hoá đơn điều chỉnh",
  REPLACEMENT: "Hoá đơn thay thế",
  UNKNOWN: "Hoá đơn",
} as const;

export const invoiceTypeLabel = (invoice: Pick<CustomerEInvoice, "type">) =>
  TYPE_LABEL[invoice.type];

/** Trạng thái khách thấy (docs 21 §5.2). */
export function invoiceStatusMeta(invoice: Pick<CustomerEInvoice, "status" | "adjusted">): {
  label: string;
  tone: SemanticTone;
} {
  if (invoice.status === "REPLACED") return { label: "Đã bị thay thế", tone: "muted" };
  if (invoice.adjusted) return { label: "Đã phát hành — có điều chỉnh", tone: "info" };
  return { label: "Đã phát hành", tone: "positive" };
}

/**
 * Một thông báo sai sót như khách đọc (WF-05 Q-22 §4.4): chỉ nói "đã gửi cơ quan thuế" khi BE ghi
 * nó đã đi (SENT, ACCEPTED, REJECTED). Bản DRAFT chỉ là người bán đã ghi nhận — với nhà cung cấp
 * không gửi được 04/SS (SePay), Kế toán làm ngoài hệ thống, nên FE không nói gì về cơ quan thuế.
 */
export function errorNoticeStatusMeta(notice: Pick<CustomerEInvoiceErrorNotice, "status">): {
  label: string;
  tone: SemanticTone;
} {
  switch (notice.status) {
    case "DRAFT":
      return { label: "Người bán đã ghi nhận", tone: "info" };
    case "SENT":
      return { label: "Đã gửi cơ quan thuế", tone: "info" };
    case "ACCEPTED":
      return { label: "Cơ quan thuế đã tiếp nhận", tone: "positive" };
    case "REJECTED":
      return { label: "Cơ quan thuế không tiếp nhận", tone: "warning" };
    default:
      return { label: "Đang cập nhật", tone: "neutral" };
  }
}
