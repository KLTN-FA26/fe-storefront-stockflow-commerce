import { describeApiError, hasErrorCode } from "@/lib/api/describe-error";

/** Mã `RETURN_*` của BE (`ErrorCode`) — khách đọc tiếng Việt theo mã, không bao giờ đọc `message`. */
const RETURN_MESSAGES: Record<string, string> = {
  NOT_FOUND: "Không tìm thấy đơn hàng hoặc yêu cầu trả hàng này trong tài khoản của bạn.",
  RETURN_REQUEST_NOT_FOUND: "Không tìm thấy yêu cầu trả hàng này trong tài khoản của bạn.",
  CUSTOMER_NOT_FOUND: "Tài khoản chưa được liên kết với hồ sơ khách hàng.",
  ORDER_CANCELLED: "Đơn hàng đã huỷ nên không có hàng để trả.",
  RETURN_ORDER_NOT_DELIVERED: "Đơn chưa giao xong nên chưa thể yêu cầu trả hàng.",
  RETURN_ORDER_NOT_RETURNABLE:
    "Đơn này đã được tất toán bằng một lần trả hàng. Hãy chat với Sales nếu bạn cần trả thêm.",
  RETURN_WINDOW_CLOSED:
    "Đã quá hạn 7 ngày đổi / trả kể từ ngày giao. Hãy chat với Sales nếu hàng có lỗi phát hiện muộn.",
  RETURN_LINE_ALREADY_OPEN:
    "Một sản phẩm bạn chọn đang có yêu cầu trả hàng khác chưa xong. Hãy theo dõi yêu cầu đó.",
  RETURN_QUANTITY_EXCEEDED: "Số lượng trả vượt quá số đã giao còn lại của sản phẩm.",
  RETURN_QUANTITIES_INVALID: "Hãy chọn ít nhất một sản phẩm và số lượng hợp lệ.",
  RETURN_CUSTOM_ITEM_NOT_DEFECTIVE:
    "Hàng in theo thiết kế của bạn chỉ được trả khi có lỗi (lỗi in, sai mẫu, hỏng khi vận chuyển, giao sai).",
  RETURN_REASON_NOT_ACCEPTED:
    "Lý do này không được nhận trả hàng. Hãy chọn lý do khác hoặc chat với Sales.",
  RETURN_CUSTOMER_NOT_ACTIVE:
    "Tài khoản của bạn chưa ở trạng thái hoạt động. Hãy chat với Sales để được mở yêu cầu trả hàng.",
  RETURN_INVALID_TRANSITION:
    "Yêu cầu trả hàng vừa chuyển sang bước khác nên không thực hiện được. Trang đã được cập nhật.",
  RETURN_EVIDENCE_LIMIT_REACHED: "Yêu cầu đã có đủ số ảnh tối đa.",
  PAYLOAD_TOO_LARGE: "Ảnh lớn hơn 15 MB hoặc quá nhiều điểm ảnh.",
  UNSUPPORTED_MEDIA_TYPE: "Chỉ nhận ảnh JPEG, PNG hoặc WebP.",
  IDEMPOTENCY_KEY_REUSED: "Yêu cầu không hợp lệ. Vui lòng tải lại trang và thử lại.",
  OPTIMISTIC_LOCK: "Yêu cầu vừa được cập nhật. Trang đã tải lại thông tin mới nhất.",
};

export const describeReturnError = (error: unknown) => describeApiError(error, RETURN_MESSAGES);

export const isReturnNotFound = (error: unknown) =>
  hasErrorCode(error, "NOT_FOUND") || hasErrorCode(error, "RETURN_REQUEST_NOT_FOUND");
