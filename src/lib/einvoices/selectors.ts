import type { SemanticTone } from "@/lib/domain/types";

import type { CustomerEInvoice } from "./schemas";

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

/** Sorts by invoice date, then by the instant it was issued (absent on an older BE). */
const issuedOn = (invoice: Pick<CustomerEInvoice, "issuedAt" | "issueDate">) =>
  `${invoice.issueDate}|${invoice.issuedAt ?? ""}`;

/**
 * Hoá đơn đã thay thế `invoice` (đang "Đã bị thay thế"), trong các hoá đơn của đơn. BE
 * `CustomerEInvoiceResponse` không gửi id hoá đơn gốc / thay thế, nên suy ra như BE lập hoá đơn
 * thay thế (`EInvoice.drawUpReplacement`): cùng đơn, cùng lần giao (`shipmentCode`), loại
 * `REPLACEMENT`, phát hành sau — hoá đơn sớm nhất như vậy (mỗi lúc chỉ một hoá đơn thay thế).
 */
export function replacementOf(
  invoice: CustomerEInvoice,
  invoices: readonly CustomerEInvoice[],
): CustomerEInvoice | undefined {
  if (invoice.status !== "REPLACED") return undefined;
  const after = issuedOn(invoice);
  return invoices
    .filter(
      (other) =>
        other.id !== invoice.id &&
        other.type === "REPLACEMENT" &&
        other.orderId === invoice.orderId &&
        (other.shipmentCode ?? null) === (invoice.shipmentCode ?? null) &&
        issuedOn(other) >= after,
    )
    .sort((a, b) => issuedOn(a).localeCompare(issuedOn(b)))[0];
}
