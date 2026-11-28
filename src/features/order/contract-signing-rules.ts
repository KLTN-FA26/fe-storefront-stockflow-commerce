import { ApiError } from "@/lib/api/error";
import { vnDayOf } from "@/lib/format/date";
import type { Contract } from "./contract-schemas";

// HOP-DONG-API lifecycle: only SENT may be signed or returned for changes; deadline is a VN calendar day.
export function contractSigningActions(contract: Contract, permitted: boolean, now = new Date()) {
  const overdue =
    contract.overdueToSign === true || Boolean(contract.signBy && contract.signBy < vnDayOf(now));
  return {
    overdue,
    sign:
      permitted &&
      contract.status === "SENT" &&
      (contract.canSign === true || (overdue && contract.canSign === false)),
    change: permitted && contract.status === "SENT" && contract.canRequestChanges === true,
  };
}
const ERRORS: Record<string, string> = {
  CONTRACT_OTP_INVALID: "Mã xác thực không đúng. Vui lòng kiểm tra và nhập lại.",
  CONTRACT_OTP_EXPIRED: "Mã xác thực đã hết hạn. Vui lòng gửi mã mới.",
  CONTRACT_OTP_TOO_MANY: "Bạn đã yêu cầu quá nhiều mã. Vui lòng thử lại sau.",
  CONTRACT_NOT_SIGNABLE: "Hợp đồng không còn ở trạng thái có thể ký. Vui lòng tải lại trang.",
  CONTRACT_SIGN_DEADLINE_PASSED: "Đã quá hạn ký. Vui lòng liên hệ Sale để gia hạn.",
  CONTRACT_SIGNED_FILE_REJECTED:
    "File đã ký bị từ chối: chữ ký hoặc nội dung không hợp lệ, hoặc không khớp bản hợp đồng đã gửi. Vui lòng kiểm tra file và liên hệ Sale.",
  OPTIMISTIC_LOCK: "Hợp đồng đã thay đổi. Vui lòng tải lại trang trước khi tiếp tục.",
  SALES_CONTRACT_STATUS_INVALID: "Trạng thái hiện tại của hợp đồng không cho phép thao tác này.",
  VERSION_CONFLICT: "Hợp đồng đã thay đổi. Vui lòng tải lại trang trước khi tiếp tục.",
};
export function describeSigningError(error: unknown): string {
  if (error instanceof ApiError && error.code === "CONTRACT_SIGNED_FILE_REJECTED") {
    // SignedPdfInspector.Reasons: translate known codes without exposing raw backend messages.
    const reasons: Record<string, string> = {
      EMPTY: "File không có nội dung.",
      TOO_LARGE: "File vượt quá 20 MB.",
      NOT_A_PDF: "File không phải PDF.",
      ENCRYPTED: "File PDF được mã hóa hoặc có mật khẩu.",
      MALFORMED: "Không đọc được file PDF.",
      NO_DIGITAL_SIGNATURE: "File không có chữ ký số.",
      BYTE_RANGE_INVALID: "Phạm vi chữ ký số không hợp lệ.",
      SIGNATURE_UNREADABLE: "Không đọc được chữ ký số.",
      CERTIFICATE_MISSING: "Chữ ký thiếu chứng thư số.",
      CONTENT_CHANGED: "Nội dung đã thay đổi sau khi ký.",
      SIGNATURE_INVALID: "Chữ ký số không hợp lệ.",
      CERTIFICATE_NOT_VALID_AT_SIGNING: "Chứng thư số không có hiệu lực tại thời điểm ký.",
      NOT_WHOLE_DOCUMENT: "Chữ ký không bao phủ toàn bộ tài liệu.",
      NOT_SENT_DOCUMENT: "Nội dung không khớp bản hợp đồng đã gửi.",
    };
    const reason =
      typeof error.details?.reason === "string" ? reasons[error.details.reason] : undefined;
    if (reason) return `File đã ký bị từ chối: ${reason} Vui lòng kiểm tra và tải lại file.`;
  }
  if (error instanceof ApiError)
    return ERRORS[error.code] ?? "Chưa thực hiện được. Vui lòng thử lại hoặc liên hệ Sale.";
  return "Không kết nối được dịch vụ. Vui lòng thử lại.";
}

export function formatVerificationCode(code: string): string {
  const compact = code.replace(/[\s-]/g, "").toUpperCase();
  return /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{12}$/.test(compact)
    ? `${compact.slice(0, 4)}-${compact.slice(4, 8)}-${compact.slice(8)}`
    : code;
}
