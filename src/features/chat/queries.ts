import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { QUERY_TIMES } from "@/lib/api/query-client";
import { CHAT_QUERY_ROOT } from "@/lib/api/query-keys";
import { useRealtimeConnected } from "@/lib/realtime";

import {
  getAttachmentLink,
  getMessages,
  getMyConversation,
  getMyUnread,
  getQuotePricing,
  listMyConversations,
} from "./api";
import { newestSeqOf, upsertMessages, type MessagePages } from "./selectors";
import type { ChatListParams, ChatMessage } from "./types";

export const chatKeys = {
  all: CHAT_QUERY_ROOT,
  lists: () => [...chatKeys.all, "list"] as const,
  list: (params: ChatListParams) => [...chatKeys.lists(), params] as const,
  details: () => [...chatKeys.all, "detail"] as const,
  detail: (id: string) => [...chatKeys.details(), id] as const,
  messages: (id: string) => [...chatKeys.all, "messages", id] as const,
  catchUp: (id: string) => [...chatKeys.all, "catch-up", id] as const,
  unread: () => [...chatKeys.all, "unread"] as const,
  attachmentLink: (id: string, attachmentId: string) =>
    [...chatKeys.all, "attachment-link", id, attachmentId] as const,
  quotePricing: (quoteId: string) => [...chatKeys.all, "quote-pricing", quoteId] as const,
};

/**
 * How often the REST reads run. With the socket up (`NEXT_PUBLIC_WS_URL`, `features/chat/realtime.ts`) new messages,
 * changed cards, the conversation and the badge arrive as events, so every poll drops to one slow catch-up
 * (`fallbackMs`) for what a dropped push missed. Without it the catch-up stays at 5 s. Nothing polls in a background
 * tab (`refetchIntervalInBackground: false`), and the loaded message pages are never refetched on a timer: an
 * infinite query refetches EVERY page it holds (SF-UX-6), so the catch-up reads only the newest page.
 */
export const CHAT_POLL = {
  catchUpMs: 5_000,
  detailMs: 15_000,
  listMs: 30_000,
  unreadMs: 30_000,
  /** Every poll while the socket is up. */
  fallbackMs: 45_000,
} as const;

/** `ms` without a socket, the slow fallback with one. */
const pollEvery = (live: boolean, ms: number) => (live ? CHAT_POLL.fallbackMs : ms);

export const CHAT_PAGE_SIZE = 20;
export const MESSAGE_PAGE_SIZE = 30;

export function useMyConversations(params: ChatListParams, enabled = true) {
  const live = useRealtimeConnected();
  return useQuery({
    queryKey: chatKeys.list(params),
    queryFn: ({ signal }) => listMyConversations(params, signal),
    enabled,
    placeholderData: keepPreviousData,
    refetchInterval: pollEvery(live, CHAT_POLL.listMs),
    refetchIntervalInBackground: false,
    ...QUERY_TIMES.list,
  });
}

export function useConversation(id: string, live = false) {
  return useQuery({
    queryKey: chatKeys.detail(id),
    queryFn: ({ signal }) => getMyConversation(id, signal),
    refetchInterval: pollEvery(live, CHAT_POLL.detailMs),
    refetchIntervalInBackground: false,
    ...QUERY_TIMES.detail,
  });
}

/**
 * The thread, paged back by `before` (newest first on the wire). No `refetchInterval` and no refetch on focus: both
 * would reload every page scrolled back through. New and changed messages come from the socket and the catch-up.
 */
export function useConversationMessages(id: string, enabled = true) {
  return useInfiniteQuery({
    queryKey: chatKeys.messages(id),
    queryFn: ({ pageParam, signal }) =>
      getMessages(id, { before: pageParam ?? undefined, limit: MESSAGE_PAGE_SIZE }, signal),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    enabled,
    staleTime: CHAT_POLL.fallbackMs,
    refetchOnWindowFocus: false,
    gcTime: QUERY_TIMES.detail.gcTime,
  });
}

/** At most this many `since` pages per tick; a longer backlog continues on the next tick. */
const MAX_CATCH_UP_PAGES = 5;

const maxSeq = (messages: readonly ChatMessage[], floor: number) =>
  messages.reduce((newest, message) => Math.max(newest, message.seq), floor);

/**
 * One request per tick: the NEWEST page, folded into the thread. It brings what arrived (a message is added) and what
 * changed among the latest messages (an edit, a card that changed state or was superseded is replaced in place). Only
 * when more than a page arrived since the last tick does it page forward with `since` to fill the gap.
 *
 * Its data is the cursor: the newest seq read over REST. A message the socket put in the thread does not move it,
 * so a push that skipped messages (the socket was down) cannot make the catch-up skip them too.
 */
export function useMessageCatchUp(id: string, enabled: boolean, live = false) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: chatKeys.catchUp(id),
    queryFn: async ({ signal }) => {
      const key = chatKeys.messages(id);
      const held = queryClient.getQueryData<MessagePages>(key);
      const cursor = queryClient.getQueryData<number>(chatKeys.catchUp(id)) ?? newestSeqOf(held);
      const newest = await getMessages(id, { limit: MESSAGE_PAGE_SIZE }, signal);
      const fetched = [...newest.items];
      const oldestRead = fetched.reduce((low, message) => Math.min(low, message.seq), Infinity);
      if (fetched.length >= MESSAGE_PAGE_SIZE && oldestRead > cursor + 1) {
        let since = cursor;
        for (let round = 0; round < MAX_CATCH_UP_PAGES; round += 1) {
          const page = await getMessages(id, { since, limit: MESSAGE_PAGE_SIZE }, signal);
          fetched.push(...page.items);
          if (page.nextSince === null || page.nextSince === undefined) break;
          since = page.nextSince;
        }
      }
      const arrived = fetched.filter((message) => message.seq > newestSeqOf(held));
      queryClient.setQueryData<MessagePages>(key, (data) => upsertMessages(data, fetched));
      if (arrived.length > 0) {
        void queryClient.invalidateQueries(
          { queryKey: chatKeys.detail(id) },
          { cancelRefetch: false },
        );
        void queryClient.invalidateQueries(
          { queryKey: chatKeys.lists() },
          { cancelRefetch: false },
        );
        // Without the socket, a new card may have superseded one beyond the newest page.
        if (!live && arrived.some((message) => message.kind === "CARD")) {
          void queryClient.invalidateQueries({ queryKey: key });
        }
      }
      return maxSeq(fetched, cursor);
    },
    enabled,
    refetchInterval: pollEvery(live, CHAT_POLL.catchUpMs),
    refetchIntervalInBackground: false,
    staleTime: 0,
    gcTime: QUERY_TIMES.detail.gcTime,
  });
}

/**
 * C14, the badge: ONE query for every consumer (the header link, the floating button, anything else) — they share
 * the key, so React Query asks once however many are mounted (L-1). Its own queue on the socket keeps it fresh;
 * without one, it is polled lightly.
 */
export function useChatUnread(enabled: boolean, live = false) {
  return useQuery({
    queryKey: chatKeys.unread(),
    queryFn: ({ signal }) => getMyUnread(signal),
    enabled,
    refetchInterval: pollEvery(live, CHAT_POLL.unreadMs),
    refetchIntervalInBackground: false,
    staleTime: CHAT_POLL.unreadMs,
  });
}

/**
 * MOQ, tiers, tax rates and fees of a QUOTE card's quote, read while its acceptance dialog is open (WF-02 audit
 * item 4). Fresh on every opening: Sales may have sent a revision since.
 */
export function useQuotePricing(quoteId: string, enabled: boolean) {
  return useQuery({
    queryKey: chatKeys.quotePricing(quoteId),
    queryFn: ({ signal }) => getQuotePricing(quoteId, signal),
    enabled,
    staleTime: 0,
    retry: 1,
  });
}

/**
 * C7 link of an image attachment, fetched to draw its thumbnail. The link lives 10 minutes, so it is
 * reused for 8 and dropped from the cache before it can expire.
 */
export function useAttachmentLink(id: string, attachmentId: string, enabled = true) {
  return useQuery({
    queryKey: chatKeys.attachmentLink(id, attachmentId),
    queryFn: () => getAttachmentLink(id, attachmentId),
    enabled,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 8 * 60_000,
    gcTime: 9 * 60_000,
  });
}
