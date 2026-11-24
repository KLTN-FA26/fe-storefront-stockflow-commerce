"use client";

import { CreditCard } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatDayMonth } from "@/lib/format/date";
import { formatMoney } from "@/lib/format/money";
import { installmentShortName, type Installment } from "@/lib/installments";

import type { Contract } from "../contract-schemas";
import type { OrderDisplayGroup } from "../lifecycle";
import { ContractDownloadButton } from "./contract-download-button";
import { CONTRACT_SECTION_ID } from "./contract-signing-steps";

/**
 * "Thanh toán đợt 1: 28.620.000 ₫ trước 26/11", or "… (quá hạn)" once the day has passed. A fee item
 * goes by its name ("Thanh toán phí huỷ đơn: …"), never "đợt 21" (WF-02 FE-7).
 */
export function payLabel(installment: Installment): string {
  const name = installmentShortName(installment);
  const lowered = name.charAt(0).toLocaleLowerCase("vi") + name.slice(1);
  const head = `Thanh toán ${lowered}: ${formatMoney(installment.outstanding, installment.currency)}`;
  if (installment.overdue) return `${head} (quá hạn)`;
  return installment.dueDate
    ? `${head} trước ${formatDayMonth(new Date(`${installment.dueDate}T00:00:00+07:00`))}`
    : head;
}

/**
 * The status hero's call to action (SF-UX-29): a contract waiting to be signed is downloaded from
 * here, with the way to its three steps; an installment due now is paid from here, which opens its
 * transfer details in the payment card. Nothing when the order waits on no one but the shop.
 */
export function OrderNextStep({
  orderId,
  group,
  contract,
  payable,
  onPay,
}: {
  orderId: string;
  group: OrderDisplayGroup;
  contract: Contract | null | undefined;
  /** `nextPayable(plan)`: the installment due now, if any. */
  payable: Installment | null;
  onPay: (installmentId: string) => void;
}) {
  if (group === "AWAITING_CONTRACT" && contract?.status === "SENT") {
    return (
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <ContractDownloadButton
          orderId={orderId}
          contractNumber={contract.contractNumber}
          label="Tải hợp đồng để ký"
          variant="default"
          className="sm:w-auto"
        />
        <a
          href={`#${CONTRACT_SECTION_ID}`}
          className="text-accent focus-visible:ring-accent inline-flex min-h-11 items-center rounded-[var(--r-sm)] px-1 text-sm font-semibold underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
        >
          Xem 3 bước ký và gửi lại hợp đồng
        </a>
      </div>
    );
  }
  if (payable && (group === "AWAITING_PAYMENT" || payable.overdue)) {
    return (
      <Button
        type="button"
        className="min-h-11 w-full rounded-[var(--r-md)] px-4 sm:w-auto"
        onClick={() => onPay(payable.installmentId)}
      >
        <CreditCard aria-hidden className="mr-2 size-4" />
        {payLabel(payable)}
      </Button>
    );
  }
  return null;
}
