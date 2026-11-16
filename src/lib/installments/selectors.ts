import type { SemanticTone } from "@/lib/domain/types";

import type { Installment, InstallmentMilestone, InstallmentStatus } from "./schemas";

/** Labels follow kltn-docs 15 §4.1 (mốc đến hạn) and §5.1 (trạng thái đợt). */
export const INSTALLMENT_MILESTONE_LABEL: Record<InstallmentMilestone, string> = {
  ON_SIGNING: "Khi ký hợp đồng",
  BEFORE_DELIVERY: "Trước khi giao hàng",
  AFTER_DELIVERY: "Sau khi giao hàng",
  CANCELLATION_FEE: "Phí huỷ đơn",
  FAILED_TRIP_FEE: "Phí chuyến giao không thành",
  UNKNOWN: "Đợt thanh toán",
};

export const INSTALLMENT_STATUS_LABEL: Record<InstallmentStatus, string> = {
  NOT_DUE: "Chưa đến hạn",
  DUE: "Đến hạn",
  PARTIALLY_PAID: "Đã trả một phần",
  PAID: "Đã thanh toán",
  CANCELLED: "Đã huỷ",
  UNKNOWN: "Đang cập nhật",
};

const STATUS_TONE: Record<InstallmentStatus, SemanticTone> = {
  NOT_DUE: "neutral",
  DUE: "warning",
  PARTIALLY_PAID: "info",
  PAID: "positive",
  CANCELLED: "muted",
  UNKNOWN: "neutral",
};

/**
 * What the customer reads for an installment. Overdue is a flag, not a status (WF-05 fix plan §8):
 * a DUE or PARTIALLY_PAID installment past its due day reads "Quá hạn" in danger.
 */
export function installmentStatusMeta(installment: Pick<Installment, "status" | "overdue">): {
  label: string;
  tone: SemanticTone;
} {
  if (installment.overdue) return { label: "Quá hạn", tone: "danger" };
  return {
    label: INSTALLMENT_STATUS_LABEL[installment.status],
    tone: STATUS_TONE[installment.status],
  };
}

/**
 * Whether the customer may be shown how to transfer for it: it still owes money and is not settled.
 * An installment not yet due can be paid early (15 §4.2 step 6), so NOT_DUE counts.
 */
export function isPayable(installment: Pick<Installment, "status" | "outstanding">): boolean {
  return (
    installment.outstanding > 0 &&
    installment.status !== "PAID" &&
    installment.status !== "CANCELLED" &&
    installment.status !== "UNKNOWN"
  );
}

/** The installment's name as the customer reads it: "Đợt 1 · Đặt cọc". */
export function installmentTitle(installment: Pick<Installment, "seq" | "name">): string {
  const name = installment.name.trim();
  return name ? `Đợt ${installment.seq} · ${name}` : `Đợt ${installment.seq}`;
}
