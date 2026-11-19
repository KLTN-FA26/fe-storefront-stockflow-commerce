"use client";

import { useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, MessageCircle } from "lucide-react";

import { STORE_ROUTES } from "@/constants";
import { Alert } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { hasErrorCode } from "@/lib/api/describe-error";
import { PERM } from "@/lib/auth/permission-codes";
import { useHasPermission } from "@/lib/auth/my-permissions";

import { describeQuoteError, isQuoteNotFound } from "../errors";
import { allowedQuoteActions, effectiveStatus, QUOTE_STATUS_META } from "../lifecycle";
import { useAcceptQuote, useRequestQuoteChanges } from "../mutations";
import { useQuote } from "../queries";
import { isValidQuoteId } from "../schemas";
import { QuoteAcceptForm } from "./quote-accept-form";
import { QuoteChangeRequestDialog } from "./quote-change-request-dialog";
import { QuoteDocumentButton } from "./quote-document-button";
import { QuoteLinesCard } from "./quote-lines";
import {
  QuoteDetailSkeleton,
  QuoteLoadError,
  QuoteStaleNotice,
  QuoteStatusBadge,
} from "./quote-states";
import { QuoteHistory, QuoteInfoCard, QuoteTotalsCard } from "./quote-summary";

function BackToQuotes() {
  return (
    <Link
      href={STORE_ROUTES.account.quotes.list}
      className="text-ink-secondary hover:text-ink-primary focus-visible:ring-accent -ml-2 inline-flex min-h-11 items-center rounded-full px-2 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
    >
      <ChevronLeft aria-hidden className="mr-1 size-4" />
      Báo giá của tôi
    </Link>
  );
}

/** One quote Sales sent (WF-02 D2): its lines, fees, totals with tax; accept or ask for changes. */
export function QuoteDetailScreen({ quoteId: rawQuoteId }: { quoteId: string }) {
  const quoteId = rawQuoteId.toLowerCase();
  const [asking, setAsking] = useState(false);
  const { data: quote, isPending, isFetching, error, refetch } = useQuote(quoteId);
  const accept = useAcceptQuote();
  const changes = useRequestQuoteChanges();
  const canAnswer = useHasPermission(PERM.quotesApprove);

  if (!isValidQuoteId(quoteId)) notFound();
  if (isPending) return <QuoteDetailSkeleton />;
  if (isQuoteNotFound(error)) notFound();
  if (!quote) {
    return (
      <QuoteLoadError
        title="Không tải được báo giá"
        error={error}
        onRetry={() => void refetch()}
        retrying={isFetching}
      />
    );
  }

  // QUOTE_EXPIRED from an answer: the BE says it is over, whatever the cached copy says (F-03.3).
  const refusedExpired =
    hasErrorCode(accept.error, "QUOTE_EXPIRED") || hasErrorCode(changes.error, "QUOTE_EXPIRED");
  const status = refusedExpired ? "EXPIRED" : effectiveStatus(quote);
  const actions = refusedExpired
    ? { accept: false, requestChanges: false }
    : allowedQuoteActions(quote, { canAnswer });
  const answering = accept.isPending || changes.isPending;

  return (
    <div className="space-y-5">
      <div className="border-border-default border-b pb-3.5">
        <BackToQuotes />
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-ink-primary text-xl font-bold sm:text-2xl">
                Báo giá <span className="font-mono tabular-nums">{quote.quoteNumber}</span>
              </h1>
              <QuoteStatusBadge status={status} />
            </div>
            <p className="text-ink-secondary text-sm">{QUOTE_STATUS_META[status].hint}</p>
          </div>
          <div className="flex flex-wrap items-start gap-2">
            <QuoteDocumentButton quoteId={quote.id} quoteNumber={quote.quoteNumber} />
            <Button asChild variant="outline" className="min-h-11 rounded-[var(--r-md)] px-4">
              <Link href={STORE_ROUTES.chat.about("QUOTE", quote.id)}>
                <MessageCircle aria-hidden className="mr-2 size-4" />
                Chat với Sale
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {error ? (
        <QuoteStaleNotice error={error} onRetry={() => void refetch()} retrying={isFetching} />
      ) : null}
      {refusedExpired ? (
        <div role="alert">
          <Alert tone="warning" title="Báo giá đã hết hiệu lực">
            {describeQuoteError(accept.error ?? changes.error)}
          </Alert>
        </div>
      ) : null}
      {quote.legacy ? (
        <Alert tone="info" title="Báo giá cũ">
          Báo giá này được lập theo cách cũ nên chỉ để xem. Hãy chat với Sale để nhận báo giá mới.
        </Alert>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
        <div className="min-w-0 space-y-5">
          {actions.accept ? (
            <QuoteAcceptForm
              quote={quote}
              pending={answering}
              error={accept.error}
              onRequestChanges={() => {
                changes.reset();
                setAsking(true);
              }}
              onAccept={(lines) =>
                accept.mutate({ quoteId: quote.id, version: quote.version, lines })
              }
            />
          ) : (
            <QuoteLinesCard quote={quote} />
          )}
          <QuoteHistory quote={quote} />
        </div>
        <div className="space-y-5">
          <QuoteTotalsCard quote={quote} />
          <QuoteInfoCard quote={quote} status={status} />
        </div>
      </div>

      <QuoteChangeRequestDialog
        open={asking && actions.requestChanges}
        quoteNumber={quote.quoteNumber}
        onOpenChange={setAsking}
        pending={changes.isPending}
        error={changes.error ? describeQuoteError(changes.error) : undefined}
        onSubmit={(feedback) =>
          changes.mutate(
            { quoteId: quote.id, version: quote.version, feedback },
            { onSuccess: () => setAsking(false) },
          )
        }
      />
    </div>
  );
}
