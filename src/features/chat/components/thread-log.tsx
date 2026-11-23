"use client";

import type { ReactNode } from "react";
import { ArrowDown } from "lucide-react";

import { Button } from "@/components/ui/button";

import type { ChatMessage } from "../types";
import { MessageItem } from "./message-item";
import { useThreadScroll } from "./use-thread-scroll";

interface ThreadLogProps {
  conversationId: string;
  timeline: readonly ChatMessage[];
  canAct: boolean;
  onTakeBack?: ((messageId: string) => void) | undefined;
  /** CONTRACT card message id → when its signed copy was sent (`signedCopiesOf`). */
  signedCopies: Readonly<Record<string, string>>;
  /** "Xem tin nhắn cũ hơn", the loading skeleton or error, the empty state: above or instead of the messages. */
  before?: ReactNode;
  status?: ReactNode;
  after?: ReactNode;
}

/**
 * The messages (`role="log"`), scrolled to the newest only while the customer is at the end; otherwise a
 * "Tin nhắn mới ↓" pill takes them there (SF-UX-23).
 */
export function ThreadLog({
  conversationId,
  timeline,
  canAct,
  onTakeBack,
  signedCopies,
  before,
  status,
  after,
}: ThreadLogProps) {
  const last = timeline.at(-1);
  const { scroller, onScroll, unseen, toBottom } = useThreadScroll(
    last ? { seq: last.seq, mine: last.senderType === "CUSTOMER" } : null,
  );
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scroller}
        role="log"
        aria-label="Tin nhắn"
        onScroll={onScroll}
        className="bg-bg-subtle border-border-default min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain rounded-[var(--r-lg)] border p-[var(--card-pad)]"
      >
        {before}
        {status ??
          timeline.map((message) => (
            <MessageItem
              key={message.id}
              conversationId={conversationId}
              message={message}
              canAct={canAct}
              onTakeBack={onTakeBack}
              signedCopyAt={signedCopies[message.id]}
            />
          ))}
        {after}
      </div>
      {unseen > 0 ? (
        <Button
          type="button"
          variant="secondary"
          onClick={toBottom}
          className="border-border-default absolute bottom-3 left-1/2 min-h-11 -translate-x-1/2 rounded-full border px-4 shadow-[var(--sh-md)]"
        >
          Tin nhắn mới
          <ArrowDown aria-hidden className="size-4" />
        </Button>
      ) : null}
    </div>
  );
}
