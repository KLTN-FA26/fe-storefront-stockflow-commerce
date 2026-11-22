/**
 * The chat's socket events (BE `ChatBroadcaster`, `ChatEvent`, `ChatTopics`), folded into the React Query cache
 * precisely: a message is appended or replaced by id, a conversation or the badge is invalidated by its own key. Never
 * a reload of the whole thread. What the socket misses (it was down, a push failed: the BE's push is best effort)
 * the REST catch-up brings (`useMessageCatchUp`).
 */

import { useEffect, useRef } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { z } from "zod";

import { useRealtimeConnected, useRealtimeSubscription } from "@/lib/realtime";

import { chatKeys } from "./queries";
import { chatMessageDtoSchema, isCustomerVisible } from "./schemas";
import { replaceMessages, upsertMessages, type MessagePages } from "./selectors";
import type { ChatConversation } from "./types";

/** BE `ChatTopics`: what a customer may subscribe to (`ChatStompPolicy`). */
export const chatTopics = {
  conversation: (id: string) => `/topic/chat.conversations.${id}`,
  userQueue: "/user/queue/chat",
  presence: "/topic/chat.presence",
} as const;

/** BE `ChatEvent`: one envelope for every event, switched on `type`. */
const chatEventSchema = z.object({
  type: z.string(),
  conversationId: z.string().nullish(),
  data: z.unknown(),
  at: z.string().nullish(),
});

const presenceSchema = z.object({ userId: z.string(), online: z.boolean() });
const readMarkerSchema = z.object({ side: z.string().nullish() });

/** Refetch what is active, but join a fetch already running instead of cancelling it (one request, not two). */
const refresh = (client: QueryClient, queryKey: readonly unknown[]) =>
  void client.invalidateQueries({ queryKey }, { cancelRefetch: false });

/**
 * An event on the conversation's own topic (`/topic/chat.conversations.{id}`). Returns what it did, for tests.
 * A message is created → appended; updated (an edit, a deletion, a card that changed state or was superseded) →
 * replaced where it is, never added to a page it was not on.
 */
export function applyConversationEvent(client: QueryClient, raw: unknown): string {
  const event = chatEventSchema.safeParse(raw);
  if (!event.success) return "ignored";
  const { type, conversationId, data } = event.data;
  if (!conversationId) return "ignored";
  switch (type) {
    case "message.created":
    case "message.updated": {
      const message = chatMessageDtoSchema.safeParse(data);
      if (!message.success) {
        // A shape this client cannot read: let the REST catch-up bring it as the BE serves it.
        refresh(client, chatKeys.catchUp(conversationId));
        return "catch-up";
      }
      if (!isCustomerVisible(message.data)) return "ignored";
      client.setQueryData<MessagePages>(chatKeys.messages(conversationId), (pages) =>
        type === "message.created"
          ? upsertMessages(pages, [message.data])
          : replaceMessages(pages, [message.data]),
      );
      // Its header (`expectedResponseAt`, status) may follow a new message.
      if (type === "message.created") refresh(client, chatKeys.detail(conversationId));
      return type;
    }
    case "conversation.updated":
      refresh(client, chatKeys.detail(conversationId));
      refresh(client, chatKeys.lists());
      return type;
    case "message.read":
      // The customer read it in another tab or device (the BE sends read markers on the conversation's topic). This
      // tab's own marker is already counted: the mark-read call refreshed the badge.
      if (readMarkerSchema.safeParse(data).data?.side !== "CUSTOMER") return "ignored";
      if (isThreadOnScreen(client, conversationId)) return "ignored";
      refresh(client, chatKeys.unread());
      refresh(client, chatKeys.lists());
      return type;
    default:
      return "ignored"; // typing, Sales' read markers: nothing the customer is shown
  }
}

/** The thread is mounted in a visible tab: it marks what arrives as read, and that refreshes the badge. */
function isThreadOnScreen(client: QueryClient, conversationId: string): boolean {
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return false;
  const query = client
    .getQueryCache()
    .find({ queryKey: chatKeys.messages(conversationId), exact: true });
  return (query?.getObserversCount() ?? 0) > 0;
}

/**
 * An event on the customer's own queue (`/user/queue/chat`): every customer-visible message of every one of their
 * conversations, created or changed. Keeps the list fresh, and the badge when a new message is someone else's.
 */
export function applyUserQueueEvent(client: QueryClient, raw: unknown): string {
  const event = chatEventSchema.safeParse(raw);
  if (!event.success) return "ignored";
  const { type, data } = event.data;
  if (type === "message.created" || type === "message.updated") {
    refresh(client, chatKeys.lists());
    const message = chatMessageDtoSchema.safeParse(data);
    // What the customer wrote is not unread for them; in the thread on screen the read marker moves the badge.
    const own = message.success && message.data.senderType === "CUSTOMER";
    if (
      type === "message.created" &&
      !own &&
      !(event.data.conversationId && isThreadOnScreen(client, event.data.conversationId))
    ) {
      refresh(client, chatKeys.unread());
    }
    return type;
  }
  return "ignored";
}

/** A presence event: whether the Sale in charge of the conversation is online now. */
export function applyPresenceEvent(
  client: QueryClient,
  conversationId: string,
  agentId: string | null | undefined,
  raw: unknown,
): boolean {
  const event = chatEventSchema.safeParse(raw);
  if (!event.success || event.data.type !== "presence" || !agentId) return false;
  const presence = presenceSchema.safeParse(event.data.data);
  if (!presence.success || presence.data.userId !== agentId) return false;
  client.setQueryData<ChatConversation>(chatKeys.detail(conversationId), (conversation) =>
    conversation ? { ...conversation, agentOnline: presence.data.online } : conversation,
  );
  return true;
}

/**
 * Runs `onUp` each time the socket comes back up: what happened while it was down is fetched once over REST. With
 * `initial`, also on the first connection (the subscription starts after the first REST read; for a thread, a message
 * could fall in between).
 */
function useOnReconnect(onUp: () => void, initial: boolean) {
  const connected = useRealtimeConnected();
  const latest = useRef(onUp);
  const seen = useRef(false);
  useEffect(() => {
    latest.current = onUp;
  });
  useEffect(() => {
    if (!connected) return;
    if (seen.current || initial) latest.current();
    seen.current = true;
  }, [connected, initial]);
  return connected;
}

/** The open thread: its topic, and the presence of the Sale in charge. Returns whether the socket is up. */
export function useConversationLive(conversationId: string, agentId: string | null | undefined) {
  const client = useQueryClient();
  useRealtimeSubscription(chatTopics.conversation(conversationId), (raw) =>
    applyConversationEvent(client, raw),
  );
  useRealtimeSubscription(chatTopics.presence, (raw) =>
    applyPresenceEvent(client, conversationId, agentId, raw),
  );
  return useOnReconnect(() => {
    refresh(client, chatKeys.catchUp(conversationId));
    refresh(client, chatKeys.detail(conversationId));
  }, true);
}

/** The customer's own queue while `enabled` (signed in, may read the chat). Returns whether the socket is up. */
export function useChatUserQueueLive(enabled: boolean) {
  const client = useQueryClient();
  useRealtimeSubscription(enabled ? chatTopics.userQueue : null, (raw) =>
    applyUserQueueEvent(client, raw),
  );
  return useOnReconnect(() => {
    if (enabled) refresh(client, chatKeys.unread());
  }, false);
}
