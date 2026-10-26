import { z } from "zod";

import { ApiError } from "./error";

export const withLookup = (message: string, error: ApiError) =>
  error.correlationId ? `${message} (Mã tra cứu: ${error.correlationId})` : message;

/** Codes every storefront screen answers the same way. */
export const COMMON_MESSAGE_BY_CODE: Record<string, string> = {
  UNAUTHORIZED: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
  FORBIDDEN: "Tài khoản của bạn không có quyền thực hiện thao tác này.",
  UNSUPPORTED_PARAMETER: "Yêu cầu không hợp lệ. Vui lòng tải lại trang và thử lại.",
  VALIDATION_FAILED: "Yêu cầu không hợp lệ. Vui lòng tải lại trang và thử lại.",
  RATE_LIMITED: "Bạn thao tác quá nhanh. Vui lòng đợi vài giây rồi thử lại.",
};

/**
 * Customer-facing Vietnamese text for a failure, chosen by the BE's `errorCode` — never the raw
 * `message`, which is English developer text that may name enum values or ids. `byCode` overrides
 * the common table. The correlation id stays on the text for support. A ZodError means the BE
 * broke the contract (PRODUCTION-FRONTEND-RULES §8), so it gets its own message.
 */
export function describeApiError(error: unknown, byCode: Record<string, string> = {}): string {
  if (error instanceof ApiError) {
    // NETWORK_ERROR (status 0) is written by the FE interceptor, already in Vietnamese.
    if (error.status === 0) return error.message;
    const known = byCode[error.code] ?? COMMON_MESSAGE_BY_CODE[error.code];
    if (known) return withLookup(known, error);
    if (error.status >= 500) {
      return withLookup("Hệ thống đang gặp sự cố. Vui lòng thử lại sau ít phút.", error);
    }
    return withLookup("Không thực hiện được yêu cầu. Vui lòng thử lại.", error);
  }
  if (error instanceof z.ZodError) {
    return "Dữ liệu trả về không đúng định dạng. Vui lòng thử lại sau hoặc liên hệ hỗ trợ.";
  }
  return "Đã xảy ra lỗi. Vui lòng thử lại.";
}

export const hasErrorCode = (error: unknown, code: string): error is ApiError =>
  error instanceof ApiError && error.code === code;

export const isForbiddenError = (error: unknown): error is ApiError =>
  hasErrorCode(error, "FORBIDDEN");
