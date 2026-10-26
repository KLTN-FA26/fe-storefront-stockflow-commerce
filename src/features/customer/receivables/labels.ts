import type { SemanticTone } from "@/lib/domain/types";

import type { Receivable, ReceivableStatus } from "./schemas";

export const RECEIVABLE_STATUS_LABEL: Record<ReceivableStatus, string> = {
  OPEN: "Chưa đến hạn",
  PARTIALLY_PAID: "Đã trả một phần",
  OVERDUE: "Quá hạn",
  PAID: "Đã thanh toán",
  UNKNOWN: "Đang cập nhật",
};

export const RECEIVABLE_STATUS_TONE: Record<ReceivableStatus, SemanticTone> = {
  OPEN: "info",
  PARTIALLY_PAID: "warning",
  OVERDUE: "danger",
  PAID: "positive",
  UNKNOWN: "muted",
};

export const RECEIVABLE_KIND_LABEL: Record<NonNullable<Receivable["kind"]>, string> = {
  CREDIT_ORDER: "Công nợ đơn hàng",
  CANCELLATION_FEE: "Phí huỷ đơn",
  DEPOSIT_BALANCE: "Phần còn lại sau đặt cọc",
  UNKNOWN: "Công nợ",
};
