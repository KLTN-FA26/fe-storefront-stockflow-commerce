import {
  INSTALLMENT_MILESTONE,
  INSTALLMENT_STATUS,
  installmentStatusOf,
  type StatusMeta,
} from "@/lib/domain/status-map";

import type { Installment, InstallmentMilestone, InstallmentStatus } from "./schemas";

/** Labels follow kltn-docs 15 §4.1 (mốc đến hạn); the one table pages and chat cards share. */
export const INSTALLMENT_MILESTONE_LABEL: Readonly<Record<InstallmentMilestone, string>> =
  INSTALLMENT_MILESTONE;

export const INSTALLMENT_STATUS_LABEL: Readonly<Record<InstallmentStatus, string>> =
  Object.fromEntries(
    Object.entries(INSTALLMENT_STATUS).map(([status, meta]) => [status, meta.label]),
  ) as Record<InstallmentStatus, string>;

/**
 * What the customer reads for an installment. Overdue is a flag, not a status (WF-05 fix plan §8):
 * a DUE or PARTIALLY_PAID installment past its due day reads "Quá hạn" in danger.
 */
export function installmentStatusMeta(
  installment: Pick<Installment, "status" | "overdue">,
): StatusMeta {
  return installmentStatusOf(installment.status, installment.overdue);
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

/**
 * Names the BE gives the fee items it opens (English, payment `OrderSettlement`) as the customer reads them. Audit r3 LM-3:
 * when the rest of an order is closed, what the installments before delivery of the batches closed whole still owe above
 * the goods closed - their share of the plate and shipping fees - moves onto the closure's fee item; that is not a
 * cancellation fee. An unknown name is shown as sent.
 */
const FEE_ITEM_NAMES: Readonly<Record<string, string>> = {
  "Cancellation fee": "Phí huỷ đơn",
  "Fee for the rest closed": "Phí đóng phần còn lại",
  "Fee lines of the batches closed": "Phí khuôn, phí vận chuyển của các đợt giao đã đóng",
  "Fee for the rest closed, with the fee lines of the batches closed":
    "Phí đóng phần còn lại, kèm phí khuôn, phí vận chuyển của các đợt giao đã đóng",
};
const CANCELLATION_FEE_NAME = "Cancellation fee";

/** The installment's name as the customer reads it: a BE fee item's name in Vietnamese, any other as sent. */
export function installmentName(name: string): string {
  const trimmed = name.trim();
  return FEE_ITEM_NAMES[trimmed] ?? trimmed;
}

/**
 * A fee the BE opens as an installment (cancellation, closing the rest, a failed trip charged before
 * WF-05 Q-19). Told by its milestone, not by `seq`: the BE numbers fees from 21 (WF-02 FE-7), and
 * "Đợt 21" is no installment the contract lists.
 */
export function isFeeItem(installment: Pick<Installment, "milestone">): boolean {
  return (
    installment.milestone === "CANCELLATION_FEE" || installment.milestone === "FAILED_TRIP_FEE"
  );
}

/**
 * How the customer refers to one installment in a sentence: "Đợt 1", or a fee item by its own name
 * ("Phí huỷ đơn"), its milestone's label when the BE sent none.
 */
export function installmentShortName(
  installment: Pick<Installment, "seq" | "name" | "milestone">,
): string {
  if (!isFeeItem(installment)) return `Đợt ${installment.seq}`;
  return installmentName(installment.name) || INSTALLMENT_MILESTONE_LABEL[installment.milestone];
}

/** The installment's name as the customer reads it: "Đợt 1 · Đặt cọc", a fee item by its name alone. */
export function installmentTitle(
  installment: Pick<Installment, "seq" | "name" | "milestone">,
): string {
  if (isFeeItem(installment)) return installmentShortName(installment);
  const name = installmentName(installment.name);
  return name ? `Đợt ${installment.seq} · ${name}` : `Đợt ${installment.seq}`;
}

/**
 * When one installment falls due, as the customer reads it: a fee item (`CANCELLATION_FEE`) opened by a cancellation or by
 * closing the rest of the order - with what the closed batches still owed carried onto it (audit r3 LM-3) - by the name
 * the BE gave it; any other milestone, or an unknown name, by the milestone's label.
 */
export function installmentMilestoneLabel(
  installment: Pick<Installment, "milestone" | "name">,
): string {
  const name = installment.name.trim();
  if (installment.milestone === "CANCELLATION_FEE" && FEE_ITEM_NAMES[name]) {
    return name === CANCELLATION_FEE_NAME ? "Phí huỷ đơn" : "Khoản phải trả khi đóng phần còn lại";
  }
  return INSTALLMENT_MILESTONE_LABEL[installment.milestone];
}

/**
 * The milestone line under an installment's title, or null when it would only repeat the title (a
 * fee item titled "Phí huỷ đơn" whose milestone also reads "Phí huỷ đơn").
 */
export function installmentMilestoneNote(
  installment: Pick<Installment, "seq" | "name" | "milestone">,
): string | null {
  const label = installmentMilestoneLabel(installment);
  return label === installmentTitle(installment) ? null : label;
}

/**
 * Owed now, the one rule the account to-do strip and the payments page share: payable, and either
 * overdue, DUE (its milestone reached), or paid in part after its milestone was reached. A part
 * payment made before the milestone (paid early) is not due yet.
 */
export function isDueNow(
  installment: Pick<Installment, "status" | "outstanding" | "overdue" | "reachedAt">,
): boolean {
  if (!isPayable(installment)) return false;
  if (installment.overdue || installment.status === "DUE") return true;
  return installment.status === "PARTIALLY_PAID" && installment.reachedAt != null;
}
