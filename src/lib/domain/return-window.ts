/**
 * Hạn đổi / trả của đơn đã giao (kltn-docs 17 §4.6 bước 21, BR-RMA-001): BE `ReturnPolicy.endOfDays`
 * — ngày giao theo lịch Việt Nam + 7 ngày trọn, hết lúc 0 giờ (giờ VN) ngày kế tiếp.
 */

const DAY_MS = 86_400_000;
const VN_OFFSET_MS = 7 * 3_600_000;
/** BE `stockflow.order.return-window-days`. */
export const RETURN_WINDOW_DAYS = 7;

/** Thời điểm hết hạn đổi / trả (0 giờ giờ VN của ngày thứ 8 sau ngày giao). */
export function returnWindowEnd(deliveredAtIso: string, days = RETURN_WINDOW_DAYS): Date {
  const local = Date.parse(deliveredAtIso) + VN_OFFSET_MS;
  const startOfLocalDay = Math.floor(local / DAY_MS) * DAY_MS;
  return new Date(startOfLocalDay + (days + 1) * DAY_MS - VN_OFFSET_MS);
}

/** Ngày cuối còn đổi / trả được (ngày trước thời điểm hết hạn), dạng ISO giờ VN. */
export function lastReturnDay(deliveredAtIso: string): Date {
  return new Date(returnWindowEnd(deliveredAtIso).getTime() - 1);
}
