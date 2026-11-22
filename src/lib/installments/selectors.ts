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

/** The installment's name as the customer reads it: "Đợt 1 · Đặt cọc". */
export function installmentTitle(installment: Pick<Installment, "seq" | "name">): string {
  const name = installment.name.trim();
  return name ? `Đợt ${installment.seq} · ${name}` : `Đợt ${installment.seq}`;
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
