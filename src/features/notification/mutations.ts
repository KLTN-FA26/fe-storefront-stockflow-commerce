import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useAuthStore } from "@/lib/auth/auth-store";

import { markAllMyNotificationsRead, markMyNotificationRead } from "./api";
import { inboxKeys } from "./queries";

function useMyInboxInvalidation() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.userId ?? null);
  return () => queryClient.invalidateQueries({ queryKey: inboxKeys.session(userId) });
}

// Settled, not only success: a 404 NOTIFICATION_NOT_FOUND (purged, or never this user's) or any other
// failure must refetch the inbox and badge so the stale row does not linger.
export function useMarkRead() {
  const invalidate = useMyInboxInvalidation();
  return useMutation({ mutationFn: markMyNotificationRead, onSettled: invalidate });
}

export function useMarkAllRead() {
  const invalidate = useMyInboxInvalidation();
  return useMutation({ mutationFn: markAllMyNotificationsRead, onSettled: invalidate });
}
