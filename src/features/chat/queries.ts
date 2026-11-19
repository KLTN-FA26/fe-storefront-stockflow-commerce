import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { QUERY_TIMES } from "@/lib/api/query-client";

import {
  getMessages,
  getMyConversation,
  getMyUnread,
  getQuotePricing,
  listMyConversations,
} from "./api";
import { newestSeqOf, upsertMessages, type MessagePages } from "./selectors";
import type { ChatListParams, ChatMessage } from "./types";

export const chatKeys = {
  all: ["chat", "me"] as const,
  lists: () => [...chatKeys.all, "list"] as const,
  list: (params: ChatListParams) => [...chatKeys.lists(), params] as const,
  details: () => [...chatKeys.all, "detail"] as const,
  detail: (id: string) => [...chatKeys.details(), id] as const,
  messages: (id: string) => [...chatKeys.all, "messages", id] as const,
  catchUp: (id: string) => [...chatKeys.all, "catch-up", id] as const,
  unread: () => [...chatKeys.all, "unread"] as const,
  quotePricing: (quoteId: string) => [...chatKeys.all, "quote-pricing", quoteId] as const,
};

/**
 * Realtime is polling for now: the BE pushes over STOMP at `/ws` (plan B.5), which needs a client
 * library the storefront does not have yet. New messages are caught up with `since=<last seq>`
 * every 5 s (plan E1); card state changes (an edit, a quote superseded, a contract signed) arrive
 * with the slower refetch of the loaded pages — every 10 s: at 30 s a card the customer had just acted on, or
 * a contract Sales had just recorded as signed, looked stale for half a minute (WF-02 audit).
 */
export const CHAT_POLL = {
  catchUpMs: 5_000,
  pagesMs: 10_000,
  detailMs: 10_000,
  listMs: 30_000,
  unreadMs: 30_000,
} as const;

export const CHAT_PAGE_SIZE = 20;
export const MESSAGE_PAGE_SIZE = 30;

export function useMyConversations(params: ChatListParams, enabled = true) {
  return useQuery({
    queryKey: chatKeys.list(params),
    queryFn: ({ signal }) => listMyConversations(params, signal),
    enabled,
    placeholderData: keepPreviousData,
    refetchInterval: CHAT_POLL.listMs,
    ...QUERY_TIMES.list,
  });
}

export function useConversation(id: string) {
  return useQuery({
    queryKey: chatKeys.detail(id),
    queryFn: ({ signal }) => getMyConversation(id, signal),
    refetchInterval: CHAT_POLL.detailMs,
    ...QUERY_TIMES.detail,
  });
}

/** The thread, paged back by `before` (newest first on the wire). */
export function useConversationMessages(id: string, enabled = true) {
  return useInfiniteQuery({
    queryKey: chatKeys.messages(id),
    queryFn: ({ pageParam, signal }) =>
      getMessages(id, { before: pageParam ?? undefined, limit: MESSAGE_PAGE_SIZE }, signal),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    enabled,
    refetchInterval: CHAT_POLL.pagesMs,
    staleTime: CHAT_POLL.pagesMs,
    gcTime: QUERY_TIMES.detail.gcTime,
  });
}

/** At most this many `since` pages per tick; a longer backlog continues on the next tick. */
const MAX_CATCH_UP_PAGES = 5;

/**
 * Every 5 s, asks for what came after the newest message held and folds it into the thread. A new
 * card may have superseded an older one, so it also refreshes the loaded pages and the header.
 */
export function useMessageCatchUp(id: string, enabled: boolean) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: chatKeys.catchUp(id),
    queryFn: async ({ signal }) => {
      const key = chatKeys.messages(id);
      let since = newestSeqOf(queryClient.getQueryData<MessagePages>(key));
      const arrived: ChatMessage[] = [];
      for (let round = 0; round < MAX_CATCH_UP_PAGES; round += 1) {
        const page = await getMessages(id, { since, limit: MESSAGE_PAGE_SIZE }, signal);
        arrived.push(...page.items);
        if (page.nextSince === null || page.nextSince === undefined) break;
        since = page.nextSince;
      }
      if (arrived.length > 0) {
        queryClient.setQueryData<MessagePages>(key, (data) => upsertMessages(data, arrived));
        void queryClient.invalidateQueries({ queryKey: chatKeys.detail(id) });
        void queryClient.invalidateQueries({ queryKey: chatKeys.lists() });
        if (arrived.some((message) => message.kind === "CARD")) {
          void queryClient.invalidateQueries({ queryKey: key });
        }
      }
      return arrived.length;
    },
    enabled,
    refetchInterval: CHAT_POLL.catchUpMs,
    staleTime: 0,
    gcTime: 0,
  });
}

/** C14 for the header badge, polled lightly. */
export function useChatUnread(enabled: boolean) {
  return useQuery({
    queryKey: chatKeys.unread(),
    queryFn: ({ signal }) => getMyUnread(signal),
    enabled,
    refetchInterval: CHAT_POLL.unreadMs,
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
