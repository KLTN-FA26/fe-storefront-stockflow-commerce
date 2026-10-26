import Link from "next/link";
import { Package } from "lucide-react";
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
 * Compact order-history row: header (number, date, badge), lines, footer (total, CTA).
 * The whole card is one link target (stretched CTA), so the tap area is the full card.
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
    <article className="bg-bg-surface border-border-default hover:border-border-strong focus-within:ring-accent relative rounded-[var(--r-lg)] border shadow-[var(--card-shadow)] transition-colors focus-within:ring-2">
      <div className="border-border-default flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b px-[var(--card-pad)] py-3">
        <p className="text-ink-secondary flex min-w-0 flex-1 basis-40 flex-wrap items-baseline gap-x-2 text-sm">
          <span className="text-ink-primary font-mono font-semibold whitespace-nowrap tabular-nums">
            {orderCode}
          </span>{" "}
          <span className="tabular-nums">{createdAt}</span>
        </p>
        <div className="shrink-0">
          {statusBadge ?? (
            <Badge variant="secondary" className="rounded-full">
              {status}
            </Badge>
          )}
        </div>
      </div>

      <div className="flex items-start gap-3 px-[var(--card-pad)] py-3">
        <span
          aria-hidden
          className="bg-bg-subtle text-ink-tertiary flex size-12 shrink-0 items-center justify-center rounded-[var(--r-md)]"
        >
          <Package className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-ink-primary">{preview ?? <p>{itemCount} sản phẩm</p>}</div>
          {hint && <p className="text-ink-secondary mt-1 text-sm">{hint}</p>}
        </div>
      </div>

      <div className="border-border-default flex items-center justify-between gap-3 border-t px-[var(--card-pad)] py-2.5">
        <span className="text-ink-primary text-base font-bold tabular-nums">
          {formatMoney(total, currency)}
        </span>
        <Link
          href={href}
          aria-label={`${ctaLabel} ${orderCode}`}
          className="border-border-strong text-ink-primary hover:bg-bg-muted inline-flex min-h-11 items-center rounded-[var(--r-md)] border px-4 text-sm font-semibold after:absolute after:inset-0 after:rounded-[var(--r-lg)] focus-visible:outline-none"
        >
          {ctaLabel}
        </Link>
      </div>
    </article>
  );
}
