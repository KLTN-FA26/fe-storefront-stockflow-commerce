/**
 * Pure rules of the customer's chat: the message timeline built from paged reads, when the
 * conversation still takes messages, which quote buttons are live, and where a context links to.
 */

import type { InfiniteData } from "@tanstack/react-query";

import { STORE_ROUTES } from "@/constants";
import { CHAT_ATTACH_INTENTS, type ChatAttachIntent } from "@/constants/routes";

import { contextKindLabel } from "./labels";
import { isCustomerVisible } from "./schemas";
import type {
  ChatCard,
  ChatContext,
  ChatConversation,
  ChatMessage,
  ChatMessagePage,
} from "./types";

/** The thread as `useInfiniteQuery` holds it (page params are the `before` cursors). */
export type MessagePages = InfiniteData<ChatMessagePage, unknown>;

/**
 * The messages in reading order (oldest first), one per id, internal notes dropped again (16 BR-07:
 * no storefront code path may show one, whatever reached the cache).
 */
export function timelineOf(data: MessagePages | undefined): ChatMessage[] {
  if (!data) return [];
  const byId = new Map<string, ChatMessage>();
  for (const page of data.pages) {
    for (const message of page.items) {
      if (isCustomerVisible(message) && !byId.has(message.id)) byId.set(message.id, message);
    }
  }
  return [...byId.values()].sort((a, b) => a.seq - b.seq);
}

/** The newest seq read so far; 0 before any message. The cursor of the `since` catch-up. */
export function newestSeqOf(data: MessagePages | undefined): number {
  let newest = 0;
  for (const page of data?.pages ?? []) {
    for (const message of page.items) newest = Math.max(newest, message.seq);
  }
  return newest;
}

/**
 * Puts fresh copies of messages into the paged cache: a message already held is replaced where it
 * is (an edit, a deletion, a card that changed state), a new one joins the newest page.
 */
export function upsertMessages(
  data: MessagePages | undefined,
  items: readonly ChatMessage[],
): MessagePages | undefined {
  if (!data || data.pages.length === 0) return data;
  const fresh = items.filter(isCustomerVisible);
  if (fresh.length === 0) return data;
  const byId = new Map(fresh.map((message) => [message.id, message]));
  const pages = data.pages.map((page) => ({
    ...page,
    items: page.items.map((message) => {
      const update = byId.get(message.id);
      if (!update) return message;
      byId.delete(message.id);
      return update;
    }),
  }));
  const [first, ...rest] = pages;
  if (!first) return data;
  const added = [...byId.values()].sort((a, b) => b.seq - a.seq);
  return { ...data, pages: [{ ...first, items: [...added, ...first.items] }, ...rest] };
}

/**
 * Replaces messages already held (an edit, a deletion, a card that changed state) and ignores the rest: an update
 * of a message on a page not loaded must not join the newest page out of its place.
 */
export function replaceMessages(
  data: MessagePages | undefined,
  items: readonly ChatMessage[],
): MessagePages | undefined {
  if (!data) return data;
  const byId = new Map(items.filter(isCustomerVisible).map((message) => [message.id, message]));
  if (byId.size === 0) return data;
  let changed = false;
  const pages = data.pages.map((page) => ({
    ...page,
    items: page.items.map((message) => {
      const update = byId.get(message.id);
      if (!update) return message;
      changed = true;
      return update;
    }),
  }));
  return changed ? { ...data, pages } : data;
}

const ENDED = new Set(["RESOLVED", "AUTO_CLOSED", "CLOSED"]);

/** "Ended" (plan B.0.1): RESOLVED, AUTO_CLOSED or CLOSED. */
export const isEnded = (status: string) => ENDED.has(status);

/**
 * Whether a message can still be sent here. A RESOLVED / AUTO_CLOSED conversation reopens by
 * itself when the customer writes within `reopenUntil` (C5); CLOSED, or past the window, does not:
 * the customer must reopen it (C9).
 */
export function acceptsMessages(conversation: ChatConversation, now: Date = new Date()): boolean {
  if (conversation.status === "CLOSED") return false;
  if (!isEnded(conversation.status)) return true;
  return conversation.reopenUntil ? new Date(conversation.reopenUntil) > now : false;
}

/** A quote whose `validUntil` has passed: the payload may still say SENT until the expiry job runs. */
export function isPastValidity(validUntil: string | null | undefined, now: Date = new Date()) {
  return Boolean(validUntil) && new Date(validUntil as string) <= now;
}

export type QuoteAction = "ACCEPT" | "REQUEST_CHANGES";

/**
 * The quote buttons to draw: exactly the card's `customerActions` (never `staffActions`), each
 * disabled once the quote's validity has passed (plan D.8).
 */
export function quoteButtonsOf(
  card: ChatCard,
  validUntil: string | null | undefined,
  now: Date = new Date(),
): Array<{ action: QuoteAction; disabled: boolean }> {
  const expired = isPastValidity(validUntil, now);
  return card.customerActions
    .filter((action): action is QuoteAction => action === "ACCEPT" || action === "REQUEST_CHANGES")
    .map((action) => ({ action, disabled: expired }));
}

/** The order page's contract section (sf-orders' `id="hop-dong"` on the order detail page). */
export const ORDER_CONTRACT_ANCHOR = "hop-dong";

/**
 * Where a context of the conversation opens in the customer's own pages; null when nowhere. A DRAFT quote or order
 * is not the customer's to see yet (BE: a draft quote answers 404 to the customer; 17 §5.2 for orders), so its chip
 * is not a link — it used to open a 404 page (WF-02 audit, item 6). `status` comes with the conversation detail only.
 * A contract has no page of its own: it opens its order's contract section, when the thread knows the order
 * (`contractOrderId`, SF-UX-26).
 */
export function contextHref(
  context: Pick<ChatContext, "kind" | "refId"> & { status?: string | null | undefined },
  contractOrderId?: string | null,
): string | null {
  if ((context.kind === "QUOTE" || context.kind === "ORDER") && context.status === "DRAFT")
    return null;
  switch (context.kind) {
    case "DESIGN":
      return STORE_ROUTES.design.detail(context.refId);
    case "DESIGN_PROJECT":
      return STORE_ROUTES.design.project(context.refId);
    case "QUOTE":
      return STORE_ROUTES.account.quotes.detail(context.refId);
    case "ORDER":
      return STORE_ROUTES.account.orders.detail(context.refId);
    case "CONTRACT":
      return contractOrderId
        ? `${STORE_ROUTES.account.orders.detail(contractOrderId)}#${ORDER_CONTRACT_ANCHOR}`
        : null;
    default:
      return null;
  }
}

/** The conversation's name: its subject, else what it is about, else a plain "chat with Sales". */
export function conversationTitle(conversation: ChatConversation): string {
  const subject = conversation.subject?.trim();
  if (subject) return subject;
  const primary =
    conversation.contexts.find((context) => context.primary) ?? conversation.contexts[0];
  if (primary) {
    return primary.label
      ? `${contextKindLabel(primary.kind)} ${primary.label}`
      : `Trao đổi về ${contextKindLabel(primary.kind).toLowerCase()}`;
  }
  return "Trao đổi với Sale";
}

/** One line of preview for the list: text, file name, or the card's fallback text. */
export function messagePreview(message: ChatMessage | null | undefined): string {
  if (!message) return "Chưa có tin nhắn";
  if (message.deleted) return "Tin nhắn đã thu hồi";
  const author = message.senderType === "CUSTOMER" ? "Bạn: " : "";
  const body = message.body?.trim();
  if (body) return `${author}${body}`;
  const file = message.attachments[0]?.fileName;
  if (file) return `${author}Đã gửi file ${file}`;
  return message.kind === "CARD" ? "Đã gửi một thẻ" : "Tin nhắn mới";
}

/** A message the customer wrote and may still take back (C13: within 5 minutes, text or file). */
export function canTakeBack(message: ChatMessage, now: Date = new Date()): boolean {
  if (message.senderType !== "CUSTOMER" || message.deleted) return false;
  if (message.kind !== "TEXT" && message.kind !== "ATTACHMENT") return false;
  return now.getTime() - new Date(message.sentAt).getTime() < 5 * 60_000;
}

/** A client message id for C5/C6 (`^[A-Za-z0-9._:-]{1,64}$`), kept across retries of one send. */
export function newClientMessageId(): string {
  return `sf-${globalThis.crypto.randomUUID()}`;
}

/**
 * The `?attach=` a page sent with the customer, kept only for a contract's conversation: `pdf` asks for the signed
 * copy of the contract, which means nothing elsewhere. Anything else is dropped.
 */
export function signedCopyIntentOf(
  contextKind: string | null | undefined,
  attach: string | null | undefined,
): ChatAttachIntent | undefined {
  if (contextKind !== "CONTRACT") return undefined;
  return (CHAT_ATTACH_INTENTS as readonly string[]).includes(attach ?? "")
    ? (attach as ChatAttachIntent)
    : undefined;
}
