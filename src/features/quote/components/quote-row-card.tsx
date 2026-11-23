import Link from "next/link";
import { FileText } from "lucide-react";

import { STORE_ROUTES } from "@/constants";
import { ToneBadge } from "@/components/storefront/tone-badge";
import { daysUntil, formatDate, formatDateTime } from "@/lib/format/date";
import { formatMoney } from "@/lib/format/money";
import { formatNumber } from "@/lib/format/number";

import { effectiveStatus, quoteListHint } from "../lifecycle";
import type { QuoteRow } from "../types";
import { QuoteStatusBadge } from "./quote-states";

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-ink-tertiary text-xs">{label}</dt>
      <dd className="text-ink-primary text-sm font-medium tabular-nums">{children}</dd>
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
 * One quote of the list (BE QuoteRowResponse): number, status, what is quoted and its total with VAT
 * when the BE sends them, revision, validity, sent date; a SENT quote about to expire says so. The
 * whole card is one link target.
 */
export function QuoteRowCard({ quote, now }: { quote: QuoteRow; now?: Date }) {
  const chip = expiryChip(quote, now);
  const contents = contentsOf(quote);
  return (
    <article className="bg-bg-surface border-border-default hover:border-border-strong focus-within:ring-accent relative rounded-[var(--r-lg)] border shadow-[var(--card-shadow)] transition-colors focus-within:ring-2">
      <div className="border-border-default flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b px-[var(--card-pad)] py-3">
        <p className="flex min-w-0 items-center gap-2">
          <FileText aria-hidden className="text-ink-tertiary size-4 shrink-0" />
          <span className="text-ink-primary font-mono font-semibold tabular-nums">
            {quote.quoteNumber}
          </span>
        </p>
        <span className="flex flex-wrap items-center gap-2">
          {chip ? <ToneBadge size="sm" tone="warning" label={chip} /> : null}
          <QuoteStatusBadge status={quote.status} />
        </span>
      </div>
      <div className="space-y-2 px-[var(--card-pad)] py-3">
        {contents || quote.total != null ? (
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            {contents ? (
              <p className="text-ink-primary min-w-0 text-sm font-medium break-words">{contents}</p>
            ) : (
              <span />
            )}
            {quote.total != null ? (
              <p className="text-ink-primary text-base font-bold tabular-nums">
                <span className="text-ink-secondary mr-1 text-xs font-normal">Tổng có VAT</span>
                {formatMoney(quote.total)}
              </p>
            ) : null}
          </div>
        ) : null}
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Fact label="Bản sửa">Số {quote.revision}</Fact>
          {quote.status === "CHANGES_REQUESTED" ? null : (
            <Fact label="Hiệu lực đến">{formatDateTime(quote.validUntil)}</Fact>
          )}
          <Fact label="Ngày gửi">{quote.sentAt ? formatDate(quote.sentAt) : "—"}</Fact>
        </dl>
        <p className="text-ink-secondary text-sm">{quoteListHint(quote.status)}</p>
      </div>
      <div className="border-border-default flex justify-end border-t px-[var(--card-pad)] py-2.5">
        <Link
          href={STORE_ROUTES.account.quotes.detail(quote.id)}
          aria-label={`Xem báo giá ${quote.quoteNumber}`}
          className="border-border-strong text-ink-primary hover:bg-bg-muted inline-flex min-h-11 items-center rounded-[var(--r-md)] border px-4 text-sm font-semibold after:absolute after:inset-0 after:rounded-[var(--r-lg)] focus-visible:outline-none"
        >
          Xem báo giá
        </Link>
      </div>
    </article>
  );
}
