"use client";

import { CreditCard, PenLine, SplitSquareHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatDayMonth } from "@/lib/format/date";
import { formatMoney } from "@/lib/format/money";
import { isShortageOpen, type ShortageCard } from "@/lib/domain/shortage";
import { installmentShortName, type Installment } from "@/lib/installments";

import type { Contract } from "../contract-schemas";
import type { OrderDisplayGroup } from "../lifecycle";
import { CONTRACT_SECTION_ID } from "./contract-signing-steps";
import { SHORTAGE_SECTION_ID } from "./order-shortage-card";

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
 * The status hero's call to action (SF-UX-29): a contract waiting to be signed leads to its three
 * steps in the contract card, which holds the one "Tải hợp đồng" button of the page (UI/UX 27/11,
 * sf-07); an installment due now is paid from here, which opens its transfer details in the payment
 * card. Nothing when the order waits on no one but the shop.
 */
export function OrderNextStep({
  group,
  contract,
  payable,
  onPay,
  shortage,
}: {
  group: OrderDisplayGroup;
  contract: Contract | null | undefined;
  /** `nextPayable(plan)`: the installment due now, if any. */
  payable: Installment | null;
  onPay: (installmentId: string) => void;
  /** The order's live shortage card: while it waits for the customer's choice, that is the next step (17 §4.14). */
  shortage?: ShortageCard | null | undefined;
}) {
  if (shortage && isShortageOpen(shortage)) {
    return (
      <Button asChild className="min-h-11 w-full rounded-[var(--r-md)] px-4 sm:w-auto">
        <a href={`#${SHORTAGE_SECTION_ID}`}>
          <SplitSquareHorizontal aria-hidden className="mr-2 size-4" />
          Chọn hướng xử lý thiếu thùng
        </a>
      </Button>
    );
  }
  if (group === "AWAITING_CONTRACT" && contract?.status === "SENT") {
    return (
      <Button asChild className="min-h-11 w-full rounded-[var(--r-md)] px-4 sm:w-auto">
        <a href={`#${CONTRACT_SECTION_ID}`}>
          <PenLine aria-hidden className="mr-2 size-4" />
          Ký hợp đồng: xem 3 bước
        </a>
      </Button>
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
