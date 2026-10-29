import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useAuthStore } from "@/lib/auth/auth-store";

import { markAllMyNotificationsRead, markMyNotificationRead } from "./api";
import { inboxKeys } from "./queries";

function useMyInboxInvalidation() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.userId ?? null);
  return () => queryClient.invalidateQueries({ queryKey: inboxKeys.session(userId) });
}

export function useMarkRead() {
  const invalidate = useMyInboxInvalidation();
  return useMutation({ mutationFn: markMyNotificationRead, onSuccess: invalidate });
}

export function useMarkAllRead() {
  const invalidate = useMyInboxInvalidation();
  return useMutation({ mutationFn: markAllMyNotificationsRead, onSuccess: invalidate });
}
