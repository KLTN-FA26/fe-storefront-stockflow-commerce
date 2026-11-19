"use client";

import type { ChatCard } from "../../types";
import { ContractCard } from "./contract-card";
import { CsatCard } from "./csat-card";
import { QuoteCard } from "./quote-card";
import { DesignQuoteRequestCard, ProjectQuoteRequestCard } from "./quote-request-card";
import { TransferCard } from "./transfer-card";

interface CardViewProps {
  conversationId: string;
  messageId: string;
  card: ChatCard;
  /** The card's fallback text (BE `body`), shown for a kind the storefront does not draw. */
  body: string | null | undefined;
  canAct: boolean;
}

/**
 * Draws a card from its kind, payload and state (plan B.7). Buttons come from `customerActions`
 * only: `staffActions` is not even parsed into the storefront's card.
 */
export function CardView({ conversationId, messageId, card, body, canAct }: CardViewProps) {
  const view = card.view;
  switch (view.type) {
    case "DESIGN_QUOTE_REQUEST":
      return <DesignQuoteRequestCard payload={view.payload} />;
    case "PROJECT_QUOTE_REQUEST":
      return <ProjectQuoteRequestCard payload={view.payload} />;
    case "QUOTE":
      return (
        <QuoteCard
          conversationId={conversationId}
          messageId={messageId}
          card={card}
          payload={view.payload}
          canAct={canAct}
        />
      );
    case "CONTRACT":
      return <ContractCard payload={view.payload} />;
    case "TRANSFER":
      return <TransferCard payload={view.payload} reminder={view.reminder} />;
    case "CSAT":
      return (
        <CsatCard
          conversationId={conversationId}
          messageId={messageId}
          card={card}
          payload={view.payload}
          canAct={canAct}
        />
      );
    case "UNKNOWN":
      return (
        <p className="border-border-default bg-bg-surface text-ink-primary max-w-md rounded-[var(--r-lg)] border p-[var(--card-pad)] text-sm">
          {body?.trim() || "Thông tin từ Sale"}
        </p>
      );
  }
}
