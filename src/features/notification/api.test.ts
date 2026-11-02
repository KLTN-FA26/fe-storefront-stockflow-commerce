import { afterEach, describe, expect, it, vi } from "vitest";

import { NOTIFICATION_API } from "@/constants/notifications";

import { api } from "@/lib/api/client";

import {
  getMyUnreadCount,
  listMyNotifications,
  markAllMyNotificationsRead,
  markMyNotificationRead,
} from "./api";

const emptyPage = {
  items: [],
  page: 0,
  size: 10,
  totalElements: 0,
  totalPages: 0,
  hasNext: false,
  hasPrevious: false,
  unreadCount: 0,
};

afterEach(() => vi.restoreAllMocks());

describe("customer notification API boundary", () => {
  it("GET list includes 0-based paging and unreadOnly, with no recipient parameter", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: emptyPage });
    expect((await listMyNotifications({ unreadOnly: true, page: 0, size: 10 })).items).toEqual([]);
    expect(get.mock.calls[0]?.[0]).toBe(NOTIFICATION_API.inbox);
    expect(get.mock.calls[0]?.[1]?.params).toEqual({ unreadOnly: true, page: 0, size: 10 });
  });
  it("GET count parses only unreadCount", async () => {
    vi.spyOn(api, "get").mockResolvedValueOnce({ data: { unreadCount: 6 } });
    expect(await getMyUnreadCount()).toBe(6);
    vi.spyOn(api, "get").mockResolvedValueOnce({ data: { count: 6 } });
    await expect(getMyUnreadCount()).rejects.toThrow();
  });
  it("POST read is 204; read-all parses updated", async () => {
    const post = vi
      .spyOn(api, "post")
      .mockResolvedValueOnce({ status: 204 })
      .mockResolvedValueOnce({ data: { updated: 2 } });
    const id = "22222222-2222-4222-8222-222222222222";
    await markMyNotificationRead(id);
    expect(post.mock.calls[0]?.[0]).toBe(NOTIFICATION_API.markRead(id));
    expect(await markAllMyNotificationsRead()).toBe(2);
    expect(post.mock.calls[1]?.[0]).toBe(NOTIFICATION_API.markAllRead);
  });
  it("blocks invalid page size before fetching", async () => {
    const get = vi.spyOn(api, "get");
    await expect(listMyNotifications({ unreadOnly: false, page: -1, size: 201 })).rejects.toThrow();
    expect(get).not.toHaveBeenCalled();
  });
});
