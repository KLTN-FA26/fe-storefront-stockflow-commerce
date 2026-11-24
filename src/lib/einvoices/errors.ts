import { describeApiError } from "@/lib/api/describe-error";

/**
 * Codes of the customer's invoice reads (BE `CustomerEInvoiceController`): another customer's, an
 * unissued or an unknown invoice is the same 404 `EINVOICE_NOT_FOUND` (WF-05 BE-60, F-19).
 */
const EINVOICE_MESSAGES: Record<string, string> = {
  EINVOICE_NOT_FOUND:
    "Không tìm thấy hoá đơn này trong tài khoản của bạn, hoặc hoá đơn chưa được phát hành. Hãy tải lại trang.",
  // fileLink: the provider has not returned the file yet.
  EINVOICE_NOT_ISSUED: "Hoá đơn này chưa có tệp để tải. Vui lòng thử lại sau.",
  CUSTOMER_NOT_FOUND: "Tài khoản chưa được liên kết với hồ sơ khách hàng. Hãy chat với Sale.",
  STORAGE_ERROR: "Kho lưu tệp đang gián đoạn. Vui lòng thử lại sau ít phút.",
};

export const describeEInvoiceError = (error: unknown) => describeApiError(error, EINVOICE_MESSAGES);
