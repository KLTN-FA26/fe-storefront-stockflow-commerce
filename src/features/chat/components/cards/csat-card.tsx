"use client";

import type { CsatCardPayload } from "../../card-payloads";
import { closedCardMeta } from "../../labels";
import type { ChatCard } from "../../types";
import { CsatForm } from "../csat-form";
import { CardFrame } from "./card-frame";
import { useCardActionState } from "./use-card-action";

interface CsatCardProps {
  conversationId: string;
  messageId: string;
  card: ChatCard;
  payload: CsatCardPayload;
  canAct: boolean;
}

/** CSAT_SURVEY (plan B.7.6): RATE while the card offers it. */
export function CsatCard({ conversationId, messageId, card, payload, canAct }: CsatCardProps) {
  const action = useCardActionState(conversationId, messageId);
  const canRate = canAct && card.customerActions.includes("RATE");
  return (
    <CardFrame
      eyebrow="Khảo sát"
      title="Đánh giá cuộc trò chuyện"
      status={
        closedCardMeta(card.state) ??
        (payload.score
          ? { label: `${payload.score}/${payload.scale ?? 5} sao`, tone: "positive" }
          : null)
      }
    >
      {canRate ? (
        <>
          <p className="text-ink-secondary">Sale đã hỗ trợ bạn thế nào?</p>
          <CsatForm
            idPrefix={`csat-${messageId}`}
            pending={action.pending}
            error={action.error}
            onRate={(values) => action.submit({ action: "RATE", ...values })}
          />
        </>
      ) : (
        <p className="text-ink-secondary">
          {payload.score
            ? `Bạn đã đánh giá ${payload.score}/${payload.scale ?? 5} sao. Cảm ơn bạn!`
            : "Khảo sát đã đóng."}
        </p>
      )}
    </CardFrame>
  );
}
