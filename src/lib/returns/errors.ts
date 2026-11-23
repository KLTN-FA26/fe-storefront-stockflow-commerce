import { describeApiError, hasErrorCode } from "@/lib/api/describe-error";

/** Mã `RETURN_*` của BE (`ErrorCode`) — khách đọc tiếng Việt theo mã, không bao giờ đọc `message`. */
const RETURN_MESSAGES: Record<string, string> = {
  NOT_FOUND: "Không tìm thấy đơn hàng hoặc yêu cầu trả hàng này trong tài khoản của bạn.",
  RETURN_REQUEST_NOT_FOUND: "Không tìm thấy yêu cầu trả hàng này trong tài khoản của bạn.",
  CUSTOMER_NOT_FOUND: "Tài khoản chưa được liên kết với hồ sơ khách hàng.",
  ORDER_CANCELLED: "Đơn hàng đã huỷ nên không có hàng để trả.",
  RETURN_ORDER_NOT_DELIVERED: "Đơn chưa giao xong nên chưa thể yêu cầu trả hàng.",
  // Since WF-05 Q-15 the BE sends this only for a closed order; an older BE also for one settled by a return.
  RETURN_ORDER_NOT_RETURNABLE:
    "Đơn này đã đóng hoặc đã được tất toán nên không nhận thêm yêu cầu trả hàng qua cổng. Hãy chat với Sales nếu bạn cần trả thêm.",
  // WF-05 Q-15: the delivery chosen was already settled by a return (a refund was made on it).
  RETURN_SHIPMENT_NOT_RETURNABLE:
    "Hàng của lần giao này đã được xử lý trả hàng và hoàn tiền nên không mở thêm yêu cầu được. Hãy chọn lần giao khác, hoặc chat với Sales nếu bạn cần hỗ trợ.",
  RETURN_WINDOW_CLOSED:
    "Đã quá hạn đổi / trả kể từ ngày giao của lần giao này. Hãy chat với Sales nếu hàng có lỗi phát hiện muộn.",
  // WF-05 TH-1: đơn giao nhiều lần — mỗi yêu cầu trả hàng gắn với một lần giao đã đến.
  RETURN_SHIPMENT_REQUIRED:
    "Đơn này được giao làm nhiều lần — hãy chọn lần giao có hàng muốn trả. Không thấy lần giao đó? Vui lòng liên hệ Sale.",
  RETURN_SHIPMENT_NOT_DELIVERED:
    "Lần giao bạn chọn chưa giao thành công nên chưa thể trả hàng của lần giao đó. Hãy chọn lần giao đã nhận hàng.",
  // WF-05 BE-23: a parcel of it is being counted at the warehouse; that is goods back already.
  RETURN_RECEIPT_DRAFT_OPEN:
    "Kho đang kiểm đếm một kiện hàng trả của yêu cầu này nên chưa rút được yêu cầu. Hãy đợi kho xác nhận, hoặc chat với Sales nếu bạn cần hỗ trợ.",
  RETURN_GOODS_PARTLY_RECEIVED:
    "Kho đã nhận một phần hàng trả về nên không thể rút yêu cầu nữa. Sales sẽ hoàn tiền theo số hàng đã nhận — hãy chat với Sales nếu cần.",
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
  // Sales duyệt lỗi dựa trên ảnh: cần ít nhất một ảnh của vấn đề.
  RETURN_EVIDENCE_REQUIRED:
    "Yêu cầu cần ít nhất một ảnh chụp vấn đề trước khi được duyệt. Hãy thêm ảnh ở trang yêu cầu.",
  // 17 BR-18: hàng của yêu cầu đã duyệt phải gửi về kho trước khi hoàn tiền.
  RETURN_GOODS_REQUIRED:
    "Hàng của yêu cầu này cần được gửi về kho trước khi hoàn tiền. Hãy gửi hàng kèm số RMA trên kiện.",
  RATE_LIMITED: "Bạn thao tác quá nhanh. Vui lòng đợi một lát rồi thử lại.",
  CONFLICT:
    "Yêu cầu vừa thay đổi ở nơi khác nên chưa thực hiện được. Hãy tải lại trang và thử lại.",
  PAYLOAD_TOO_LARGE: "Ảnh lớn hơn 15 MB hoặc quá nhiều điểm ảnh.",
  UNSUPPORTED_MEDIA_TYPE: "Chỉ nhận ảnh JPEG, PNG hoặc WebP.",
  IDEMPOTENCY_KEY_REUSED: "Yêu cầu không hợp lệ. Vui lòng tải lại trang và thử lại.",
  OPTIMISTIC_LOCK: "Yêu cầu vừa được cập nhật. Trang đã tải lại thông tin mới nhất.",
};

export const describeReturnError = (error: unknown) => describeApiError(error, RETURN_MESSAGES);

export const isReturnNotFound = (error: unknown) =>
  hasErrorCode(error, "NOT_FOUND") || hasErrorCode(error, "RETURN_REQUEST_NOT_FOUND");
