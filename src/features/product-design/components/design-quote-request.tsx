"use client";

import Link from "next/link";
import { RotateCw } from "lucide-react";
import { useState } from "react";

import { STORE_ROUTES } from "@/constants";
import { Skeleton } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { PERM } from "@/lib/auth/permission-codes";
import { useHasPermission } from "@/lib/auth/my-permissions";
import { cn } from "@/lib/cn";

import { allowedActions } from "../lifecycle";
import {
  currentQuoteRequest,
  openQuoteRequest,
  CARD_QUOTE_REQUESTS,
  useDesignQuoteRequests,
} from "../quote-request-queries";
import { mayHaveQuoteRequest } from "../quote-request-rules";
import type { Design, DesignQuoteRequest } from "../types";
import { QuoteRequestDialog } from "./quote-request-dialog";
import {
  ACTION_BUTTON,
  AnsweringQuoteLink,
  answeringQuote,
  QuoteRequestStatusBadge,
  cartonsLabel,
  desiredDateLabel,
} from "./quote-request-parts";

// A design's quote request where the design is shown: its card (the list, the project page) and
// the studio of an approved design. The requests are read only for a design that can have one
// (`mayHaveQuoteRequest`): a page of plain drafts costs no request.

/** The facts of a request: cartons, date, its status, the customer's SKU once approved. */
export function QuoteRequestFacts({
  request,
  quoteLink = true,
}: {
  request: DesignQuoteRequest;
  quoteLink?: boolean;
}) {
  const open = request.status === "OPEN";
  // The request stays open when the reviewer (Production Coordinator) returns the design (BE B40): the design is a
  // DRAFT again, with the reason it came back for.
  const returned = open && (request.designStatus === "DRAFT" || !!request.returnReason);
  const waitsForApproval = open && !returned && request.designStatus !== "APPROVED";
  return (
    <section
      aria-label="Yêu cầu báo giá"
      className="bg-bg-subtle grid gap-2 rounded-[var(--r-md)] p-3 text-sm"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-ink-primary font-medium">Yêu cầu báo giá</span>
        <QuoteRequestStatusBadge request={request} />
      </div>
      <dl className="text-ink-secondary grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt>Số thùng</dt>
        <dd className="text-ink-primary tabular-nums">{cartonsLabel(request.cartons)}</dd>
        <dt>Ngày giao</dt>
        <dd className="text-ink-primary tabular-nums">
          {desiredDateLabel(request.desiredDeliveryDate)}
        </dd>
        {request.customerSku ? (
          <>
            <dt>SKU riêng</dt>
            <dd className="text-ink-primary font-mono text-xs break-all">{request.customerSku}</dd>
          </>
        ) : null}
      </dl>
      <AnsweringQuoteLink request={request} link={quoteLink} />
      {returned ? (
        <p className="text-ink-tertiary text-xs">
          Thiết kế bị trả lại. Sửa theo lý do trả lại rồi gửi duyệt lại; Sale sẽ báo giá khi bản
          được duyệt.
        </p>
      ) : null}
      {waitsForApproval ? (
        <p className="text-ink-tertiary text-xs">
          Sale đã nhận yêu cầu và sẽ báo giá khi bản được duyệt.
        </p>
      ) : null}
    </section>
  );
}

/** The card's line: the request open now (else the latest), a placeholder while it is read. */
export function DesignQuoteSummary({
  design,
  quoteLink = true,
}: {
  design: Design;
  /** False when the card's own primary button already links to the answering quote. */
  quoteLink?: boolean;
}) {
  const enabled = mayHaveQuoteRequest(design);
  const requests = useDesignQuoteRequests(design.id, enabled, CARD_QUOTE_REQUESTS);
  if (!enabled) return null;
  if (requests.isPending) return <Skeleton className="h-16 w-full rounded-[var(--r-md)]" />;
  if (requests.isError) {
    return (
      <div className="text-ink-secondary flex flex-wrap items-center gap-2 text-sm">
        <span>Chưa tải được yêu cầu báo giá.</span>
        <Button
          type="button"
          variant="ghost"
          className={cn(ACTION_BUTTON, "px-3")}
          disabled={requests.isFetching}
          onClick={() => void requests.refetch()}
        >
          <RotateCw aria-hidden className="size-4" />
          Thử lại
        </Button>
      </div>
    );
  }
  const request = currentQuoteRequest(requests.data);
  return request ? <QuoteRequestFacts request={request} quoteLink={quoteLink} /> : null;
}

/**
 * "Yêu cầu báo giá" on an APPROVED design, for a customer holding `design-quote-requests:CREATE`:
 * the card's primary action (SF-UX-7). While a request is open the BE keeps one per design and a new
 * ask changes it (`DesignQuoteRequestService.request`, 200 not 201), so the button says "Sửa yêu cầu
 * báo giá" and steps back to an outline one: nothing new is filed, and the next move is Sales'.
 */
export function RequestQuoteButton({
  design,
  className,
}: {
  design: Pick<Design, "id" | "name" | "status"> & Partial<Pick<Design, "unitsPerCarton">>;
  className?: string;
}) {
  const allowed = useHasPermission(PERM.designQuoteRequest);
  const offered = allowed && allowedActions(design).includes("requestQuote");
  const requests = useDesignQuoteRequests(design.id, offered, CARD_QUOTE_REQUESTS);
  const [open, setOpen] = useState(false);
  if (!offered) return null;
  const current = openQuoteRequest(requests.data);
  // Sales already answered with a quote: its page is the next step, so it is the primary button and asking again
  // steps back to an outline one (SF-UX-7).
  const latest = currentQuoteRequest(requests.data);
  const answer = !current && latest ? answeringQuote(latest) : null;
  const label = current ? "Sửa yêu cầu báo giá" : "Yêu cầu báo giá";
  return (
    <>
      {answer ? (
        <Button asChild className={cn(ACTION_BUTTON, className)}>
          <Link
            href={STORE_ROUTES.account.quotes.detail(answer.id)}
            aria-label={`Xem báo giá ${design.name}`}
          >
            Xem báo giá
          </Link>
        </Button>
      ) : null}
      <Button
        type="button"
        variant={current || answer ? "outline" : "default"}
        className={cn(ACTION_BUTTON, className)}
        aria-label={`${label} ${design.name}`}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      <QuoteRequestDialog design={design} current={current} open={open} onOpenChange={setOpen} />
    </>
  );
}
