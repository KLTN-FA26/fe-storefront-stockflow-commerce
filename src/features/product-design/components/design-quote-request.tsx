"use client";

import { RotateCw } from "lucide-react";
import { useState } from "react";

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
  QuoteRequestStatusBadge,
  cartonsLabel,
  desiredDateLabel,
} from "./quote-request-parts";

// A design's quote request where the design is shown: its card (the list, the project page) and
// the studio of an approved design. The requests are read only for a design that can have one
// (`mayHaveQuoteRequest`): a page of plain drafts costs no request.

/** The facts of a request: cartons, date, its status, the customer's SKU once approved. */
export function QuoteRequestFacts({ request }: { request: DesignQuoteRequest }) {
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
        <QuoteRequestStatusBadge status={request.status} />
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
export function DesignQuoteSummary({ design }: { design: Design }) {
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
  return request ? <QuoteRequestFacts request={request} /> : null;
}

/**
 * "Yêu cầu báo giá" on an APPROVED design, for a customer holding `design-quote-requests:CREATE`;
 * the dialog starts from the open request, which asking again changes.
 */
export function RequestQuoteButton({
  design,
  className,
}: {
  design: Pick<Design, "id" | "name" | "status">;
  className?: string;
}) {
  const allowed = useHasPermission(PERM.designQuoteRequest);
  const offered = allowed && allowedActions(design).includes("requestQuote");
  const requests = useDesignQuoteRequests(design.id, offered, CARD_QUOTE_REQUESTS);
  const [open, setOpen] = useState(false);
  if (!offered) return null;
  return (
    <>
      <Button
        type="button"
        className={cn(ACTION_BUTTON, className)}
        aria-label={`Yêu cầu báo giá ${design.name}`}
        onClick={() => setOpen(true)}
      >
        Yêu cầu báo giá
      </Button>
      <QuoteRequestDialog
        design={design}
        current={openQuoteRequest(requests.data)}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
