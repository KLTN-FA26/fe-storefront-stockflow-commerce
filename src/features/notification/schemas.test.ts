import { describe, expect, it } from "vitest";

import { inboxPageDto } from "./schemas";

const notice = {
  id: "22222222-2222-4222-8222-222222222222",
  category: "INVENTORY_ALERT",
  severity: "INFO",
  title: "Tin mới",
  link: "/account/orders?status=CREATED",
  createdAt: "2026-10-14T07:00:00Z",
  read: false,
};

const page = {
  items: [notice],
  page: 0,
  size: 10,
  totalElements: 1,
  totalPages: 1,
  hasNext: false,
  hasPrevious: false,
  unreadCount: 1,
};

describe("BE #102 inbox contract", () => {
  it("accepts omitted nullable fields", () => {
    expect(inboxPageDto.parse(page)).toEqual(page);
  });
  it("accepts readAt and null optional body", () => {
    const read = { ...notice, read: true, readAt: "2026-10-15T00:00:00Z", body: null };
    expect(inboxPageDto.parse({ ...page, items: [read] }).items[0]?.readAt).toBe(read.readAt);
  });
  it.each([
    "https://outside.test",
    "//outside.test",
    "/\\outside.test",
    "javascript:alert(1)",
    "/\t/outside.test",
    "/admin/inventory/alerts?kind=EXPIRED",
    42,
  ])("drops unsafe link %s to null without rejecting the rest of the page", (link) => {
    const healthy = {
      ...notice,
      id: "88888888-8888-4888-8888-888888888888",
      link: "/account/orders",
    };
    const parsed = inboxPageDto.parse({ ...page, items: [{ ...notice, link }, healthy] });
    expect(parsed.items.map((item) => item.link)).toEqual([null, "/account/orders"]);
  });
  it("requires a supported severity and overall unreadCount", () => {
    expect(() =>
      inboxPageDto.parse({ ...page, items: [{ ...notice, severity: "HIGH" }] }),
    ).toThrow();
    expect(() => inboxPageDto.parse({ ...page, unreadCount: undefined })).toThrow();
  });
});
