import { describeApiError, hasErrorCode } from "@/lib/api/describe-error";
import { NotCustomerError } from "@/lib/auth/customer-session";

/**
 * Sign-in failures by BE `errorCode`. A wrong username and a wrong password are one answer
 * (UNAUTHORIZED) on purpose: the BE never says which, and neither does the form.
 */
const MESSAGE_BY_CODE: Record<string, string> = {
  UNAUTHORIZED: "Email hoặc mật khẩu không đúng.",
  ACCOUNT_NOT_ACTIVE:
    "Tài khoản của bạn hiện không đăng nhập được. Vui lòng liên hệ Sale để được hỗ trợ.",
  ACCOUNT_TEMPORARILY_LOCKED:
    "Bạn đã nhập sai mật khẩu quá nhiều lần. Vui lòng thử lại sau ít phút.",
  // 5 sign-in attempts a minute per IP.
  RATE_LIMITED: "Bạn thử đăng nhập quá nhanh. Vui lòng đợi khoảng một phút rồi thử lại.",
  CUSTOMER_NOT_FOUND: "Tài khoản chưa được liên kết với hồ sơ khách hàng. Vui lòng liên hệ Sale.",
  VALIDATION_FAILED: "Vui lòng nhập đầy đủ email và mật khẩu.",
};

export function describeLoginError(error: unknown): string {
  if (error instanceof NotCustomerError) {
    return "Tài khoản này không có quyền dùng cổng khách hàng (ví dụ tài khoản nhân viên). Vui lòng đăng nhập bằng tài khoản khách hàng của bạn.";
  }
  return describeApiError(error, MESSAGE_BY_CODE);
}

export const isWrongCredentials = (error: unknown) => hasErrorCode(error, "UNAUTHORIZED");

/**
 * The refusals whose text says "liên hệ Sale": they come with the way to reach Sales, the request form
 * (`/mo-tai-khoan`). For a company that is already a customer the BE passes the request to its own Sales
 * (KE-HOACH sales owner §10.7), so it is the right door for a locked or unlinked account too.
 */
const CONTACT_SALES_CODES = [
  "ACCOUNT_NOT_ACTIVE",
  "CUSTOMER_NOT_FOUND",
  "PORTAL_INVITATION_INVALID",
];

export const asksToContactSales = (error: unknown) =>
  CONTACT_SALES_CODES.some((code) => hasErrorCode(error, code));

/** The link text under a refusal that says to contact Sales. */
export const CONTACT_SALES_LINK = "Gửi yêu cầu liên hệ Sale";

/**
 * Activation failures by BE `errorCode`. A link that is unknown, expired, already used, replaced by a newer one or for
 * a customer no longer awaiting activation is one answer on purpose (PORTAL_INVITATION_INVALID); the BE judges the link
 * before the password, so VALIDATION_FAILED means the link is good and only the password was refused.
 */
const ACTIVATION_MESSAGE_BY_CODE: Record<string, string> = {
  PORTAL_INVITATION_INVALID:
    "Link kích hoạt không hợp lệ, đã hết hạn hoặc đã được dùng. Vui lòng liên hệ Sale để nhận link mới.",
  VALIDATION_FAILED: "Mật khẩu chưa đạt yêu cầu: 10–72 ký tự, có chữ hoa, chữ thường và chữ số.",
  // 10 activations a minute per IP.
  RATE_LIMITED: "Bạn thử quá nhanh. Vui lòng đợi khoảng một phút rồi thử lại.",
};

export function describeActivationError(error: unknown): string {
  return describeApiError(error, ACTIVATION_MESSAGE_BY_CODE);
}

export const isInvitationInvalid = (error: unknown) =>
  hasErrorCode(error, "PORTAL_INVITATION_INVALID");
