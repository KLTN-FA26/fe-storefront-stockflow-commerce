import { ApiError } from "@/lib/api/error";
import { describeBeRefusal, hasErrorCode } from "@/lib/api/describe-error";

/**
 * The BE words its quote refusals in Vietnamese and names the facts (the line, the MOQ, the date),
 * so a 4xx shows its `message` (plan §1.2, describeBeRefusal). Only the codes below get the FE's
 * own words: the ones whose text is not about the quote's content.
 */
const QUOTE_MESSAGE_BY_CODE: Record<string, string> = {
  NOT_FOUND: "Không tìm thấy báo giá, hoặc báo giá không thuộc tài khoản của bạn.",
  CUSTOMER_NOT_FOUND: "Tài khoản chưa được liên kết với hồ sơ khách hàng.",
  OPTIMISTIC_LOCK: "Dữ liệu vừa thay đổi, đã tải lại. Hãy xem lại báo giá rồi thử lại.",
  // The PDF's 503: describeBeRefusal never shows the BE's own text for a 5xx.
  SELLER_PROFILE_UNAVAILABLE: "Chưa tạo được file PDF lúc này. Vui lòng thử lại sau.",
};

export function describeQuoteError(error: unknown): string {
  return describeBeRefusal(error, QUOTE_MESSAGE_BY_CODE);
}

export const isApiError = (error: unknown): error is ApiError => error instanceof ApiError;

/** The quote is missing or someone else's: the BE answers 404 NOT_FOUND for both. */
export const isQuoteNotFound = (error: unknown): error is ApiError =>
  hasErrorCode(error, "NOT_FOUND");

/**
 * QUOTE_BELOW_MOQ carries `details { lineNo, sku, cartons, moq }` (BE QuoteLine.belowMoq) so the
 * form can mark the line; null for any other failure.
 */
export function belowMoqLineNo(error: unknown): number | null {
  if (!hasErrorCode(error, "QUOTE_BELOW_MOQ")) return null;
  const lineNo = error.details?.lineNo;
  return typeof lineNo === "number" ? lineNo : null;
}

/**
 * Field errors of a 400 VALIDATION_FAILED on the acceptance (`lines[0].cartons`), as the index of
 * the line and its message.
 */
export function lineFieldErrors(error: unknown): Map<number, string> {
  const found = new Map<number, string>();
  if (!isApiError(error)) return found;
  for (const fieldError of error.fieldErrorDetails) {
    const match = /^lines\[(\d+)\]\.cartons$/.exec(fieldError.field);
    if (match) found.set(Number(match[1]), fieldError.message);
  }
  return found;
}
