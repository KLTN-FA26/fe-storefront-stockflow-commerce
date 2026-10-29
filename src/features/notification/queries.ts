import { useQuery, useQueryClient } from "@tanstack/react-query";

import { NOTIFICATION_CONFIG } from "@/constants/notifications";

import { useAuthStore } from "@/lib/auth/auth-store";

import { getMyUnreadCount, listMyNotifications } from "./api";

import type { InboxListParams } from "./types";

export const inboxKeys = {
  all: ["notifications", "me"] as const,
  session: (userId: string | null) => [...inboxKeys.all, userId] as const,
  list: (userId: string | null, params: InboxListParams) =>
    [...inboxKeys.session(userId), "list", params] as const,
  unreadCount: (userId: string | null) => [...inboxKeys.session(userId), "unread-count"] as const,
};

export function useMyInbox(params: InboxListParams) {
  const userId = useAuthStore((s) => s.user?.userId ?? null);
  const signedIn = useAuthStore((s) => s.isAuthenticated && !!s.tokens?.accessToken);
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: inboxKeys.list(userId, params),
    queryFn: async ({ signal }) => {
      const page = await listMyNotifications(params, signal);
      // The first list request supplies the badge count; poll the small count endpoint later.
      queryClient.setQueryData(inboxKeys.unreadCount(userId), page.unreadCount);
      return page;
    },
    enabled: signedIn && userId !== null,
    gcTime: 0,
    refetchOnWindowFocus: "always",
  });
}

export function useMyUnreadCount(inboxReady: boolean) {
  const userId = useAuthStore((s) => s.user?.userId ?? null);
  const signedIn = useAuthStore((s) => s.isAuthenticated && !!s.tokens?.accessToken);
  return useQuery({
    queryKey: inboxKeys.unreadCount(userId),
    queryFn: ({ signal }) => getMyUnreadCount(signal),
    enabled: signedIn && userId !== null && inboxReady,
    staleTime: NOTIFICATION_CONFIG.pollIntervalMs,
    refetchInterval: NOTIFICATION_CONFIG.pollIntervalMs,
    gcTime: 0,
  });
}
