import { useQuery, useQueryClient } from "@tanstack/react-query";

import { NOTIFICATION_CONFIG } from "@/constants/notifications";

import { useAuthStore } from "@/lib/auth/auth-store";
import { useHasSession } from "@/lib/auth/use-signed-in";

import { getMyUnreadCount, listMyNotifications } from "./api";

import type { InboxListParams } from "./types";

export const inboxKeys = {
  all: ["notifications", "me"] as const,
  session: (userId: string | null) => [...inboxKeys.all, userId] as const,
  list: (userId: string | null, params: InboxListParams) =>
    [...inboxKeys.session(userId), "list", params] as const,
  unreadCount: (userId: string | null) => [...inboxKeys.session(userId), "unread-count"] as const,
};

/**
 * Whose inbox may be read: a usable (unexpired) token AND a user id to scope the cache by. A token
 * without a user (state restored without a profile) has no owner — no request, no bell — rather
 * than an unkeyed inbox that could be shown to the next account.
 */
export function useInboxOwner(): string | null {
  const hasSession = useHasSession();
  const userId = useAuthStore((s) => s.user?.userId || null);
  return hasSession === true ? userId : null;
}

export function useMyInbox(params: InboxListParams) {
  const userId = useInboxOwner();
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: inboxKeys.list(userId, params),
    queryFn: async ({ signal }) => {
      const page = await listMyNotifications(params, signal);
      // The first list request supplies the badge count; poll the small count endpoint later.
      queryClient.setQueryData(inboxKeys.unreadCount(userId), page.unreadCount);
      return page;
    },
    enabled: userId !== null,
    gcTime: 0,
    refetchOnWindowFocus: "always",
  });
}

export function useMyUnreadCount(inboxReady: boolean) {
  const userId = useInboxOwner();
  return useQuery({
    queryKey: inboxKeys.unreadCount(userId),
    queryFn: ({ signal }) => getMyUnreadCount(signal),
    enabled: userId !== null && inboxReady,
    staleTime: NOTIFICATION_CONFIG.pollIntervalMs,
    refetchInterval: NOTIFICATION_CONFIG.pollIntervalMs,
    gcTime: 0,
  });
}
