import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import type { Currency } from "@/lib/domain/types";
import { formatMoney } from "@/lib/format/money";

interface OrderCardProps {
  href: string;
  orderCode: string;
  status: string;
  itemCount: number;
  total: number;
  createdAt: string;
  /** Replaces the plain status badge, e.g. a feature badge with a localized label and tone. */
  statusBadge?: ReactNode;
  currency?: Currency;
  /** What the order contains, e.g. the first line and "and N more". Defaults to the item count. */
  preview?: ReactNode;
  /** One line telling the customer what happens next. */
  hint?: string;
  ctaLabel?: string;
}

/**
 * One order-history row: number and date over what it holds and what happens next on the left; status, total and the
 * way in on the right. One outlined row, not a three-tier card. The whole row is one link target (stretched CTA).
 */
export function OrderCard({
  href,
  orderCode,
  status,
  itemCount,
  total,
  createdAt,
  statusBadge,
  currency = "VND",
  preview,
  hint,
  ctaLabel = "Xem đơn",
}: OrderCardProps) {
  return (
    <article className="bg-bg-surface border-border-default hover:border-border-strong focus-within:ring-accent relative flex flex-col gap-3 rounded-[var(--r-lg)] border px-[var(--card-pad)] py-3.5 transition-colors focus-within:ring-2 sm:flex-row sm:items-center sm:gap-6">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="text-ink-primary font-mono font-semibold whitespace-nowrap tabular-nums">
            {orderCode}
          </span>
          <span className="text-ink-tertiary tabular-nums">{createdAt}</span>
        </p>
        <div className="text-ink-secondary text-sm">{preview ?? <p>{itemCount} sản phẩm</p>}</div>
        {hint && <p className="text-ink-tertiary text-xs">{hint}</p>}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-4 sm:justify-end">
        {statusBadge ?? (
          <Badge variant="secondary" className="rounded-full">
            {status}
          </Badge>
        )}
        <span className="text-ink-primary min-w-28 text-right text-base font-semibold tabular-nums">
          {formatMoney(total, currency)}
        </span>
        <Link
          href={href}
          aria-label={`${ctaLabel} ${orderCode}`}
          className="text-ink-tertiary hover:text-ink-primary inline-flex size-11 items-center justify-center rounded-[var(--r-md)] after:absolute after:inset-0 after:rounded-[var(--r-lg)] focus-visible:outline-none"
        >
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      </div>
    </article>
  );
}
