import type { SemanticTone } from "@/lib/domain/types";
import { INSTALLMENT_MILESTONE_LABEL } from "@/lib/installments";
import { formatDate } from "@/lib/format/date";

import type { ContractBatch, ContractInstallment, ContractStatus } from "./contract-schemas";

/** The contract's status in the customer's words (kltn-docs 14 §5.2), with its badge tone. */
export const CONTRACT_STATUS_META: Record<ContractStatus, { label: string; tone: SemanticTone }> = {
  DRAFT: { label: "Nháp", tone: "neutral" },
  SENT: { label: "Đã gửi", tone: "warning" },
  SIGNED: { label: "Đã ký", tone: "info" },
  COMPLETED: { label: "Hoàn tất", tone: "positive" },
  CANCELLED: { label: "Đã huỷ", tone: "danger" },
  UNKNOWN: { label: "Đang cập nhật", tone: "neutral" },
};

/** "15/12/2026 – 20/12/2026", one date when both are the same, or "Chưa xác định". */
export function batchWindow(batch: Pick<ContractBatch, "windowStart" | "windowEnd">): string {
  const { windowStart, windowEnd } = batch;
  if (windowStart && windowEnd && windowStart !== windowEnd) {
    return `${formatDate(windowStart)} – ${formatDate(windowEnd)}`;
  }
  const day = windowStart ?? windowEnd;
  return day ? formatDate(day) : "Chưa xác định";
}

/**
 * When an installment is due (14 §4.3 step 12): its milestone, the days after it, and the delivery
 * batch it is tied to — "Khi ký hợp đồng", "Trước khi giao hàng · đợt giao 1", "30 ngày sau khi
 * giao hàng · đợt giao 2".
 */
export function installmentDue(installment: ContractInstallment): string {
  const milestone = INSTALLMENT_MILESTONE_LABEL[installment.milestone];
  const days = installment.dueDays ?? 0;
  let when = milestone;
  if (days > 0 && installment.milestone === "ON_SIGNING") when = `Trong ${days} ngày kể từ khi ký`;
  if (days > 0 && installment.milestone === "AFTER_DELIVERY")
    when = `${days} ngày sau khi giao hàng`;
  return installment.deliveryBatchSeq != null
    ? `${when} · đợt giao ${installment.deliveryBatchSeq}`
    : when;
}
