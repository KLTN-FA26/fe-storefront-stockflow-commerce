"use client";

import { useState } from "react";
import Link from "next/link";

import { STORE_ROUTES } from "@/constants";
import { hasUnsellableLine, UNSELLABLE_QUOTE_NOTICE } from "@/lib/domain/quote-purchasability";
import { formatDate, formatDateTime } from "@/lib/format/date";
import { formatNumber } from "@/lib/format/number";
import { cn } from "@/lib/cn";

import { Button } from "@/components/ui/button";

import type { QuoteCardPayload } from "../../card-payloads";
import { closedCardMeta, quoteStatusMeta } from "../../labels";
import { useQuotePricing } from "../../queries";
import { isPastValidity, quoteButtonsOf } from "../../selectors";
import type { ChatCard } from "../../types";
import { RequestChangesDialog } from "./quote-changes-dialog";
import { AcceptQuoteDialog } from "./quote-dialogs";
import { CARD_LINK, CardFrame, Fact, Facts, cardMoney } from "./card-frame";
import { useCardActionState } from "./use-card-action";

interface QuoteCardProps {
  conversationId: string;
  messageId: string;
  card: ChatCard;
  payload: QuoteCardPayload;
  /** The customer may act here (chat-conversations:UPDATE). */
  canAct: boolean;
}

const BUTTON_LABEL = { ACCEPT: "Chấp nhận", REQUEST_CHANGES: "Yêu cầu sửa" } as const;

/** QUOTE card (plan B.7.3): the buttons are exactly `customerActions`, off once `validUntil` passed. */
export function QuoteCard({ conversationId, messageId, card, payload, canAct }: QuoteCardProps) {
  const [dialog, setDialog] = useState<"ACCEPT" | "REQUEST_CHANGES" | null>(null);
  const action = useCardActionState(conversationId, messageId);
  const expired = isPastValidity(payload.validUntil);
  const status =
    closedCardMeta(card.state) ??
    (expired && payload.status === "SENT"
      ? quoteStatusMeta("EXPIRED")
      : quoteStatusMeta(payload.status));
  const buttons = canAct ? quoteButtonsOf(card, payload.validUntil) : [];
  const cartonLines = payload.lines.filter(
    (line) => line.cartons !== null && line.cartons !== undefined,
  );
  // The card has no MOQ / tiers / fees, nor whether each line may still be bought: read them from
  // the quote while ACCEPT is offered (WF-02 FE-1), and again when the acceptance dialog opens.
  const acceptOffered = buttons.some(
    ({ action: name, disabled }) => name === "ACCEPT" && !disabled,
  );
  const pricing = useQuotePricing(payload.quoteId, acceptOffered || dialog === "ACCEPT");
  const unsellable = hasUnsellableLine(pricing.data?.lines ?? []);
  const close = (open: boolean) => {
    if (!open) {
      setDialog(null);
      action.clear();
    }
  };

  return (
    <CardFrame
      eyebrow={`Báo giá${payload.revision ? ` · bản ${payload.revision}` : ""}`}
      title={payload.number}
      status={status}
      footer={
        <>
          {buttons.map(({ action: name, disabled }) => (
            <Button
              key={name}
              type="button"
              variant={name === "ACCEPT" ? "default" : "outline"}
              disabled={disabled || action.pending || (name === "ACCEPT" && unsellable)}
              className="min-h-11 rounded-[var(--r-md)] px-4"
              onClick={() => {
                if (name === "ACCEPT") void pricing.refetch();
                setDialog(name);
              }}
            >
              {BUTTON_LABEL[name]}
            </Button>
          ))}
          <Link href={STORE_ROUTES.account.quotes.detail(payload.quoteId)} className={CARD_LINK}>
            Xem chi tiết báo giá
          </Link>
        </>
      }
    >
      <Facts>
        {payload.validUntil ? (
          <Fact label="Hiệu lực đến" numeric>
            {formatDateTime(payload.validUntil)}
          </Fact>
        ) : null}
        {payload.requestedDeliveryDate ? (
          <Fact label="Ngày giao yêu cầu" numeric>
            {formatDate(payload.requestedDeliveryDate)}
          </Fact>
        ) : null}
      </Facts>
      <ul className="divide-border-default border-border-default divide-y rounded-[var(--r-md)] border">
        {payload.lines.map((line) => (
          <li
            key={line.id}
            data-refused={action.badLine === line.lineNo || undefined}
            className={cn("space-y-0.5 p-2.5", action.badLine === line.lineNo && "bg-danger/5")}
          >
            <p className="text-ink-primary font-medium">
              Dòng {line.lineNo} · <span className="font-mono">{line.sku}</span>
            </p>
            <p className="text-ink-secondary tabular-nums">
              {line.cartons ? `${formatNumber(line.cartons)} thùng = ` : ""}
              {line.units !== null && line.units !== undefined
                ? `${formatNumber(line.units)} cái`
                : ""}
              {line.unitPrice !== null && line.unitPrice !== undefined
                ? ` × ${cardMoney(line.unitPrice, payload.currency)}`
                : ""}
            </p>
            {line.acceptedCartons !== null && line.acceptedCartons !== undefined ? (
              <p className="text-positive tabular-nums">
                Bạn đã chấp nhận {formatNumber(line.acceptedCartons)} thùng
              </p>
            ) : null}
            <p className="text-ink-primary text-right font-semibold tabular-nums">
              {line.lineTotal !== null && line.lineTotal !== undefined
                ? cardMoney(line.lineTotal, payload.currency)
                : "Chưa có giá"}
            </p>
          </li>
        ))}
      </ul>
      <Facts>
        {payload.proposedTotal !== null && payload.proposedTotal !== undefined ? (
          <Fact label="Tổng đề xuất (có VAT)" numeric>
            {cardMoney(payload.proposedTotal, payload.currency)}
          </Fact>
        ) : null}
        {payload.acceptedTotal !== null && payload.acceptedTotal !== undefined ? (
          <Fact label="Tổng đã chấp nhận (có VAT)" numeric>
            {cardMoney(payload.acceptedTotal, payload.currency)}
          </Fact>
        ) : null}
      </Facts>
      {unsellable && acceptOffered ? (
        <p className="text-warning-ink">{UNSELLABLE_QUOTE_NOTICE}</p>
      ) : null}
      {expired && card.state === "OPEN" ? (
        <p className="text-ink-secondary">
          Báo giá đã quá thời hạn hiệu lực. Vui lòng nhắn Sale để được lập báo giá mới.
        </p>
      ) : null}
      {payload.convertedOrderId ? (
        // BE-17: the card payload carries `convertedOrder*` only once the order is past DRAFT (the
        // contract sent) and is redrawn when the contract is withdrawn, so an id here is a real page.
        <p className="text-ink-secondary">
          <Link
            href={STORE_ROUTES.account.orders.detail(payload.convertedOrderId)}
            className={CARD_LINK}
          >
            {quoteStatusMeta("CONVERTED").label}{" "}
            <span className="font-mono tabular-nums">{payload.convertedOrderNumber ?? ""}</span>
          </Link>
        </p>
      ) : null}
      {action.error && dialog === null ? (
        <p role="alert" className="text-danger">
          {action.error}
        </p>
      ) : null}
      <AcceptQuoteDialog
        open={dialog === "ACCEPT"}
        onOpenChange={close}
        lines={cartonLines}
        pending={action.pending}
        error={action.error}
        badLine={action.badLine}
        pricing={pricing.data}
        pricingFailed={pricing.isError}
        unsellable={unsellable}
        currency={payload.currency}
        onAccept={(cartons) =>
          action.submit({ action: "ACCEPT", version: payload.version, cartons }, () =>
            setDialog(null),
          )
        }
      />
      <RequestChangesDialog
        open={dialog === "REQUEST_CHANGES"}
        onOpenChange={close}
        pending={action.pending}
        error={action.error}
        onRequest={(note) =>
          action.submit({ action: "REQUEST_CHANGES", version: payload.version, note }, () =>
            setDialog(null),
          )
        }
      />
    </CardFrame>
  );
}
