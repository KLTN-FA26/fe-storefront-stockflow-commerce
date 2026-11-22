import Link from "next/link";
import { FileText } from "lucide-react";

import { STORE_ROUTES } from "@/constants";
import { formatDate, formatDateTime } from "@/lib/format/date";

import { quoteListHint } from "../lifecycle";
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

/**
 * One quote of the list (BE QuoteRowResponse): number, status, revision, validity, sent date. The
 * row carries no total — the BE list has none — so the amount is read on the detail. The whole
 * card is one link target.
 */
export function QuoteRowCard({ quote }: { quote: QuoteRow }) {
  return (
    <article className="bg-bg-surface border-border-default hover:border-border-strong focus-within:ring-accent relative rounded-[var(--r-lg)] border shadow-[var(--card-shadow)] transition-colors focus-within:ring-2">
      <div className="border-border-default flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b px-[var(--card-pad)] py-3">
        <p className="flex min-w-0 items-center gap-2">
          <FileText aria-hidden className="text-ink-tertiary size-4 shrink-0" />
          <span className="text-ink-primary font-mono font-semibold tabular-nums">
            {quote.quoteNumber}
          </span>
        </p>
        <QuoteStatusBadge status={quote.status} />
      </div>
      <div className="space-y-2 px-[var(--card-pad)] py-3">
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
