import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { ORDERS_QUERY_ROOT } from "@/lib/api/query-keys";

import {
  actOnCard,
  deleteMessage,
  markRead,
  openConversation,
  rateConversation,
  reopenConversation,
  sendAttachment,
  sendText,
} from "./api";
import { chatKeys } from "./queries";
import { upsertMessages, type MessagePages } from "./selectors";
import type {
  CardActionBody,
  ChatConversation,
  ChatMessage,
  RateInput,
  SendAttachmentInput,
  SendTextInput,
} from "./types";

/**
 * The quote module's cache root. A feature does not import another's keys (feature boundaries),
 * so the root is named here; accepting a quote on its card changes the quote pages too.
 */
const QUOTES_QUERY_ROOT = ["quotes"] as const;

function putMessage(client: QueryClient, conversationId: string, message: ChatMessage) {
  client.setQueryData<MessagePages>(chatKeys.messages(conversationId), (data) =>
    upsertMessages(data, [message]),
  );
}

/** A message changed the conversation: its status (ACTIVE, REOPENED), its row and the badge. */
function refreshAround(client: QueryClient, conversationId: string) {
  void client.invalidateQueries({ queryKey: chatKeys.detail(conversationId) });
  void client.invalidateQueries({ queryKey: chatKeys.lists() });
  void client.invalidateQueries({ queryKey: chatKeys.unread() });
}

/** C1 → the conversation is cached for the page the caller navigates to. */
export function useOpenConversation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: openConversation,
    onSuccess: (conversation) => {
      client.setQueryData(chatKeys.detail(conversation.id), conversation);
      void client.invalidateQueries({ queryKey: chatKeys.lists() });
    },
  });
}

/** C5. The caller keeps the `clientMessageId` of a failed send for its retry. */
export function useSendText(conversationId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: SendTextInput) => sendText(conversationId, input),
    onSuccess: (message) => {
      putMessage(client, conversationId, message);
      refreshAround(client, conversationId);
    },
  });
}

/** C6. */
export function useSendAttachment(conversationId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: SendAttachmentInput) => sendAttachment(conversationId, input),
    onSuccess: (message) => {
      putMessage(client, conversationId, message);
      refreshAround(client, conversationId);
    },
  });
}

/** C13: the message comes back deleted and replaces the one shown. */
export function useTakeBackMessage(conversationId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (messageId: string) => deleteMessage(conversationId, messageId),
    onSuccess: (message) => {
      putMessage(client, conversationId, message);
      void client.invalidateQueries({ queryKey: chatKeys.lists() });
    },
  });
}

/** C8: the badge and the list row lose their unread count. */
export function useMarkRead(conversationId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (seq: number) => markRead(conversationId, seq),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: chatKeys.unread() });
      void client.invalidateQueries({ queryKey: chatKeys.lists() });
    },
  });
}

/** C9: the answer may be a NEW conversation (`continuedFromId`); the caller navigates to its id. */
export function useReopenConversation(conversationId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => reopenConversation(conversationId),
    onSuccess: (conversation: ChatConversation) => {
      client.setQueryData(chatKeys.detail(conversation.id), conversation);
      if (conversation.id !== conversationId) {
        void client.invalidateQueries({ queryKey: chatKeys.detail(conversationId) });
      }
      void client.invalidateQueries({ queryKey: chatKeys.lists() });
    },
  });
}

/** C10: the card comes back with its new state; the document it acted on changed too. */
export function useCardAction(conversationId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ messageId, body }: { messageId: string; body: CardActionBody }) =>
      actOnCard(conversationId, messageId, body),
    onSuccess: (message, { body }) => {
      putMessage(client, conversationId, message);
      refreshAround(client, conversationId);
      if (body.action !== "RATE") {
        void client.invalidateQueries({ queryKey: QUOTES_QUERY_ROOT });
        void client.invalidateQueries({ queryKey: ORDERS_QUERY_ROOT });
      }
    },
  });
}

/** C11: the conversation comes back rated; its survey card turns ACTED on the next page refresh. */
export function useRateConversation(conversationId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: RateInput) => rateConversation(conversationId, input),
    onSuccess: (conversation) => {
      client.setQueryData(chatKeys.detail(conversationId), conversation);
      void client.invalidateQueries({ queryKey: chatKeys.messages(conversationId) });
    },
  });
}
