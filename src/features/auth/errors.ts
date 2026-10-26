import { describeApiError, hasErrorCode } from "@/lib/api/describe-error";
import { NotCustomerError } from "@/lib/auth/customer-session";

/**
 * Sign-in failures by BE `errorCode`. A wrong username and a wrong password are one answer
 * (UNAUTHORIZED) on purpose: the BE never says which, and neither does the form.
 */
const MESSAGE_BY_CODE: Record<string, string> = {
  UNAUTHORIZED: "Email hoặc mật khẩu không đúng.",
  ACCOUNT_NOT_ACTIVE:
    "Tài khoản của bạn hiện không đăng nhập được. Vui lòng liên hệ Sales để được hỗ trợ.",
  ACCOUNT_TEMPORARILY_LOCKED:
    "Bạn đã nhập sai mật khẩu quá nhiều lần. Vui lòng thử lại sau ít phút.",
  // 5 sign-in attempts a minute per IP.
  RATE_LIMITED: "Bạn thử đăng nhập quá nhanh. Vui lòng đợi khoảng một phút rồi thử lại.",
  CUSTOMER_NOT_FOUND: "Tài khoản chưa được liên kết với hồ sơ khách hàng. Vui lòng liên hệ Sales.",
  VALIDATION_FAILED: "Vui lòng nhập đầy đủ email và mật khẩu.",
};

export function describeLoginError(error: unknown): string {
  if (error instanceof NotCustomerError) {
    return "Tài khoản này không có quyền dùng cổng khách hàng (ví dụ tài khoản nhân viên). Vui lòng đăng nhập bằng tài khoản khách hàng của bạn.";
  }
  return describeApiError(error, MESSAGE_BY_CODE);
}

export const isWrongCredentials = (error: unknown) => hasErrorCode(error, "UNAUTHORIZED");
