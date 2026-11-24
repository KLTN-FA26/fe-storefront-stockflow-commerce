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

/** Bubbles from the same person within this long of each other read as one run. */
const RUN_GAP_MS = 5 * 60 * 1000;

const isBubble = (message: ChatMessage) =>
  message.kind !== "SYSTEM" && !(message.kind === "CARD" && message.card);

const sameRun = (a: ChatMessage | undefined, b: ChatMessage | undefined) =>
  !!a &&
  !!b &&
  isBubble(a) &&
  isBubble(b) &&
  a.senderType === b.senderType &&
  a.senderName === b.senderName &&
  Math.abs(Date.parse(b.sentAt) - Date.parse(a.sentAt)) <= RUN_GAP_MS;

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
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6"
      >
        <div className="space-y-3">{before}</div>
        {status ??
          timeline.map((message, index) => {
            const first = !sameRun(timeline[index - 1], message);
            const last = !sameRun(message, timeline[index + 1]);
            return (
              // A run's bubbles sit close together; a new run starts further down.
              <div key={message.id} className={index === 0 ? undefined : first ? "mt-4" : "mt-0.5"}>
                <MessageItem
                  conversationId={conversationId}
                  message={message}
                  canAct={canAct}
                  onTakeBack={onTakeBack}
                  signedCopyAt={signedCopies[message.id]}
                  first={first}
                  last={last}
                />
              </div>
            );
          })}
        {after ? <div className="mt-4">{after}</div> : null}
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
