"use client";

import { formatDateTime, formatTime, isToday } from "@/lib/format/date";

import { ChatBubble } from "@/components/storefront/chat-bubble";

import { canTakeBack } from "../selectors";
import type { ChatMessage } from "../types";
import { AttachmentList } from "./attachment-list";
import { CardView } from "./cards/card-view";

interface MessageItemProps {
  conversationId: string;
  message: ChatMessage;
  /** The customer may act (chat-conversations:UPDATE). */
  canAct: boolean;
  onTakeBack?: ((messageId: string) => void) | undefined;
  /** A CONTRACT card's signed copy, sent later in the thread. */
  signedCopyAt?: string | null | undefined;
}

const timeOf = (iso: string) => (isToday(iso) ? formatTime(iso) : formatDateTime(iso));

/**
 * One message of the thread. There is deliberately no branch for internal notes: they are dropped
 * before reaching here (schemas `isCustomerVisible`, 16 BR-07) and the storefront has no way to
 * draw one.
 */
export function MessageItem({
  conversationId,
  message,
  canAct,
  onTakeBack,
  signedCopyAt,
}: MessageItemProps) {
  const fromCustomer = message.senderType === "CUSTOMER";
  const side = fromCustomer ? "customer" : "agent";
  const author = message.senderType === "SYSTEM" ? "Hệ thống" : (message.senderName ?? "Sale");
  const time = timeOf(message.sentAt);

  if (message.deleted) {
    return (
      <ChatBubble side={side} author={fromCustomer ? undefined : author} timestamp={time} muted>
        Tin nhắn đã được thu hồi
      </ChatBubble>
    );
  }

  if (message.kind === "CARD" && message.card) {
    return (
      <div className="flex flex-col items-start gap-1">
        <p className="text-ink-tertiary text-xs tabular-nums">
          {author} · {time}
        </p>
        <CardView
          conversationId={conversationId}
          messageId={message.id}
          card={message.card}
          body={message.body}
          canAct={canAct}
          signedCopyAt={signedCopyAt}
        />
      </div>
    );
  }

  if (message.kind === "SYSTEM") {
    return (
      <p className="text-ink-tertiary text-center text-xs">
        {message.body} · <span className="tabular-nums">{time}</span>
      </p>
    );
  }

  const takeBack = canAct && onTakeBack && canTakeBack(message);
  return (
    <ChatBubble
      side={side}
      author={fromCustomer ? undefined : author}
      timestamp={message.editedAt ? `${time} · Đã chỉnh sửa` : time}
      footer={
        takeBack ? (
          <button
            type="button"
            onClick={() => onTakeBack(message.id)}
            className="focus-visible:ring-ink-inverse -mb-2 inline-flex min-h-11 items-center text-xs underline underline-offset-2 focus-visible:ring-2 focus-visible:outline-none"
          >
            Thu hồi
          </button>
        ) : undefined
      }
    >
      {message.body ? <span>{message.body}</span> : null}
      <AttachmentList conversationId={conversationId} attachments={message.attachments} />
    </ChatBubble>
  );
}
