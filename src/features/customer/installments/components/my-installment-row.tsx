"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { cn } from "cn";

import { InstallmentReceipts } from "@/components/storefront/installment-receipts";
import { TONE_BADGE_CLASSES } from "@/components/storefront/tone-badge";
import { InstallmentTransferSection } from "@/components/storefront/transfer-instructions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { STORE_ROUTES } from "@/constants";
import { formatDate } from "@/lib/format/date";
import { formatMoney } from "@/lib/format/money";
import {
  INSTALLMENT_MILESTONE_LABEL,
  installmentStatusMeta,
  installmentTitle,
  isPayable,
  type Installment,
} from "@/lib/installments";

function Cell({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-ink-secondary">{label}</dt>
      <dd
        className={cn(
          "tabular-nums",
          strong ? "text-danger-ink font-semibold" : "text-ink-primary font-medium",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/** "Chuyển khoản": the transfer details of an owing installment, asked from the BE when opened. */
function TransferDisclosure({ installment }: { installment: Installment }) {
  const [open, setOpen] = useState(false);
  const panelId = `my-installment-transfer-${installment.installmentId}`;
  return (
    <>
      <Button
        type="button"
        variant="outline"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`${open ? "Ẩn" : "Xem"} thông tin chuyển khoản ${installmentTitle(installment)}, đơn ${installment.orderNumber}`}
        className="min-h-11 w-full justify-between rounded-[var(--r-md)] px-3 sm:w-auto sm:gap-3"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "Ẩn thông tin chuyển khoản" : "Chuyển khoản"}
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
  );
}

/**
 * One installment of the customer's contracts: which order and contract, what it is for, the money,
 * its due day and standing - an overdue one highlighted (overdue is a flag, WF-05 fix plan §8). With
 * `withTransfer` (the "Thanh toán" page, SF-UX-39) an owing one opens its transfer details in place;
 * otherwise the order page holds them, and the row links there.
 */
export function MyInstallmentRow({
  installment,
  withTransfer = false,
}: {
  installment: Installment;
  withTransfer?: boolean;
}) {
  const money = (amount: number) => formatMoney(amount, installment.currency);
  const meta = installmentStatusMeta(installment);
  const overdue = installment.overdue;
  return (
    <li
      data-overdue={overdue || undefined}
      className={cn(
        "space-y-2 rounded-[var(--r-md)] border p-3 text-sm sm:p-4",
        overdue ? "border-danger/40 bg-danger/5" : "border-border-default bg-bg-surface",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <Link
            href={STORE_ROUTES.account.orders.detail(installment.orderId)}
            className="text-accent focus-visible:ring-accent inline-flex min-h-11 items-center rounded font-semibold underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:outline-none"
          >
            Đơn {installment.orderNumber}
          </Link>
          <p className="text-ink-secondary">
            {installmentTitle(installment)} · {INSTALLMENT_MILESTONE_LABEL[installment.milestone]}
          </p>
          <p className="text-ink-tertiary font-mono text-xs">HĐ {installment.contractNumber}</p>
        </div>
        <Badge className={cn("h-7 rounded-full px-3 font-semibold", TONE_BADGE_CLASSES[meta.tone])}>
          {meta.label}
        </Badge>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
        <Cell label="Số tiền" value={money(installment.amount)} />
        <Cell label="Đã thanh toán" value={money(installment.paidAmount)} />
        <Cell label="Còn phải trả" value={money(installment.outstanding)} strong={overdue} />
        <Cell
          label="Hạn thanh toán"
          value={installment.dueDate ? formatDate(installment.dueDate) : "Chưa có"}
          strong={overdue}
        />
      </dl>
      {withTransfer && isPayable(installment) ? (
        <TransferDisclosure installment={installment} />
      ) : null}
      {withTransfer ? <InstallmentReceipts installment={installment} /> : null}
    </li>
  );
}
