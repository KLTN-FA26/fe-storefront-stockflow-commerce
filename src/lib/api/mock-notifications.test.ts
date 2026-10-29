import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NOTIFICATION_API } from "@/constants/notifications";

import { useAuthStore } from "@/lib/auth/auth-store";

import { signIn, signOut } from "@/test/render";

import { api } from "./client";
import { activateMockAdapter } from "./mock-adapter";
import { resetNotificationMockStore, seedNotificationMockStore } from "./mock-notifications";

import type { InboxPage, NotificationItem } from "@/features/notification/types";

activateMockAdapter();

const notice = (id: string, title: string): NotificationItem => ({
  id,
  title,
  category: "INVENTORY_ALERT",
  severity: "WARN",
  createdAt: "2026-10-25T08:00:00Z",
  read: false,
  link: "/account/orders",
});
const one = notice("11111111-1111-4111-8111-111111111111", "Thông báo A");
const two = notice("22222222-2222-4222-8222-222222222222", "Thông báo B");

function asUser(userId: string) {
  signIn();
  useAuthStore.setState((s) => ({ user: s.user ? { ...s.user, userId } : null }));
}

async function page(params: Record<string, unknown> = {}) {
  return (await api.get<InboxPage>(NOTIFICATION_API.inbox, { params })).data;
}

beforeEach(() => {
  resetNotificationMockStore();
  seedNotificationMockStore("A", [one]);
  seedNotificationMockStore("B", [two]);
  vi.spyOn(Math, "random").mockReturnValue(0.5);
});

afterEach(() => {
  signOut();
  vi.restoreAllMocks();
});

describe("customer mock inbox is isolated", () => {
  it("each user only lists their own messages; foreign id answers 404", async () => {
    asUser("A");
    expect((await page()).items.map((item) => item.id)).toEqual([one.id]);
    asUser("B");
    expect((await page({ recipientId: "A" })).items.map((item) => item.id)).toEqual([two.id]);
    await expect(api.post(NOTIFICATION_API.markRead(one.id))).rejects.toMatchObject({
      status: 404,
      code: "NOTIFICATION_NOT_FOUND",
    });
    asUser("A");
    expect((await page()).unreadCount).toBe(1);
  });

  it("mark-one is idempotent and read-all only affects the current user", async () => {
    asUser("A");
    expect((await api.post(NOTIFICATION_API.markRead(one.id))).status).toBe(204);
    expect((await api.post(NOTIFICATION_API.markRead(one.id))).status).toBe(204);
    expect((await page({ unreadOnly: true })).items).toEqual([]);
    expect((await api.post(NOTIFICATION_API.markAllRead)).data).toEqual({ updated: 0 });
    asUser("B");
    expect((await api.post(NOTIFICATION_API.markAllRead)).data).toEqual({ updated: 1 });
    asUser("A");
    expect((await api.get(NOTIFICATION_API.unreadCount)).data).toEqual({ unreadCount: 0 });
  });

  it("fresh customer inbox is empty, 201 size is rejected, anonymous user gets 401", async () => {
    asUser("C");
    expect(await page()).toMatchObject({ items: [], unreadCount: 0 });
    await expect(page({ size: 201 })).rejects.toMatchObject({ status: 400 });
    signOut();
    await expect(page()).rejects.toMatchObject({ status: 401 });
  });
});
