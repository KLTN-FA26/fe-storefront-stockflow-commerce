/** BE SCRUM-147 inbox mock. Inboxes are keyed by the current authenticated user. */
import { NOTIFICATION_API } from "@/constants/notifications";

import { useAuthStore } from "@/lib/auth/auth-store";

import { registerMockRoute } from "./mock-adapter";

import type { AxiosRequestConfig } from "axios";
import type { NotificationItem } from "@/features/notification/types";

const entriesByUser = new Map<string, NotificationItem[]>();

export function resetNotificationMockStore() {
  entriesByUser.clear();
}

/** Tests may seed a known recipient. Default customer inbox stays empty until BE producers exist. */
export function seedNotificationMockStore(userId: string, entries: NotificationItem[]) {
  entriesByUser.set(
    userId,
    entries.map((item) => ({ ...item })),
  );
}

function getOwnEntries() {
  const state = useAuthStore.getState();
  if (!state.isAuthenticated || !state.tokens?.accessToken || !state.user) return null;
  return entriesByUser.get(state.user.userId) ?? [];
}

const response = (status: number, data: unknown) => ({ status, data, headers: {} });
const error = (status: number, code: string) =>
  response(status, { success: false, errorCode: code, message: code });
const unauthorized = () => error(401, "UNAUTHORIZED");

function paramsOf(config: AxiosRequestConfig): Record<string, unknown> {
  if (config.params instanceof URLSearchParams) return Object.fromEntries(config.params);
  if (typeof config.params === "object" && config.params !== null)
    return config.params as Record<string, unknown>;
  return Object.fromEntries(new URLSearchParams(config.url?.split("?")[1] ?? ""));
}

function pages(entries: NotificationItem[], page: number, size: number) {
  const totalElements = entries.length;
  const totalPages = Math.ceil(totalElements / size);
  return {
    items: entries.slice(page * size, (page + 1) * size),
    page,
    size,
    totalElements,
    totalPages,
    hasNext: page + 1 < totalPages,
    hasPrevious: page > 0,
  };
}

export function registerNotificationMockRoutes() {
  registerMockRoute("GET", NOTIFICATION_API.inbox, (config) => {
    const entries = getOwnEntries();
    if (!entries) return unauthorized();
    const params = paramsOf(config);
    const page = Number(params.page ?? 0);
    const size = Number(params.size ?? 20);
    const unreadOnly = params.unreadOnly ?? false;
    if (
      !Number.isSafeInteger(page) ||
      page < 0 ||
      !Number.isSafeInteger(size) ||
      size < 1 ||
      size > 200 ||
      ![true, false, "true", "false"].includes(unreadOnly as string | boolean)
    )
      return error(400, "UNSUPPORTED_PARAMETER");
    const filtered =
      unreadOnly === true || unreadOnly === "true" ? entries.filter((item) => !item.read) : entries;
    return response(200, {
      ...pages(
        filtered.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        page,
        size,
      ),
      unreadCount: entries.filter((item) => !item.read).length,
    });
  });

  registerMockRoute("GET", NOTIFICATION_API.unreadCount, () => {
    const entries = getOwnEntries();
    return entries
      ? response(200, { unreadCount: entries.filter((item) => !item.read).length })
      : unauthorized();
  });

  registerMockRoute("POST", NOTIFICATION_API.markAllRead, () => {
    const entries = getOwnEntries();
    if (!entries) return unauthorized();
    const updated = entries.filter((item) => !item.read).length;
    for (const item of entries)
      if (!item.read) {
        item.read = true;
        item.readAt = new Date().toISOString();
      }
    return response(200, { updated });
  });

  registerMockRoute("POST", "/notifications/me/:id/read", (config) => {
    const entries = getOwnEntries();
    if (!entries) return unauthorized();
    const id = (
      (config as AxiosRequestConfig & { _mockParams?: Record<string, string> })._mockParams ?? {}
    ).id;
    const item = entries.find((candidate) => candidate.id === id);
    if (!item) return error(404, "NOTIFICATION_NOT_FOUND");
    if (!item.read) {
      item.read = true;
      item.readAt = new Date().toISOString();
    }
    return response(204, null);
  });
}
