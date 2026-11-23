import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";

import {
  describeDocumentError,
  fileNameFromDisposition,
  getMyContractAppendix,
  getMyContractLiquidation,
  getMyDebtReconciliation,
  getMyEInvoiceAgreement,
  getMyPaymentConfirmation,
  getMyRefundConfirmation,
  getMyReturnReceiptVoucher,
  saveDocument,
} from "..";

const NAME = "Phiếu xác nhận thanh toán XNTT-261120-A1B2C3-1.pdf";
/** As Spring's ContentDisposition.inline().filename(name, UTF_8) writes it for the BE's PdfDownload. */
const SPRING_HEADER =
  'inline; filename="=?UTF-8?Q?Phi=E1=BA=BFu_x=C3=A1c_nh=E1=BA=ADn_thanh_to=C3=A1n_XNTT-261120-A1B2C3-1.pdf?="; ' +
  `filename*=UTF-8''${encodeURIComponent(NAME)}`;

afterEach(() => vi.restoreAllMocks());

describe("fileNameFromDisposition (BE PdfDownload)", () => {
  it("reads the RFC 5987 filename* first, diacritics kept", () => {
    expect(fileNameFromDisposition(SPRING_HEADER)).toBe(NAME);
  });

  it("falls back to the RFC 2047 encoded word, then to a plain name", () => {
    expect(
      fileNameFromDisposition(
        'inline; filename="=?UTF-8?Q?Phi=E1=BA=BFu_ho=C3=A0n_ti=E1=BB=81n_PHT-1.pdf?="',
      ),
    ).toBe("Phiếu hoàn tiền PHT-1.pdf");
    expect(fileNameFromDisposition('attachment; filename="contract-preview.pdf"')).toBe(
      "contract-preview.pdf",
    );
    expect(fileNameFromDisposition("attachment; filename=plain.pdf")).toBe("plain.pdf");
  });

  it("answers null when the header names no file", () => {
    expect(fileNameFromDisposition(undefined)).toBeNull();
    expect(fileNameFromDisposition("inline")).toBeNull();
  });
});

describe("the customer's paper endpoints (documents/endpoints.md 1c-7c)", () => {
  const pdf = new Blob(["%PDF-1.4"], { type: "application/pdf" });

  it("asks each /me path as a blob and keeps the name the BE sent", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({
      data: pdf,
      headers: { "content-disposition": SPRING_HEADER },
    });
    const file = await getMyPaymentConfirmation("i-1", "r-1", "FT1");
    expect(file).toEqual({ blob: pdf, fileName: NAME });
    expect(get).toHaveBeenCalledWith(
      "/installments/me/i-1/receipts/r-1/confirmation",
      expect.objectContaining({ responseType: "blob" }),
    );

    await getMyContractAppendix("o-1", "HD-1");
    await getMyContractLiquidation("o-1", "HD-1");
    await getMyReturnReceiptVoucher("ret-1", "RMA-1");
    await getMyRefundConfirmation("rec-1", "FT2");
    await getMyDebtReconciliation("2026-01-01", "2026-11-23");
    await getMyEInvoiceAgreement("inv-1", "1C26TAA-0000042");
    const paths = get.mock.calls.map((call) => call[0]);
    expect(paths).toEqual([
      "/installments/me/i-1/receipts/r-1/confirmation",
      "/orders/me/o-1/contract/appendix",
      "/orders/me/o-1/contract/liquidation",
      "/returns/me/ret-1/receipt-voucher",
      "/refunds/me/records/rec-1/confirmation",
      "/installments/me/debt-reconciliation",
      "/einvoices/me/inv-1/agreement/draft",
    ]);
    expect(get.mock.calls[5]?.[1]).toMatchObject({
      params: { from: "2026-01-01", to: "2026-11-23" },
    });
  });

  it("names the file itself when the BE sent no Content-Disposition", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: pdf, headers: {} });
    expect((await getMyRefundConfirmation("rec-1", "FT2")).fileName).toBe(
      "Phiếu hoàn tiền FT2.pdf",
    );
  });

  it("saves the blob under that name, never in a tab", () => {
    const create = vi.fn(() => "blob:paper");
    const revoke = vi.fn();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const open = vi.spyOn(window, "open");
    saveDocument({ blob: pdf, fileName: NAME });
    expect(create).toHaveBeenCalledWith(pdf);
    const anchor = click.mock.contexts[0] as HTMLAnchorElement;
    expect(anchor.download).toBe(NAME);
    expect(open).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("describeDocumentError: every refusal reads in Vietnamese", () => {
  const error = (status: number, code: string) => new ApiError(status, code, "English text");

  it.each([
    ["contractAppendix", 404, "NOT_FOUND", /chưa có phụ lục/],
    ["contractAppendix", 409, "SALES_CONTRACT_STATUS_INVALID", /chưa được hai bên ký/],
    ["contractLiquidation", 409, "SALES_CONTRACT_STATUS_INVALID", /số còn lại phải bằng 0/],
    ["returnReceiptVoucher", 404, "GOODS_RECEIPT_NOT_FOUND", /chưa có phiếu nhập kho/],
    ["returnReceiptVoucher", 404, "RETURN_REQUEST_NOT_FOUND", /Không tìm thấy yêu cầu trả hàng/],
    ["refundConfirmation", 404, "REFUND_RECORD_NOT_FOUND", /Không tìm thấy lần hoàn tiền/],
    ["refundConfirmation", 409, "REFUND_RECORD_ALREADY_VOIDED", /huỷ ghi nhận/],
    ["paymentConfirmation", 404, "INSTALLMENT_NOT_FOUND", /Không tìm thấy đợt thanh toán/],
    ["paymentConfirmation", 404, "PAYMENT_RECEIPT_NOT_FOUND", /không còn được ghi nhận/],
    ["debtReconciliation", 400, "VALIDATION_FAILED", /Kỳ đối chiếu không hợp lệ/],
    ["einvoiceAgreement", 404, "EINVOICE_NOT_FOUND", /chưa được phát hành cho bạn/],
    ["einvoiceAgreement", 409, "EINVOICE_CORRECTION_NOT_APPLICABLE", /không có biên bản/],
    ["refundConfirmation", 503, "SELLER_PROFILE_UNAVAILABLE", /doanh nghiệp bán hàng/],
  ] as const)("%s %i %s", (kind, status, code, text) => {
    const message = describeDocumentError(error(status, code), kind);
    expect(message).toMatch(text);
    expect(message).not.toMatch(/English text/);
  });

  it("reads any other 404 as the paper not being there yet", () => {
    expect(describeDocumentError(error(404, "HTTP_404"), "returnReceiptVoucher")).toMatch(
      /chưa có phiếu nhập kho/,
    );
  });

  // Coordinator 23/11: the BE refuses liquidation while Còn lại ≠ 0, under a code of its own.
  it("reads any 409 of the liquidation as money or performance still open", () => {
    expect(
      describeDocumentError(error(409, "SALES_CONTRACT_BALANCE_OPEN"), "contractLiquidation"),
    ).toMatch(/còn khoản chưa thanh toán \/ chưa hoàn xong/);
  });
});
