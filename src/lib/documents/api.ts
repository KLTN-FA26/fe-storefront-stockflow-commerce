import { api } from "@/lib/api/client";

import { fileNameFromDisposition } from "./content-disposition";

/** A business paper as the BE drew it: the PDF and the name it is saved under. */
export interface DocumentFile {
  blob: Blob;
  /** From `Content-Disposition` (`filename*`); the caller's fallback when the BE sent none. */
  fileName: string;
}

const enc = encodeURIComponent;

function headerOf(headers: unknown, name: string): string | undefined {
  if (!headers || typeof headers !== "object") return undefined;
  const record = headers as Record<string, unknown> & { get?: (key: string) => unknown };
  const value =
    typeof record.get === "function"
      ? record.get(name)
      : (record[name] ?? record[name.toLowerCase()]);
  return typeof value === "string" ? value : undefined;
}

/**
 * GET of a BE paper (`application/pdf`, `Content-Disposition: inline`, documents/endpoints.md). The
 * body is the file itself; a refusal is the JSON envelope, which the client interceptor reads out of
 * the Blob into the ApiError (lib/api/blob-error), so `errorCode` survives.
 */
export async function downloadDocument(
  path: string,
  fallbackName: string,
  params?: Record<string, string>,
): Promise<DocumentFile> {
  const response = await api.get<Blob>(path, {
    responseType: "blob",
    headers: { Accept: "application/pdf, application/json" },
    ...(params ? { params } : {}),
  });
  const named = fileNameFromDisposition(headerOf(response.headers, "content-disposition"));
  return { blob: response.data, fileName: named ?? fallbackName };
}

// ── The customer's own papers (`/me`, scope OWN; another customer's id is 404) ──

/** Phụ lục hợp đồng: the delivery windows moved since signing. 404 NOT_FOUND when none moved. */
export const getMyContractAppendix = (orderId: string, contractNumber: string) =>
  downloadDocument(
    `/orders/me/${enc(orderId)}/contract/appendix`,
    `Phụ lục hợp đồng PL01-${contractNumber}.pdf`,
  );

/** Biên bản thanh lý hợp đồng: 409 while the contract is still performed or money is left. */
export const getMyContractLiquidation = (orderId: string, contractNumber: string) =>
  downloadDocument(
    `/orders/me/${enc(orderId)}/contract/liquidation`,
    `Biên bản thanh lý hợp đồng TL-${contractNumber}.pdf`,
  );

/** Phiếu nhập kho (Mẫu 01-VT) of a return: 404 GOODS_RECEIPT_NOT_FOUND until goods were received. */
export const getMyReturnReceiptVoucher = (returnId: string, rmaNumber: string) =>
  downloadDocument(
    `/returns/me/${enc(returnId)}/receipt-voucher`,
    `Phiếu nhập kho ${rmaNumber}.pdf`,
  );

/** Phiếu hoàn tiền of one refund record (`GET /refunds/me/orders/{orderId}` → records). */
export const getMyRefundConfirmation = (recordId: string, reference: string) =>
  downloadDocument(
    `/refunds/me/records/${enc(recordId)}/confirmation`,
    `Phiếu hoàn tiền ${reference}.pdf`,
  );

/** Phiếu xác nhận thanh toán of one receipt's payment of one installment. */
export const getMyPaymentConfirmation = (
  installmentId: string,
  receiptId: string,
  reference: string,
) =>
  downloadDocument(
    `/installments/me/${enc(installmentId)}/receipts/${enc(receiptId)}/confirmation`,
    `Phiếu xác nhận thanh toán ${reference}.pdf`,
  );

/** Biên bản đối chiếu công nợ of the customer's own books, `from`..`to` (ISO days, `to` ≤ today). */
export const getMyDebtReconciliation = (from: string, to: string) =>
  downloadDocument("/installments/me/debt-reconciliation", `Biên bản đối chiếu công nợ ${to}.pdf`, {
    from,
    to,
  });

/** Biên bản thỏa thuận of an adjustment or replacement invoice issued to the customer. */
export const getMyEInvoiceAgreement = (einvoiceId: string, invoiceText: string) =>
  downloadDocument(
    `/einvoices/me/${enc(einvoiceId)}/agreement/draft`,
    `Biên bản thỏa thuận hóa đơn ${invoiceText.replace(/[\\/:*?"<>|]/g, "-")}.pdf`,
  );
