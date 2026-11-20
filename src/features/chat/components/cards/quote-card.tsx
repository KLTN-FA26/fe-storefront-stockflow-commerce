"use client";

import { useState } from "react";
import Link from "next/link";

import { STORE_ROUTES } from "@/constants";
import { formatDate, formatDateTime } from "@/lib/format/date";
import { formatNumber } from "@/lib/format/number";
import { cn } from "@/lib/cn";

import { Button } from "@/components/ui/button";

import type { QuoteCardPayload } from "../../card-payloads";
import { closedCardMeta, quoteStatusMeta } from "../../labels";
import { useQuotePricing } from "../../queries";
import { isPastValidity, quoteButtonsOf } from "../../selectors";
import type { ChatCard } from "../../types";
import { AcceptQuoteDialog, RequestChangesDialog } from "./quote-dialogs";
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
  // The card has no MOQ / tiers / fees: read them from the quote while the acceptance dialog is open.
  const pricing = useQuotePricing(payload.quoteId, dialog === "ACCEPT");
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
              disabled={disabled || action.pending}
              className="min-h-11 rounded-[var(--r-md)] px-4"
              onClick={() => setDialog(name)}
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
          <Fact label="Tổng đề xuất (gồm phí, thuế)" numeric>
            {cardMoney(payload.proposedTotal, payload.currency)}
          </Fact>
        ) : null}
        {payload.acceptedTotal !== null && payload.acceptedTotal !== undefined ? (
          <Fact label="Tổng đã chấp nhận" numeric>
            {cardMoney(payload.acceptedTotal, payload.currency)}
          </Fact>
        ) : null}
      </Facts>
      {expired && card.state === "OPEN" ? (
        <p className="text-ink-secondary">
          Báo giá đã quá thời hạn hiệu lực. Vui lòng nhắn Sale để được lập báo giá mới.
        </p>
      ) : null}
      {payload.convertedOrderId ? (
        // Text only, until the BE hides a draft order from this card (audit item 22): the order is
        // still a draft when the card is drawn, and the customer's order page answers 404 for it.
        // The contract card links to the order once the contract is sent.
        <p className="text-ink-secondary">
          Đã lên đơn{" "}
          <span className="font-mono tabular-nums">{payload.convertedOrderNumber ?? ""}</span>. Sale
          sẽ gửi hợp đồng để ký trong cuộc trò chuyện này; xem đơn từ thẻ hợp đồng.
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
