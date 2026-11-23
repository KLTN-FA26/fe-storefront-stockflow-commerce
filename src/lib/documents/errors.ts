import { describeApiError } from "@/lib/api/describe-error";
import { ApiError } from "@/lib/api/error";

/** The papers a customer downloads (documents/endpoints.md, rows 1c-7c). */
export type DocumentKind =
  | "contractAppendix"
  | "contractLiquidation"
  | "returnReceiptVoucher"
  | "refundConfirmation"
  | "paymentConfirmation"
  | "debtReconciliation"
  | "einvoiceAgreement";

/** Codes any of the papers may answer. */
const COMMON: Record<string, string> = {
  CUSTOMER_NOT_FOUND: "Tài khoản chưa được liên kết với hồ sơ khách hàng. Hãy chat với Sale.",
  SELLER_PROFILE_UNAVAILABLE:
    "Thông tin doanh nghiệp bán hàng chưa được thiết lập nên chưa lập được giấy tờ. Vui lòng thử lại sau hoặc chat với Sale.",
  STORAGE_ERROR: "Kho lưu tệp đang gián đoạn. Vui lòng thử lại sau ít phút.",
};

/** Per paper: its own codes, then what any other 404 / 409 of it means to the customer. */
const BY_KIND: Record<
  DocumentKind,
  { codes: Record<string, string>; notFound: string; conflict?: string }
> = {
  contractAppendix: {
    codes: {
      // ContractPaperService.appendix: nothing moved since signing, so there is no appendix.
      NOT_FOUND: "Hợp đồng chưa có phụ lục: lịch giao hàng chưa thay đổi so với hợp đồng đã ký.",
      SALES_CONTRACT_NOT_FOUND: "Không tìm thấy hợp đồng của đơn này trong tài khoản của bạn.",
      SALES_CONTRACT_STATUS_INVALID: "Hợp đồng chưa được hai bên ký nên chưa có phụ lục.",
    },
    notFound: "Hợp đồng chưa có phụ lục: lịch giao hàng chưa thay đổi so với hợp đồng đã ký.",
  },
  contractLiquidation: {
    codes: {
      NOT_FOUND: "Không tìm thấy hợp đồng của đơn này trong tài khoản của bạn.",
      SALES_CONTRACT_NOT_FOUND: "Không tìm thấy hợp đồng của đơn này trong tài khoản của bạn.",
    },
    notFound: "Không tìm thấy hợp đồng của đơn này trong tài khoản của bạn.",
    // SALES_CONTRACT_STATUS_INVALID and the refusal for money still open (Còn lại ≠ 0): the paper
    // says both sides owe each other nothing more, so it waits until that is true.
    conflict:
      "Chưa lập được biên bản thanh lý: hợp đồng chưa ký, đơn còn đang thực hiện, hoặc còn khoản chưa thanh toán / chưa hoàn xong (số còn lại phải bằng 0). Biên bản có ngay khi hai bên hết nghĩa vụ với nhau.",
  },
  returnReceiptVoucher: {
    codes: {
      RETURN_REQUEST_NOT_FOUND: "Không tìm thấy yêu cầu trả hàng này trong tài khoản của bạn.",
      GOODS_RECEIPT_NOT_FOUND:
        "Kho chưa xác nhận nhận hàng trả của yêu cầu này nên chưa có phiếu nhập kho.",
    },
    notFound: "Kho chưa xác nhận nhận hàng trả của yêu cầu này nên chưa có phiếu nhập kho.",
  },
  refundConfirmation: {
    codes: {
      REFUND_RECORD_NOT_FOUND: "Không tìm thấy lần hoàn tiền này trong tài khoản của bạn.",
      REFUND_RECORD_ALREADY_VOIDED:
        "Lần hoàn tiền này đã được kế toán huỷ ghi nhận nên không có phiếu hoàn tiền. Trang đã được cập nhật.",
    },
    notFound: "Không tìm thấy lần hoàn tiền này trong tài khoản của bạn.",
  },
  paymentConfirmation: {
    codes: {
      INSTALLMENT_NOT_FOUND: "Không tìm thấy đợt thanh toán này trong tài khoản của bạn.",
      PAYMENT_RECEIPT_NOT_FOUND:
        "Khoản thanh toán này không còn được ghi nhận cho đợt (kế toán đã huỷ hoặc chuyển sang đợt khác). Hãy tải lại trang.",
    },
    notFound: "Không tìm thấy khoản thanh toán này trong tài khoản của bạn.",
  },
  debtReconciliation: {
    codes: {
      VALIDATION_FAILED:
        "Kỳ đối chiếu không hợp lệ: ngày bắt đầu phải trước hoặc bằng ngày kết thúc, và ngày kết thúc không sau hôm nay.",
      UNSUPPORTED_PARAMETER: "Kỳ đối chiếu không hợp lệ. Hãy chọn lại ngày.",
    },
    notFound: "Chưa có số liệu công nợ để đối chiếu trong tài khoản của bạn.",
  },
  einvoiceAgreement: {
    codes: {
      EINVOICE_NOT_FOUND:
        "Không tìm thấy biên bản thỏa thuận của hoá đơn này: hoá đơn điều chỉnh / thay thế chưa được phát hành cho bạn.",
      EINVOICE_CORRECTION_NOT_APPLICABLE:
        "Hoá đơn này không điều chỉnh hay thay thế hoá đơn nào nên không có biên bản thỏa thuận.",
    },
    notFound:
      "Không tìm thấy biên bản thỏa thuận của hoá đơn này: hoá đơn điều chỉnh / thay thế chưa được phát hành cho bạn.",
  },
};

/** Customer-facing Vietnamese text for a failed download, never the BE's raw `message`. */
export function describeDocumentError(error: unknown, kind: DocumentKind): string {
  const own = BY_KIND[kind];
  if (error instanceof ApiError && !own.codes[error.code] && !COMMON[error.code]) {
    if (error.status === 404) return describeApiError(error, { [error.code]: own.notFound });
    if (error.status === 409 && own.conflict) {
      return describeApiError(error, { [error.code]: own.conflict });
    }
  }
  return describeApiError(error, {
    ...COMMON,
    ...own.codes,
    ...(own.conflict ? { SALES_CONTRACT_STATUS_INVALID: own.conflict } : {}),
  });
}
