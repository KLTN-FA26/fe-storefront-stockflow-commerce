import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { renderWithProviders } from "@/test/render";

import { ChatNewScreen } from "../components/chat-new-screen";
import { ChatThreadScreen } from "../components/chat-thread-screen";
import {
  CONVERSATION_ID,
  cardMessageJson,
  conversationJson,
  messageJson,
  quotePayload,
} from "./fixtures";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));

const PERMISSIONS = {
  roles: ["CUSTOMER"],
  permissions: [
    "chat-conversations:CREATE",
    "chat-conversations:READ",
    "chat-conversations:UPDATE",
  ],
  dataScope: "OWN",
};

beforeEach(() => replace.mockReset());
afterEach(() => vi.restoreAllMocks());

describe("TC-F13-01: opening a conversation about one of the customer's documents", () => {
  beforeEach(() => {
    vi.spyOn(api, "get").mockResolvedValue({ data: PERMISSIONS });
  });

  it("sends contextKind and contextId (C1) and goes to the conversation", async () => {
    const user = userEvent.setup();
    const post = vi
      .spyOn(api, "post")
      .mockResolvedValue({ data: conversationJson({ id: "c-new" }) });
    renderWithProviders(<ChatNewScreen kind="QUOTE" id="q-123" />);
    await user.type(screen.getByLabelText(/Bạn cần Sale hỗ trợ gì/), "Cho mình hỏi về báo giá");
    await user.click(screen.getByRole("button", { name: "Bắt đầu trò chuyện" }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0]?.[0]).toBe("/chat/me/conversations");
    expect(post.mock.calls[0]?.[1]).toMatchObject({
      contextKind: "QUOTE",
      contextId: "q-123",
      text: "Cho mình hỏi về báo giá",
    });
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/chat/c-new"));
  });

  it("sends no context for 'Chat với Sale' about nothing in particular", async () => {
    const user = userEvent.setup();
    const post = vi.spyOn(api, "post").mockResolvedValue({ data: conversationJson() });
    renderWithProviders(<ChatNewScreen />);
    await user.click(screen.getByRole("button", { name: "Bắt đầu trò chuyện" }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0]?.[1]).toEqual({});
  });

  it("shows CHAT_CONTEXT_NOT_FOUND as 'not yours / not visible yet' and offers chat without it", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "post").mockRejectedValue(
      new ApiError(404, "CHAT_CONTEXT_NOT_FOUND", "Không tìm thấy chứng từ."),
    );
    renderWithProviders(<ChatNewScreen kind="ORDER" id="someone-elses-order" />);
    await user.click(screen.getByRole("button", { name: "Bắt đầu trò chuyện" }));
    expect(
      await screen.findByText(/không tìm thấy chứng từ này trong tài khoản của bạn/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Chat với Sale không gắn chứng từ" })).toHaveAttribute(
      "href",
      "/chat/new",
    );
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("TC-F13-03: an internal note in the data is never rendered", () => {
  it("drops INTERNAL_NOTE / STAFF messages from the thread", async () => {
    const messages = {
      items: [
        messageJson({ seq: 3, body: "Sale trả lời khách" }),
        messageJson({
          seq: 2,
          kind: "INTERNAL_NOTE",
          visibility: "STAFF",
          body: "Ghi chú nội bộ: khách quen, đừng giảm giá",
        }),
        cardMessageJson("QUOTE", quotePayload(), { customerActions: ["ACCEPT"] }, { seq: 1 }),
      ],
      lastSeq: 3,
    };
    vi.spyOn(api, "get").mockImplementation(async (url: string) => {
      if (url === "/identity/me/permissions") return { data: PERMISSIONS };
      if (url.endsWith("/messages")) return { data: messages };
      return { data: conversationJson({ lastMessage: messages.items[1] }) };
    });
    vi.spyOn(api, "post").mockResolvedValue({
      data: { conversationId: CONVERSATION_ID, seq: 3 },
    });
    renderWithProviders(<ChatThreadScreen conversationId={CONVERSATION_ID} />);
    expect(await screen.findByText("Sale trả lời khách")).toBeInTheDocument();
    expect(screen.getByText("BG-20261118-0001")).toBeInTheDocument();
    expect(screen.queryByText(/Ghi chú nội bộ/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Internal note/i)).not.toBeInTheDocument();
  });
});

describe("the thread header's Sale line (audit item 12)", () => {
  const open = async (agentOnline: boolean) => {
    vi.spyOn(api, "get").mockImplementation(async (url: string) => {
      if (url === "/identity/me/permissions") return { data: PERMISSIONS };
      if (url.endsWith("/messages")) return { data: { items: [], lastSeq: 0 } };
      return {
        data: conversationJson({ agentOnline, expectedResponseAt: "2099-11-20T09:00:00Z" }),
      };
    });
    renderWithProviders(<ChatThreadScreen conversationId={CONVERSATION_ID} />);
    await screen.findByText(/Sale phụ trách: Nguyễn Minh \(Sale\)/);
  };

  it("Sale không trực tuyến: không ghi Ngoại tuyến, vẫn có giờ phản hồi dự kiến", async () => {
    await open(false);
    expect(screen.queryByText(/Ngoại tuyến/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Đang trực tuyến/)).not.toBeInTheDocument();
    expect(screen.getByText(/Sale dự kiến phản hồi/)).toBeInTheDocument();
  });

  it("says Đang trực tuyến only when the BE says the Sale is online", async () => {
    await open(true);
    expect(screen.getByText(/Đang trực tuyến/)).toBeInTheDocument();
  });
});
