import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { renderWithProviders } from "@/test/render";

import { ChatListScreen } from "../components/chat-list-screen";
import { conversationJson } from "./fixtures";

const PERMISSIONS = {
  roles: ["CUSTOMER"],
  permissions: ["chat-conversations:CREATE", "chat-conversations:READ"],
  dataScope: "OWN",
};
const EMPTY_PAGE = {
  items: [],
  page: 0,
  size: 20,
  totalElements: 0,
  totalPages: 0,
  hasNext: false,
  hasPrevious: false,
};

afterEach(() => vi.restoreAllMocks());

describe("ChatListScreen with no conversation yet (a phone shows only this list)", () => {
  it("offers 'Nhắn cho Sale' in words, in the empty state and at the head of the list", async () => {
    vi.spyOn(api, "get").mockImplementation(async (url: string) => ({
      data: url === "/identity/me/permissions" ? PERMISSIONS : EMPTY_PAGE,
    }));
    renderWithProviders(<ChatListScreen />);

    expect(await screen.findByText("Bạn chưa có cuộc trò chuyện nào")).toBeInTheDocument();
    const links = screen.getAllByRole("link", { name: "Nhắn cho Sale" });
    expect(links).toHaveLength(2);
    for (const link of links) expect(link).toHaveAttribute("href", "/chat/new");
  });

  it("lets a long conversation title run to two lines instead of cutting it at one (S04-5)", async () => {
    const title = "Xác nhận địa chỉ nhận hàng của đơn SO-20261124-000007 giao đợt 2";
    vi.spyOn(api, "get").mockImplementation(async (url: string) => ({
      data:
        url === "/identity/me/permissions"
          ? PERMISSIONS
          : {
              ...EMPTY_PAGE,
              items: [conversationJson({ subject: title })],
              totalElements: 1,
              totalPages: 1,
            },
    }));
    renderWithProviders(<ChatListScreen />);

    const heading = await screen.findByRole("heading", { name: title });
    expect(heading).toHaveClass("line-clamp-2");
    expect(heading).not.toHaveClass("truncate");
  });
});
