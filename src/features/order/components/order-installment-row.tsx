"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "cn";

import { InstallmentTransferSection } from "@/components/storefront/transfer-instructions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format/date";
import { formatMoney } from "@/lib/format/money";
import {
  INSTALLMENT_MILESTONE_LABEL,
  installmentStatusMeta,
  installmentTitle,
  isPayable,
  type Installment,
} from "@/lib/installments";

import { ORDER_TONE_CLASSES } from "./order-status-badge";

/** When the installment is wanted, in the customer's words. */
function dueText(installment: Installment): string | null {
  if (installment.dueDate) return `Hạn ${formatDate(installment.dueDate)}`;
  if (installment.status === "PAID" || installment.status === "CANCELLED") return null;
  // 15 §4.1: BEFORE_DELIVERY has no due day; it holds the handover until paid.
  if (installment.milestone === "BEFORE_DELIVERY") return "Cần thanh toán trước khi giao hàng";
  if (installment.milestone === "AFTER_DELIVERY") return "Đến hạn sau khi giao hàng";
  return null;
}

/**
 * One installment of the order's contract: what it is for, its amount and what is still owed, its
 * standing (overdue in danger) and, while it still owes money, a toggle for its transfer details -
 * asked from the BE only when opened.
 */
export function OrderInstallmentRow({ installment }: { installment: Installment }) {
  const [open, setOpen] = useState(false);
  const money = (amount: number) => formatMoney(amount, installment.currency);
  const meta = installmentStatusMeta(installment);
  const payable = isPayable(installment);
  const due = dueText(installment);
  const panelId = `installment-transfer-${installment.installmentId}`;

  return (
    <li
      data-overdue={installment.overdue || undefined}
      className={cn(
        "space-y-2 rounded-[var(--r-md)] border p-3 text-sm",
        installment.overdue ? "border-danger/40 bg-danger/5" : "border-border-default",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-ink-primary font-semibold">{installmentTitle(installment)}</p>
          <p className="text-ink-secondary">
            {INSTALLMENT_MILESTONE_LABEL[installment.milestone]}
            {installment.deliveryBatchSeq ? ` · đợt giao ${installment.deliveryBatchSeq}` : ""}
          </p>
        </div>
        <Badge
          data-tone={meta.tone}
          className={cn(
            "h-7 shrink-0 rounded-full px-3 font-semibold",
            ORDER_TONE_CLASSES[meta.tone],
          )}
        >
          {meta.label}
        </Badge>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
        <div>
          <dt className="text-ink-secondary">Số tiền</dt>
          <dd className="text-ink-primary font-medium tabular-nums">{money(installment.amount)}</dd>
        </div>
        <div className="text-right">
          <dt className="text-ink-secondary">Còn phải trả</dt>
          <dd
            className={cn(
              "font-semibold tabular-nums",
              installment.overdue ? "text-danger" : "text-ink-primary",
            )}
          >
            {money(installment.outstanding)}
          </dd>
        </div>
      </dl>
      {due ? (
        <p className={cn(installment.overdue ? "text-danger font-medium" : "text-ink-secondary")}>
          {due}
        </p>
      ) : null}
      {payable ? (
        <>
          <Button
            type="button"
            variant="outline"
            aria-expanded={open}
            aria-controls={panelId}
            className="min-h-11 w-full justify-between rounded-[var(--r-md)] px-3"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? "Ẩn thông tin chuyển khoản" : "Xem thông tin chuyển khoản"}
            <ChevronDown
              aria-hidden
              className={cn("size-4 transition-transform", open && "rotate-180")}
            />
          </Button>
          {open ? (
            <div id={panelId}>
              <InstallmentTransferSection installmentId={installment.installmentId} />
            </div>
          ) : null}
        </>
      ) : null}
    </li>
  );
}
