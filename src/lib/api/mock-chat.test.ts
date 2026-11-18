import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getAttachmentLink,
  getMessages,
  getMyConversation,
  getMyUnread,
  listMyConversations,
  sendAttachment,
} from "@/features/chat/api";

import { activateMockAdapter } from "./mock-adapter";
import { MOCK_CHAT_IDS } from "./mock-fixtures/chat-seed";

activateMockAdapter();

beforeEach(() => {
  // No random 500 from the mock adapter.
  vi.spyOn(Math, "random").mockReturnValue(0.5);
});
afterEach(() => vi.restoreAllMocks());

describe("chat mock routes through the API client", () => {
  it("answers the badge before treating 'unread-count' as a conversation id", async () => {
    const unread = await getMyUnread();
    expect(unread.messages).toBeGreaterThan(0);
  });

  it("lists, opens and pages the seeded conversation with the feature's own parsers", async () => {
    const list = await listMyConversations({ page: 1, size: 20 });
    expect(list.items.map((row) => row.id)).toContain(MOCK_CHAT_IDS.quoteThread);
    const detail = await getMyConversation(MOCK_CHAT_IDS.quoteThread);
    expect(detail.contexts.length).toBeGreaterThan(0);
    const page = await getMessages(MOCK_CHAT_IDS.quoteThread, { limit: 100 });
    expect(page.items.map((m) => m.card?.view.type).filter(Boolean)).toEqual([
      "TRANSFER",
      "CONTRACT",
      "QUOTE",
      "DESIGN_QUOTE_REQUEST",
    ]);
  });

  it("takes a file as multipart and hands back a download link", async () => {
    const file = new File(["%PDF-1.4"], "hop-dong-da-ky.pdf", { type: "application/pdf" });
    const message = await sendAttachment(MOCK_CHAT_IDS.quoteThread, {
      file,
      caption: "Hợp đồng đã ký",
      clientMessageId: "sf-test-1",
    });
    expect(message.kind).toBe("ATTACHMENT");
    expect(message.attachments[0]?.fileName).toBe("hop-dong-da-ky.pdf");
    const link = await getAttachmentLink(MOCK_CHAT_IDS.quoteThread, message.attachments[0]!.id);
    expect(link.url).toBeTruthy();
  });
});
