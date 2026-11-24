/**
 * Mock routes for the customer's business papers (documents/endpoints.md 1c-7c): each answers a tiny
 * PDF with the `Content-Disposition` the BE's `PdfDownload` sends - `filename*=UTF-8''…` with the
 * Vietnamese name - and the debt reconciliation refuses a period the BE refuses (400).
 */
import type { AxiosRequestConfig } from "axios";

import { registerMockRoute } from "./mock-adapter";
import { mockQuotePdf } from "./mock-fixtures/quotes";

const pathOf = (config: AxiosRequestConfig, name: string) =>
  decodeURIComponent(
    (config as AxiosRequestConfig & { _mockParams?: Record<string, string> })._mockParams?.[name] ??
      "",
  );

/** The header as Spring's `ContentDisposition.inline().filename(name, UTF_8)` writes it. */
export const mockDisposition = (fileName: string) =>
  `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`;

const pdf = (fileName: string) => ({
  status: 200,
  data: new Blob([mockQuotePdf(fileName.replace(/[^\x20-\x7E]/g, "_"))], {
    type: "application/pdf",
  }),
  headers: {
    "content-type": "application/pdf",
    "content-disposition": mockDisposition(fileName),
    "cache-control": "private, no-store",
  },
});

const fail = (status: number, errorCode: string, message: string) => ({
  status,
  data: { success: false, errorCode, message },
  headers: {},
});

const short = (id: string) => id.slice(-6).toUpperCase();
const today = () => new Date().toISOString().slice(0, 10);

/** Registered before `/installments/me/:installmentId`, which would otherwise take the path. */
export function registerDocumentMockRoutes(): void {
  registerMockRoute("GET", "/installments/me/debt-reconciliation", (config) => {
    const params = (config.params ?? {}) as Record<string, unknown>;
    const from = typeof params.from === "string" ? params.from : "";
    const to = typeof params.to === "string" ? params.to : "";
    if (!from || !to || to < from || to > today()) {
      return fail(400, "VALIDATION_FAILED", "from, to: a period ending no later than today");
    }
    return pdf(`Biên bản đối chiếu công nợ BBDCCN-KH-${to.replace(/-/g, "")}.pdf`);
  });
  registerMockRoute("GET", "/orders/me/:orderId/contract/appendix", (config) =>
    pdf(`Phụ lục hợp đồng PL01-HD-${short(pathOf(config, "orderId"))}.pdf`),
  );
  registerMockRoute("GET", "/orders/me/:orderId/contract/liquidation", (config) =>
    pdf(`Biên bản thanh lý hợp đồng TL-HD-${short(pathOf(config, "orderId"))}.pdf`),
  );
  registerMockRoute("GET", "/returns/me/:returnId/receipt-voucher", (config) =>
    pdf(`Phiếu nhập kho NK-${short(pathOf(config, "returnId"))}.pdf`),
  );
  registerMockRoute("GET", "/refunds/me/records/:recordId/confirmation", (config) =>
    pdf(`Phiếu hoàn tiền PHT-${short(pathOf(config, "recordId"))}.pdf`),
  );
  registerMockRoute(
    "GET",
    "/installments/me/:installmentId/receipts/:receiptId/confirmation",
    (config) => pdf(`Phiếu xác nhận thanh toán XNTT-${short(pathOf(config, "receiptId"))}.pdf`),
  );
  registerMockRoute("GET", "/einvoices/me/:id/agreement/draft", (config) =>
    pdf(`Biên bản thỏa thuận điều chỉnh hóa đơn BBTT-${short(pathOf(config, "id"))}.pdf`),
  );
}
