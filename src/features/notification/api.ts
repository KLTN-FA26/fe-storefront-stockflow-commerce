import { NOTIFICATION_API } from "@/constants/notifications";

import { api } from "@/lib/api/client";

import { inboxListParams, inboxPageDto, markAllReadDto, unreadCountDto } from "./schemas";

import type { InboxListParams, InboxPage } from "./types";

export async function listMyNotifications(
  params: InboxListParams,
  signal?: AbortSignal,
): Promise<InboxPage> {
  const { data } = await api.get<unknown>(NOTIFICATION_API.inbox, {
    params: inboxListParams.parse(params),
    ...(signal ? { signal } : {}),
  });
  return inboxPageDto.parse(data);
}

export async function getMyUnreadCount(signal?: AbortSignal): Promise<number> {
  const { data } = await api.get<unknown>(NOTIFICATION_API.unreadCount, signal ? { signal } : {});
  return unreadCountDto.parse(data).unreadCount;
}

export async function markMyNotificationRead(id: string): Promise<void> {
  await api.post(NOTIFICATION_API.markRead(id)); // BE: 204, idempotent, 404 if not mine.
}

export async function markAllMyNotificationsRead(): Promise<number> {
  const { data } = await api.post<unknown>(NOTIFICATION_API.markAllRead);
  return markAllReadDto.parse(data).updated;
}
