import Link from "next/link";
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

/** The whole card is one link target (stretched CTA), so the tap area is the full card. */
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
    <article className="bg-bg-surface hover:border-border-strong focus-within:ring-accent relative rounded-[var(--r-lg)] border border-transparent p-[var(--card-pad)] shadow-md transition-colors focus-within:ring-2">
      <div className="flex items-start justify-between gap-3">
        <p className="text-ink-secondary text-sm">
          {createdAt} · <span className="font-mono tabular-nums">{orderCode}</span>
        </p>
        {statusBadge ?? (
          <Badge variant="secondary" className="rounded-full">
            {status}
          </Badge>
        )}
      </div>

      <div className="text-ink-primary mt-3">{preview ?? <p>{itemCount} sản phẩm</p>}</div>
      {hint && <p className="text-ink-secondary mt-2 text-sm">{hint}</p>}

      <div className="border-border-default mt-4 flex items-center justify-between gap-3 border-t pt-4">
        <span className="font-display text-ink-primary text-xl font-bold tabular-nums">
          {formatMoney(total, currency)}
        </span>
        <Link
          href={href}
          aria-label={`${ctaLabel} ${orderCode}`}
          className="border-border-strong text-ink-primary hover:bg-bg-muted inline-flex min-h-11 items-center rounded-full border px-5 text-sm font-semibold after:absolute after:inset-0 after:rounded-[var(--r-lg)] focus-visible:outline-none"
        >
          {ctaLabel}
        </Link>
      </div>
    </article>
  );
}
