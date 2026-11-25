import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { STORE_ROUTES } from "@/constants";
import { ToneBadge } from "@/components/storefront/tone-badge";
import { daysUntil, formatDate, formatDateTime } from "@/lib/format/date";
import { formatMoney } from "@/lib/format/money";
import { formatNumber } from "@/lib/format/number";

import { effectiveStatus, quoteListHint } from "../lifecycle";
import type { QuoteRow } from "../types";
import { QuoteStatusBadge } from "./quote-states";

/** "Bản sửa Số 1": a small label and its value, inline. */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 gap-1">
      <dt>{label}</dt>
      <dd className="text-ink-secondary tabular-nums">{children}</dd>
    </div>
  );
}

/** A SENT quote this close to its validity's end gets the "Còn N ngày" chip (SF-UX-15). */
export const EXPIRY_WARNING_DAYS = 3;

/** "Còn 2 ngày" / "Hết hạn hôm nay" for a SENT quote within the warning window, else null. */
export function expiryChip(quote: Pick<QuoteRow, "status" | "validUntil">, now = new Date()) {
  if (effectiveStatus(quote, now) !== "SENT") return null;
  const days = daysUntil(quote.validUntil, now);
  if (days < 0 || days > EXPIRY_WARNING_DAYS) return null;
  return days === 0 ? "Hết hạn hôm nay" : `Còn ${days} ngày`;
}

/** "Ly giấy 12oz · 3 dòng": what is quoted, when the BE says (R5-2 fields are optional). */
function contentsOf(quote: QuoteRow): string | null {
  const parts = [
    quote.firstItemName?.trim() || null,
    quote.lineCount != null ? `${formatNumber(quote.lineCount)} dòng` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * One quote of the list (BE QuoteRowResponse), as one outlined row like an order: number and sent date, what is quoted,
 * revision and validity, what happens next on the left; status, total with VAT (when the BE sends it) and the way in on
 * the right. A SENT quote about to expire says so. The whole row is one link target.
 */
export function QuoteRowCard({ quote, now }: { quote: QuoteRow; now?: Date }) {
  const chip = expiryChip(quote, now);
  const contents = contentsOf(quote);
  return (
    <article className="bg-bg-surface border-border-default hover:border-border-strong focus-within:ring-accent relative flex flex-col gap-3 rounded-[var(--r-lg)] border px-[var(--card-pad)] py-3.5 transition-colors focus-within:ring-2 sm:flex-row sm:items-center sm:gap-6">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="text-ink-primary font-mono font-semibold tabular-nums">{quote.quoteNumber}</span>
          {quote.sentAt ? (
            <span className="text-ink-tertiary tabular-nums">{formatDate(quote.sentAt)}</span>
          ) : null}
        </p>
        {contents ? <p className="text-ink-secondary text-sm break-words">{contents}</p> : null}
        <dl className="text-ink-tertiary flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
          <Fact label="Bản sửa">Số {quote.revision}</Fact>
          {quote.status === "CHANGES_REQUESTED" ? null : (
            <Fact label="Hiệu lực đến">{formatDateTime(quote.validUntil)}</Fact>
          )}
        </dl>
        <p className="text-ink-tertiary text-xs">{quoteListHint(quote.status)}</p>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-4 sm:justify-end">
        <span className="flex flex-wrap items-center gap-2">
          {chip ? <ToneBadge size="sm" tone="warning" label={chip} /> : null}
          <QuoteStatusBadge status={quote.status} />
        </span>
        {quote.total != null ? (
          <p className="text-ink-primary min-w-28 text-right text-base font-semibold tabular-nums">
            <span className="sr-only">Tổng có VAT </span>
            {formatMoney(quote.total)}
          </p>
        ) : null}
        <Link
          href={STORE_ROUTES.account.quotes.detail(quote.id)}
          aria-label={`Xem báo giá ${quote.quoteNumber}`}
          className="text-ink-tertiary hover:text-ink-primary inline-flex size-11 items-center justify-center rounded-[var(--r-md)] after:absolute after:inset-0 after:rounded-[var(--r-lg)] focus-visible:outline-none"
        >
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      </div>
    </article>
  );
}
