"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { toast } from "@/components/shared/Toast";
import { describeBeRefusal } from "@/lib/api/describe-error";
import { ApiError } from "@/lib/api/error";

import { CHAT_MESSAGE_BY_CODE } from "../../labels";
import { useCardAction } from "../../mutations";
import { chatKeys } from "../../queries";
import type { CardActionBody } from "../../types";

/** Refusals that mean the card on screen is out of date: say so and reload the thread. */
const STALE_CODES = new Set([
  "QUOTE_EXPIRED",
  "OPTIMISTIC_LOCK",
  "INVALID_QUOTE_TRANSITION",
  "CHAT_CARD_ACTION_NOT_ALLOWED",
  "SAMPLE_ROUND_ANSWERED",
  "PRODUCTION_ORDER_STATUS_INVALID",
]);

/**
 * C10 for one card: the refusal's text (the BE's Vietnamese `message`, plan §1.2) and, for
 * QUOTE_BELOW_MOQ, the line to highlight (`details.lineNo`). A stale card is refetched, never
 * re-sent (plan §1.4).
 */
export function useCardActionState(conversationId: string, messageId: string) {
  const client = useQueryClient();
  const mutation = useCardAction(conversationId);
  const [error, setError] = useState<string | null>(null);
  const [badLine, setBadLine] = useState<number | null>(null);

  const submit = (body: CardActionBody, onDone?: () => void) => {
    setError(null);
    setBadLine(null);
    mutation.mutate(
      { messageId, body },
      {
        onSuccess: () => onDone?.(),
        onError: (failure) => {
          setError(describeBeRefusal(failure, CHAT_MESSAGE_BY_CODE));
          if (failure instanceof ApiError && failure.code === "QUOTE_BELOW_MOQ") {
            const lineNo = Number(failure.details?.lineNo);
            setBadLine(Number.isInteger(lineNo) ? lineNo : null);
          }
          if (failure instanceof ApiError && STALE_CODES.has(failure.code)) {
            toast.info("Dữ liệu vừa thay đổi, đã tải lại.");
            void client.invalidateQueries({ queryKey: chatKeys.messages(conversationId) });
          }
        },
      },
    );
  };

  const clear = () => {
    setError(null);
    setBadLine(null);
  };

  return { submit, clear, pending: mutation.isPending, error, badLine };
}
