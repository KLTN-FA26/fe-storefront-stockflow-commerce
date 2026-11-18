/**
 * The customer's chat endpoints, BE `CustomerChatController` + `CustomerChatActionsController`
 * (`/api/v1/chat/me/conversations`, plan Phụ lục B §B.2 C1–C14). The customer is resolved from the
 * sign-in: no customer id travels, and another customer's conversation answers 404.
 */

import { api } from "@/lib/api/client";

import {
  acceptQuoteInputSchema,
  chatConversationDtoSchema,
  chatConversationPageDtoSchema,
  chatDownloadLinkDtoSchema,
  chatMessageDtoSchema,
  chatMessagePageDtoSchema,
  chatReadMarkerDtoSchema,
  chatUnreadDtoSchema,
  openConversationInputSchema,
  rateInputSchema,
  requestChangesInputSchema,
  sendTextInputSchema,
  chatTextSchema,
} from "./schemas";
import type {
  CardActionBody,
  ChatConversation,
  ChatConversationPage,
  ChatDownloadLink,
  ChatListParams,
  ChatMessage,
  ChatMessagePage,
  ChatReadMarker,
  ChatUnread,
  OpenConversationInput,
  RateInput,
  SendAttachmentInput,
  SendTextInput,
} from "./types";

const BASE = "/chat/me/conversations";
const enc = encodeURIComponent;
const conversationPath = (id: string, tail = "") => `${BASE}/${enc(id)}${tail}`;
const withSignal = (signal?: AbortSignal) => (signal ? { signal } : {});
/** 20 MB on a slow line: more than the 15 s a JSON call gets. */
const UPLOAD_TIMEOUT_MS = 120_000;

/** C1: open a conversation (optionally about one of the customer's documents), or reuse one. */
export async function openConversation(input: OpenConversationInput): Promise<ChatConversation> {
  const body = openConversationInputSchema.parse(input);
  const { data } = await api.post<unknown>(BASE, body);
  return chatConversationDtoSchema.parse(data);
}

/** C2: the customer's conversations, closed ones included, the most recently active first. */
export async function listMyConversations(
  params: ChatListParams,
  signal?: AbortSignal,
): Promise<ChatConversationPage> {
  const { data } = await api.get<unknown>(BASE, {
    params: { page: Math.max(params.page, 1) - 1, size: params.size },
    ...withSignal(signal),
  });
  const page = chatConversationPageDtoSchema.parse(data);
  return { ...page, page: page.page + 1 };
}

/** C3: one conversation, with its labelled contexts. */
export async function getMyConversation(
  id: string,
  signal?: AbortSignal,
): Promise<ChatConversation> {
  const { data } = await api.get<unknown>(conversationPath(id), withSignal(signal));
  return chatConversationDtoSchema.parse(data);
}

export interface MessageCursor {
  /** Older than this seq, newest first. */
  before?: number | undefined;
  /** Newer than this seq, oldest first (the catch-up); wins over `before`. */
  since?: number | undefined;
  limit?: number | undefined;
}

/** C4: a page of messages by `seq`. Internal notes never come back (16 BR-07). */
export async function getMessages(
  id: string,
  cursor: MessageCursor,
  signal?: AbortSignal,
): Promise<ChatMessagePage> {
  const params: Record<string, number> = {};
  if (cursor.since !== undefined) params.since = cursor.since;
  else if (cursor.before !== undefined) params.before = cursor.before;
  if (cursor.limit !== undefined) params.limit = cursor.limit;
  const { data } = await api.get<unknown>(conversationPath(id, "/messages"), {
    params,
    ...withSignal(signal),
  });
  return chatMessagePageDtoSchema.parse(data);
}

/** C5: send a text; a retry with the same `clientMessageId` is the same message. */
export async function sendText(id: string, input: SendTextInput): Promise<ChatMessage> {
  const body = sendTextInputSchema.parse(input);
  const { data } = await api.post<unknown>(conversationPath(id, "/messages"), body);
  return chatMessageDtoSchema.parse(data);
}

/** C6: send one file (multipart `file`, `caption?`, `clientMessageId?`), plan B.8. */
export async function sendAttachment(id: string, input: SendAttachmentInput): Promise<ChatMessage> {
  const form = new FormData();
  form.append("file", input.file, input.file.name);
  const caption = input.caption?.trim();
  if (caption) form.append("caption", chatTextSchema.parse(caption));
  form.append("clientMessageId", input.clientMessageId);
  const { data } = await api.post<unknown>(conversationPath(id, "/attachments"), form, {
    // Without it the client's JSON default would make axios serialise the FormData to JSON.
    headers: { "Content-Type": "multipart/form-data" },
    timeout: UPLOAD_TIMEOUT_MS,
  });
  return chatMessageDtoSchema.parse(data);
}

/** C7: a 10-minute link to download a file of the conversation. */
export async function getAttachmentLink(
  id: string,
  attachmentId: string,
): Promise<ChatDownloadLink> {
  const { data } = await api.get<unknown>(
    conversationPath(id, `/attachments/${enc(attachmentId)}/link`),
  );
  return chatDownloadLinkDtoSchema.parse(data);
}

/** C8: mark read up to `seq` (the newest when omitted); the marker never moves back. */
export async function markRead(id: string, seq?: number): Promise<ChatReadMarker> {
  const { data } = await api.post<unknown>(
    conversationPath(id, "/read"),
    seq === undefined ? undefined : { seq },
  );
  return chatReadMarkerDtoSchema.parse(data);
}

/**
 * C9: come back to a conversation. The same one while open or within its reopen window, otherwise
 * a NEW conversation that continues it (`continuedFromId`) — the caller navigates to its id.
 */
export async function reopenConversation(id: string): Promise<ChatConversation> {
  const { data } = await api.post<unknown>(conversationPath(id, "/reopen"));
  return chatConversationDtoSchema.parse(data);
}

/** The body C10 expects for one action, validated before it leaves (ChatRequests.CardAction). */
export function cardActionBody(body: CardActionBody): Record<string, unknown> {
  switch (body.action) {
    case "ACCEPT": {
      const { version, cartons } = acceptQuoteInputSchema.parse(body);
      return { action: "ACCEPT", version, cartons };
    }
    case "REQUEST_CHANGES": {
      const { version, note } = requestChangesInputSchema.parse(body);
      return { action: "REQUEST_CHANGES", version, note };
    }
    case "RATE": {
      const { score, comment } = rateInputSchema.parse(body);
      return { action: "RATE", score, ...(comment ? { comment } : {}) };
    }
  }
}

/** C10: act on a card. The document's own refusals come back as they are (QUOTE_BELOW_MOQ…). */
export async function actOnCard(
  id: string,
  messageId: string,
  body: CardActionBody,
): Promise<ChatMessage> {
  const { data } = await api.post<unknown>(
    conversationPath(id, `/cards/${enc(messageId)}/actions`),
    cardActionBody(body),
  );
  return chatMessageDtoSchema.parse(data);
}

/** C11: rate a resolved conversation, once. */
export async function rateConversation(id: string, input: RateInput): Promise<ChatConversation> {
  const { score, comment } = rateInputSchema.parse(input);
  const { data } = await api.post<unknown>(conversationPath(id, "/csat"), {
    score,
    ...(comment ? { comment } : {}),
  });
  return chatConversationDtoSchema.parse(data);
}

/** C12: correct one's own text within 5 minutes of sending it. */
export async function editMessage(
  id: string,
  messageId: string,
  text: string,
): Promise<ChatMessage> {
  const { data } = await api.patch<unknown>(conversationPath(id, `/messages/${enc(messageId)}`), {
    text: chatTextSchema.parse(text),
  });
  return chatMessageDtoSchema.parse(data);
}

/** C13: take back one's own text or file within 5 minutes; it then shows as deleted. */
export async function deleteMessage(id: string, messageId: string): Promise<ChatMessage> {
  const { data } = await api.delete<unknown>(conversationPath(id, `/messages/${enc(messageId)}`));
  return chatMessageDtoSchema.parse(data);
}

/** C14: the badge — conversations and messages the customer has not read. */
export async function getMyUnread(signal?: AbortSignal): Promise<ChatUnread> {
  const { data } = await api.get<unknown>(`${BASE}/unread-count`, withSignal(signal));
  return chatUnreadDtoSchema.parse(data);
}

/**
 * The client path of a CONTRACT card's `documentPath` (`/api/v1/orders/me/{orderId}/contract/document`):
 * the client's base is `/api` and `next.config.ts` rewrites it to the BE's `/api/v1`, so the
 * `/api/v1` prefix goes. Anything that is not a same-origin BE path is ignored for the order's own
 * path: an absolute URL would bypass the base and carry the bearer token to another host.
 */
export function contractDocumentPath(documentPath: string | null | undefined, orderId: string) {
  const match = /^\/api\/v1(\/[A-Za-z0-9/_.-]+)$/.exec(documentPath ?? "");
  return match?.[1] && !match[1].includes("..")
    ? match[1]
    : `/orders/me/${enc(orderId)}/contract/document`;
}

/** GET the contract's file link (BE CustomerSalesContractController → `{url, expiresAt}`). */
export async function getContractDocumentLink(
  documentPath: string | null | undefined,
  orderId: string,
): Promise<ChatDownloadLink> {
  const { data } = await api.get<unknown>(contractDocumentPath(documentPath, orderId));
  return chatDownloadLinkDtoSchema.parse(data);
}
