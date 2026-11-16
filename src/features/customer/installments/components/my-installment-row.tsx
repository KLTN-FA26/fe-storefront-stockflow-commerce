import Link from "next/link";
import { cn } from "cn";

import { Badge } from "@/components/ui/badge";
import { STORE_ROUTES } from "@/constants";
import type { SemanticTone } from "@/lib/domain/types";
import { formatDate } from "@/lib/format/date";
import { formatMoney } from "@/lib/format/money";
import {
  INSTALLMENT_MILESTONE_LABEL,
  installmentStatusMeta,
  installmentTitle,
  type Installment,
} from "@/lib/installments";

const TONE_CLASSES: Record<SemanticTone, string> = {
  positive: "bg-positive/10 text-positive",
  info: "bg-info/10 text-info",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger",
  neutral: "bg-neutral/10 text-neutral",
  muted: "bg-bg-muted text-ink-secondary",
  special: "bg-special/10 text-special",
};

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
          strong ? "text-danger font-semibold" : "text-ink-primary font-medium",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * One installment of the customer's contracts: which order and contract, what it is for, the money,
 * its due day and standing - an overdue one highlighted (overdue is a flag, WF-05 fix plan §8). The
 * order page holds the transfer details, so the row links there.
 */
export function MyInstallmentRow({ installment }: { installment: Installment }) {
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
        <Badge className={cn("h-7 rounded-full px-3 font-semibold", TONE_CLASSES[meta.tone])}>
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
    </li>
  );
}
