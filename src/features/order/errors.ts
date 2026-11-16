import { z } from "zod";

import { ApiError } from "@/lib/api/error";

const withLookup = (message: string, error: ApiError) =>
  error.correlationId ? `${message} (Mã tra cứu: ${error.correlationId})` : message;

/**
 * BusinessException messages are developer text in English ("Missing permission:
 * sales-orders:READ", "No order with id …"); only generic codes are localised by Accept-Language.
 * So the customer always gets Vietnamese text chosen by code, never the raw BE message.
 */
const MESSAGE_BY_CODE: Record<string, string> = {
  UNAUTHORIZED: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
  FORBIDDEN: "Tài khoản của bạn không có quyền thực hiện thao tác này với đơn hàng.",
  NOT_FOUND: "Không tìm thấy đơn hàng.",
  CUSTOMER_NOT_FOUND: "Tài khoản chưa được liên kết với hồ sơ khách hàng.",
  CONFLICT: "Thao tác không phù hợp với trạng thái hiện tại của đơn hàng.",
  ORDER_NOT_CANCELLABLE:
    "Đơn hàng đã sang bước không thể huỷ. Nếu cần trả hàng, hãy chat với chúng tôi.",
  CANCELLATION_NEEDS_STAFF:
    "Đơn đang được sản xuất nên chỉ nhân viên mới quyết định được việc huỷ. Hãy chat với Sales.",
  ORDER_CANCELLED: "Đơn hàng này đã được huỷ.",
  ORDER_CANCELLATION_REQUEST_PENDING:
    "Bạn đã gửi yêu cầu huỷ cho đơn này và đang chờ Sales xem xét.",
  UNSUPPORTED_PARAMETER: "Yêu cầu không hợp lệ. Vui lòng tải lại trang và thử lại.",
  VALIDATION_FAILED: "Yêu cầu không hợp lệ. Vui lòng tải lại trang và thử lại.",
};

function messageFor(error: ApiError): string {
  // NETWORK_ERROR (status 0) is written by the FE interceptor, already in Vietnamese.
  if (error.status === 0) return error.message;
  const known = MESSAGE_BY_CODE[error.code];
  if (known) return known;
  if (error.status >= 500) return "Hệ thống đang gặp sự cố. Vui lòng thử lại sau ít phút.";
  return "Không thực hiện được yêu cầu. Vui lòng thử lại.";
}

/**
 * Customer-facing text for any failure reaching the order UI, with the correlation id kept for
 * support. A zod failure means the BE response broke the contract (PRODUCTION-FRONTEND-RULES §8),
 * so it gets its own message instead of leaking the raw issue list.
 */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) return withLookup(messageFor(error), error);
  if (error instanceof z.ZodError) {
    return "Dữ liệu trả về không đúng định dạng. Vui lòng thử lại sau hoặc liên hệ hỗ trợ.";
  }
  return "Đã xảy ra lỗi. Vui lòng thử lại.";
}

export const isApiError = (error: unknown): error is ApiError => error instanceof ApiError;

/**
 * The order itself is missing or belongs to someone else. The BE also answers 404 with
 * CUSTOMER_NOT_FOUND when the account has no customer profile — that is not "no such order".
 */
export const isNotFound = (error: unknown): error is ApiError =>
  isApiError(error) && error.code === "NOT_FOUND";

/**
 * Cancellation failures. A 409 CONFLICT carries an English BE message naming enum values
 * ("cannot be cancelled from status SHIPPED"), so customers get a Vietnamese explanation instead;
 * the order is re-read on settle, so the page already shows the newer status.
 */
export function describeCancelError(error: unknown): string {
  if (isApiError(error) && error.code === "CONFLICT") {
    return withLookup(
      "Đơn hàng vừa chuyển sang trạng thái khác nên không thể huỷ nữa. Trạng thái mới nhất đã được cập nhật bên dưới.",
      error,
    );
  }
  if (isNotFound(error)) {
    return withLookup("Không tìm thấy đơn hàng này trong tài khoản của bạn.", error);
  }
  return describeError(error);
}
