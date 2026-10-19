import { describeApiError } from "@/lib/api/describe-error";
import { ApiError } from "@/lib/api/error";

/**
 * POST /orders failures by BE `errorCode` (ErrorCode.java), in Vietnamese. The BE message is
 * English developer text ("requested 6, available 5"), so it is never shown.
 *
 * A credit order over the customer's limit is not an error: the BE answers 201 with the order
 * ON_HOLD (see describePlacedStatus).
 */
const MESSAGE_BY_CODE: Record<string, string> = {
  INSUFFICIENT_STOCK:
    "Một số sản phẩm không đủ tồn kho cho số lượng bạn chọn. Hãy giảm số lượng, xoá sản phẩm hết hàng hoặc chat với Sales.",
  CHECKOUT_PRICE_CHANGED:
    "Giá đã thay đổi so với lúc bạn xem. Giỏ hàng đã cập nhật giá mới, vui lòng kiểm tra lại rồi đặt hàng.",
  PRICE_NOT_AVAILABLE:
    "Có sản phẩm chưa có giá bán. Hãy xoá sản phẩm đó khỏi giỏ hàng hoặc chat với Sales để được báo giá.",
  CUSTOMER_PRICE_BELOW_MOQ:
    "Có dòng hàng thấp hơn số lượng tối thiểu của bảng giá. Hãy tăng số lượng hoặc chat với Sales để được báo giá.",
  PRODUCT_NOT_PURCHASABLE:
    "Có sản phẩm đã ngừng bán hoặc không còn đặt được. Hãy xoá sản phẩm đó khỏi giỏ hàng.",
  SKU_NOT_SELLABLE:
    "Có phiên bản sản phẩm đã ngừng bán. Hãy xoá nó khỏi giỏ hàng hoặc chọn phiên bản khác.",
  PAYMENT_TERM_NOT_ALLOWED:
    "Điều khoản thanh toán của tài khoản hiện không cho phép đặt đơn này. Vui lòng liên hệ Sales để cập nhật.",
  CUSTOMER_CREDIT_OVERDUE:
    "Tài khoản đang có công nợ quá hạn nên chưa thể đặt thêm đơn công nợ. Vui lòng thanh toán khoản quá hạn hoặc liên hệ Sales.",
  CUSTOMER_NOT_ACTIVE:
    "Tài khoản của bạn chưa được kích hoạt hoặc đang tạm khoá nên chưa thể đặt hàng. Vui lòng liên hệ Sales.",
  SHIPPING_ADDRESS_REQUIRED:
    "Bạn chưa có địa chỉ giao hàng. Hãy thêm địa chỉ trong sổ địa chỉ rồi đặt hàng lại.",
  ADDRESS_NOT_FOUND:
    "Địa chỉ giao hàng đã chọn không còn trong sổ địa chỉ. Vui lòng chọn lại địa chỉ khác.",
  DESIGN_QUOTE_REQUIRED:
    "Sản phẩm in theo thiết kế cần báo giá được chấp nhận trước khi đặt. Hãy chat với Sales.",
  DESIGN_SAMPLE_NOT_APPROVED: "Thiết kế trong đơn chưa có mẫu được duyệt. Hãy chat với Sales.",
  IDEMPOTENCY_KEY_REUSED:
    "Đơn này đã được gửi trước đó với nội dung khác. Hãy tải lại trang và đặt lại.",
  IDEMPOTENT_REQUEST_IN_PROGRESS:
    "Đơn hàng đang được xử lý. Hãy đợi vài giây và kiểm tra mục Đơn hàng của tôi trước khi đặt lại.",
  LOCK_TIMEOUT: "Hệ thống đang bận. Vui lòng thử lại sau vài giây.",
  OPTIMISTIC_LOCK: "Hệ thống đang bận. Vui lòng thử lại sau vài giây.",
  GUEST_CHECKOUT_DISABLED: "Cổng chỉ nhận đơn từ khách hàng đã đăng nhập.",
  CUSTOMER_NOT_FOUND: "Tài khoản chưa được liên kết với hồ sơ khách hàng.",
  // The BE hides a customerId that is not the caller's behind a plain 404.
  NOT_FOUND: "Không tìm thấy hồ sơ khách hàng của tài khoản này.",
  FORBIDDEN: "Tài khoản của bạn không có quyền đặt hàng.",
  VALIDATION_FAILED:
    "Thông tin đơn hàng chưa hợp lệ. Vui lòng tải lại trang, kiểm tra giỏ hàng rồi thử lại.",
};

export const describeCheckoutError = (error: unknown) => describeApiError(error, MESSAGE_BY_CODE);

/**
 * Codes after which the cart's price list or stock is out of date: the cart re-reads both so the
 * lines that no longer work are flagged where the customer can fix them.
 */
const STALE_CART_CODES = new Set([
  "INSUFFICIENT_STOCK",
  "CHECKOUT_PRICE_CHANGED",
  "PRICE_NOT_AVAILABLE",
  "CUSTOMER_PRICE_BELOW_MOQ",
  "PRODUCT_NOT_PURCHASABLE",
  "SKU_NOT_SELLABLE",
]);
export const isStaleCartError = (error: unknown) =>
  error instanceof ApiError && STALE_CART_CODES.has(error.code);

/** What to tell the customer once the order exists, from the status the BE returned. */
export function describePlacedStatus(status: string): { title: string; description: string } {
  // A credit order is ON_HOLD at placement only when it is over the customer's credit limit (or
  // they have an overdue receivable): the BE keeps it until whoever approves credit decides.
  if (status === "ON_HOLD") {
    return {
      title: "Đã nhận đơn, đang chờ duyệt công nợ",
      description:
        "Đơn vượt hạn mức công nợ hoặc tài khoản có công nợ quá hạn, nên cần được duyệt trước khi xử lý.",
    };
  }
  if (status === "CONFIRMED") {
    return { title: "Đã đặt hàng", description: "Đơn hàng đã được xác nhận." };
  }
  return {
    title: "Đã đặt hàng",
    description:
      "Hàng đã được giữ cho bạn. Đơn sẽ được xử lý khi thanh toán theo điều khoản của bạn.",
  };
}
