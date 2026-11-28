import { CONTRACT_STATUS, type StatusMeta } from "@/lib/domain/status-map";
import { INSTALLMENT_MILESTONE_LABEL } from "@/lib/installments";
import { formatDate } from "@/lib/format/date";

import type {
  ContractBatch,
  ContractInstallment,
  ContractStatus,
  DeliveryBatchView,
  WindowChangeReason,
} from "./contract-schemas";

/** The contract's status in the customer's words (kltn-docs 14 §5.2): the map chat cards read too. */
export const CONTRACT_STATUS_META: Readonly<Record<ContractStatus, StatusMeta>> = CONTRACT_STATUS;

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

/** Why Sales moved a delivery window (17 BR-28), in the customer's words. */
export const WINDOW_CHANGE_REASON_LABEL: Record<WindowChangeReason, string> = {
  CUSTOMER_REQUEST: "Theo đề nghị của quý khách",
  SELLER_DELAY: "Do bên bán giao trễ so với lịch",
  UNKNOWN: "Lịch giao đã được điều chỉnh",
};

/**
 * What the customer reads for a batch whose window Sales moved (17 §5.2: the batch is marked moved,
 * with its original window): the window in force, the contract's, why, and when. Null when it was
 * never moved or when the BE sent no windows to show.
 */
export interface EffectiveWindow {
  /** The window in force, "15/12/2026 – 20/12/2026". */
  window: string;
  moved: boolean;
  /** The window the contract was signed with, when the batch moved. */
  contractWindow?: string;
  reason?: string;
  /** Date of the latest move, "28/11/2026". */
  changedOn?: string;
}

export function effectiveWindowOf(view: DeliveryBatchView | undefined): EffectiveWindow | null {
  if (!view || !(view.windowStart || view.windowEnd)) return null;
  const window = batchWindow(view);
  const latest = view.windowChanges.at(-1);
  if (!latest) return { window, moved: false };
  return {
    window,
    moved: true,
    contractWindow: batchWindow({
      windowStart: view.contractWindowStart,
      windowEnd: view.contractWindowEnd,
    }),
    reason: WINDOW_CHANGE_REASON_LABEL[latest.reason],
    ...(latest.changedAt ? { changedOn: formatDate(latest.changedAt) } : {}),
  };
}
