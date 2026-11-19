"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";

import { STORE_ROUTES } from "@/constants";
import { describeBeRefusal } from "@/lib/api/describe-error";

import { toast } from "@/components/shared/Toast";
import { Button } from "@/components/ui/button";

import { CHAT_MESSAGE_BY_CODE } from "../labels";
import { useRateConversation, useReopenConversation } from "../mutations";
import { CsatForm } from "./csat-form";

/**
 * An ended conversation (CLOSED, or past its reopen window): C9 continues it — the same one, or a
 * NEW conversation (`continuedFromId`) the page then moves to.
 */
export function ReopenOffer({
  conversationId,
  onReopened,
}: {
  conversationId: string;
  onReopened: () => void;
}) {
  const router = useRouter();
  const reopen = useReopenConversation(conversationId);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="border-border-default bg-bg-surface space-y-2 rounded-[var(--r-lg)] border p-[var(--card-pad)]">
      <p className="text-ink-primary text-sm font-medium">Cuộc trò chuyện đã kết thúc.</p>
      <p className="text-ink-secondary text-sm">
        Mở lại để nhắn tiếp cho Sale; lịch sử và chứng từ của bạn vẫn được giữ.
      </p>
      {error ? (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}
      <Button
        type="button"
        className="min-h-11 rounded-[var(--r-md)] px-4"
        disabled={reopen.isPending}
        onClick={() => {
          setError(null);
          reopen.mutate(undefined, {
            onSuccess: (conversation) => {
              onReopened();
              if (conversation.id !== conversationId) {
                router.replace(STORE_ROUTES.chat.detail(conversation.id));
              }
            },
            onError: (failure) => setError(describeBeRefusal(failure, CHAT_MESSAGE_BY_CODE)),
          });
        }}
      >
        <RotateCcw aria-hidden className="size-4" />
        {reopen.isPending ? "Đang mở lại..." : "Mở lại cuộc trò chuyện"}
      </Button>
    </div>
  );
}

/** C11 for a resolved conversation without a survey card on screen (`canRate`). */
export function CsatPanel({ conversationId }: { conversationId: string }) {
  const rate = useRateConversation(conversationId);
  const [error, setError] = useState<string | null>(null);
  return (
    <section
      aria-label="Đánh giá cuộc trò chuyện"
      className="border-border-default bg-bg-surface max-w-md space-y-2 rounded-[var(--r-lg)] border p-[var(--card-pad)]"
    >
      <h2 className="text-ink-primary font-semibold">Sale đã hỗ trợ bạn thế nào?</h2>
      <CsatForm
        idPrefix="csat-panel"
        pending={rate.isPending}
        error={error}
        onRate={(values) => {
          setError(null);
          rate.mutate(values, {
            onSuccess: () => toast.success("Cảm ơn bạn đã đánh giá!"),
            onError: (failure) => setError(describeBeRefusal(failure, CHAT_MESSAGE_BY_CODE)),
          });
        }}
      />
    </section>
  );
}
