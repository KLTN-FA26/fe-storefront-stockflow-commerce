"use client";

import { ShortageChoicePanel } from "@/components/storefront/shortage-choice-panel";
import { shortageStatusMeta, shortageTitle } from "@/lib/domain/shortage";

import type { ShortageCardPayload } from "../../card-payloads";
import type { ChatCard } from "../../types";
import { CardFrame } from "./card-frame";
import { useCardActionState } from "./use-card-action";

interface ShortageChoiceCardProps {
  conversationId: string;
  messageId: string;
  card: ChatCard;
  payload: ShortageCardPayload;
  /** The customer may act here (chat-conversations:UPDATE). */
  canAct: boolean;
}

/**
 * SHORTAGE_CHOICE card (kltn-docs 17 §4.14, 16 §4.7): "Đơn thiếu N thùng" with the ways on; the customer's press
 * is the evidence of consent, once per card (`CHOOSE`, offered while the payload is SENT). Sales carry the choice
 * out on the order page, so the card only shows where it stands.
 */
export function ShortageChoiceCard({
  conversationId,
  messageId,
  card,
  payload,
  canAct,
}: ShortageChoiceCardProps) {
  const action = useCardActionState(conversationId, messageId);
  return (
    <CardFrame
      eyebrow="Thiếu thùng"
      title={shortageTitle(payload)}
      titleMono={false}
      status={shortageStatusMeta(payload.status)}
    >
      <ShortageChoicePanel
        card={payload}
        canChoose={canAct && card.customerActions.includes("CHOOSE")}
        pending={action.pending}
        error={action.error}
        onClearError={action.clear}
        onChoose={({ option, note }, onDone) =>
          action.submit(
            { action: "CHOOSE", option, version: payload.version, ...(note ? { note } : {}) },
            onDone,
          )
        }
      />
    </CardFrame>
  );
}
