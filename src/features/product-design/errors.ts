import { describeApiError, hasErrorCode } from "@/lib/api/describe-error";

const CONFLICT_MESSAGE = "Thiết kế đã thay đổi, hãy tải lại.";

/** P1 answers 422 TEMPLATE_NOT_FOUND for a SKU without a template; the launcher says the same locally. */
export const TEMPLATE_NOT_FOUND_MESSAGE = "Phiên bản này chưa có mẫu thiết kế.";

const MESSAGE_BY_CODE: Record<string, string> = {
  CONFLICT: CONFLICT_MESSAGE,
  // The same stale-write, lost at the database instead of at the version check.
  OPTIMISTIC_LOCK: CONFLICT_MESSAGE,
  PAYLOAD_TOO_LARGE: "Tệp vượt dung lượng cho phép.",
  UNSUPPORTED_MEDIA_TYPE: "Định dạng tệp không được hỗ trợ.",
  PRODUCT_NOT_CUSTOMIZABLE: "Sản phẩm này không hỗ trợ thiết kế.",
  TEMPLATE_NOT_FOUND: TEMPLATE_NOT_FOUND_MESSAGE,
  IDEMPOTENCY_KEY_REUSED: "Yêu cầu tải lên này đã được dùng cho một tệp khác. Hãy thử lại.",
  FORBIDDEN: "Bạn không có quyền thực hiện thao tác này trên thiết kế.",
  NOT_FOUND: "Không tìm thấy thiết kế hoặc sản phẩm này.",
  PRODUCT_NOT_FOUND: "Sản phẩm không còn khả dụng.",
  // Raised locally by the finalize/confirm mutations: nothing was sent to the BE.
  DESIGN_ARTIFACT_MISSING: "Thiết kế chưa có bản gửi QC để chốt. Hãy gửi QC kiểm tra trước.",
  DESIGN_API_UNAVAILABLE: "Tính năng này chưa mở.",
};

/** Customer-facing text for any failure reaching the design UI. */
export const describeDesignError = (error: unknown) => describeApiError(error, MESSAGE_BY_CODE);

/** A write lost to a newer version of the design (409): the editor stops and offers a reload. */
export const isDesignConflict = (error: unknown) =>
  hasErrorCode(error, "CONFLICT") || hasErrorCode(error, "OPTIMISTIC_LOCK");

/** The endpoint is proposed (spec §7.2) and the BE has not shipped it. */
export const isDesignApiUnavailable = (error: unknown) =>
  hasErrorCode(error, "DESIGN_API_UNAVAILABLE");
