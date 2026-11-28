import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { chatKeys } from "../queries";
import { applyConversationEvent, applyPresenceEvent, applyUserQueueEvent } from "../realtime";
import { chatConversationDtoSchema, chatMessagePageDtoSchema } from "../schemas";
import { timelineOf, type MessagePages } from "../selectors";
import type { ChatConversation } from "../types";
import {
  CONVERSATION_ID,
  cardMessageJson,
  conversationJson,
  messageJson,
  quotePayload,
} from "./fixtures";

const AGENT_ID = "a0000000-0000-4000-8000-000000000001";

function clientWithThread(items: unknown[]) {
  const client = new QueryClient();
  const page = chatMessagePageDtoSchema.parse({ items, lastSeq: 0 });
  client.setQueryData<MessagePages>(chatKeys.messages(CONVERSATION_ID), {
    pages: [page],
    pageParams: [null],
  });
  return client;
}

const event = (type: string, data: unknown, conversationId: string | null = CONVERSATION_ID) => ({
  type,
  conversationId,
  data,
  at: "2026-11-23T03:00:00Z",
});

const thread = (client: QueryClient) =>
  timelineOf(client.getQueryData<MessagePages>(chatKeys.messages(CONVERSATION_ID)));

describe("conversation topic events (STOMP /topic/chat.conversations.{id})", () => {
  it("message.created appends the message to the thread, no refetch of the pages", () => {
    const client = clientWithThread([messageJson({ id: "a", seq: 1 })]);
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const created = messageJson({ id: "b", seq: 2, body: "Sale vừa trả lời" });
    expect(applyConversationEvent(client, event("message.created", created))).toBe(
      "message.created",
    );
    expect(thread(client).map((m) => m.id)).toEqual(["a", "b"]);
    expect(thread(client)[1]?.body).toBe("Sale vừa trả lời");
    const keys = invalidate.mock.calls.map((call) => call[0]?.queryKey);
    expect(keys).toContainEqual(chatKeys.detail(CONVERSATION_ID));
    expect(keys).not.toContainEqual(chatKeys.messages(CONVERSATION_ID));
  });

  it("message.updated replaces the card by id, in place", () => {
    const card = cardMessageJson("QUOTE", quotePayload(), { customerActions: ["ACCEPT"] });
    const client = clientWithThread([card, messageJson({ id: "after", seq: 99 })]);
    const updated = cardMessageJson(
      "QUOTE",
      quotePayload(),
      { state: "SUPERSEDED" },
      { id: card.id, seq: card.seq },
    );
    applyConversationEvent(client, event("message.updated", updated));
    const shown = thread(client);
    expect(shown).toHaveLength(2);
    expect(shown.find((m) => m.id === card.id)?.card?.state).toBe("SUPERSEDED");
  });

  it("message.updated of a message not loaded is not added to the newest page", () => {
    const client = clientWithThread([messageJson({ id: "a", seq: 50 })]);
    applyConversationEvent(client, event("message.updated", messageJson({ id: "old", seq: 3 })));
    expect(thread(client).map((m) => m.id)).toEqual(["a"]);
  });

  it("never puts an internal note in the thread (16 BR-07)", () => {
    const client = clientWithThread([]);
    applyConversationEvent(
      client,
      event(
        "message.created",
        messageJson({ id: "n", seq: 4, kind: "INTERNAL_NOTE", visibility: "STAFF" }),
      ),
    );
    expect(thread(client)).toEqual([]);
  });

  it("conversation.updated refreshes the header and the list", () => {
    const client = clientWithThread([]);
    const invalidate = vi.spyOn(client, "invalidateQueries");
    applyConversationEvent(client, event("conversation.updated", conversationJson()));
    const keys = invalidate.mock.calls.map((call) => call[0]?.queryKey);
    expect(keys).toEqual([chatKeys.detail(CONVERSATION_ID), chatKeys.lists()]);
  });

  it("a message this client cannot read falls back to the REST catch-up", () => {
    const client = clientWithThread([]);
    const invalidate = vi.spyOn(client, "invalidateQueries");
    expect(applyConversationEvent(client, event("message.created", { nope: true }))).toBe(
      "catch-up",
    );
    expect(invalidate.mock.calls[0]?.[0]?.queryKey).toEqual(chatKeys.catchUp(CONVERSATION_ID));
  });

  it("a read marker of the customer (another tab) refreshes the badge; Sale's does not", () => {
    const client = clientWithThread([]);
    const invalidate = vi.spyOn(client, "invalidateQueries");
    expect(applyConversationEvent(client, event("message.read", { side: "AGENT", seq: 4 }))).toBe(
      "ignored",
    );
    applyConversationEvent(client, event("message.read", { side: "CUSTOMER", seq: 4 }));
    expect(invalidate.mock.calls.map((call) => call[0]?.queryKey)).toEqual([
      chatKeys.unread(),
      chatKeys.lists(),
    ]);
  });

  it("ignores typing and junk", () => {
    const client = clientWithThread([]);
    expect(applyConversationEvent(client, event("typing", { typing: true }))).toBe("ignored");
    expect(applyConversationEvent(client, "junk")).toBe("ignored");
  });
});

describe("the customer's own queue (STOMP /user/queue/chat)", () => {
  const unreadRefreshes = (spy: { mock: { calls: unknown[][] } }) =>
    spy.mock.calls.filter(
      (call) =>
        JSON.stringify((call[0] as { queryKey: unknown }).queryKey) ===
        JSON.stringify(chatKeys.unread()),
    ).length;

  it("a message from Sale refreshes the badge and the list, joining a fetch already running", () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    applyUserQueueEvent(client, event("message.created", messageJson({ senderType: "AGENT" })));
    expect(unreadRefreshes(invalidate)).toBe(1);
    expect(invalidate.mock.calls[0]?.[1]).toEqual({ cancelRefetch: false });
  });

  it("the customer's own message does not move the badge", () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    applyUserQueueEvent(client, event("message.created", messageJson({ senderType: "CUSTOMER" })));
    expect(unreadRefreshes(invalidate)).toBe(0);
  });

  it("a changed card does not move the badge", () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    applyUserQueueEvent(client, event("message.updated", messageJson({ senderType: "SYSTEM" })));
    expect(unreadRefreshes(invalidate)).toBe(0);
  });
});

describe("presence (STOMP /topic/chat.presence)", () => {
  const withDetail = () => {
    const client = new QueryClient();
    client.setQueryData(
      chatKeys.detail(CONVERSATION_ID),
      chatConversationDtoSchema.parse(conversationJson({ agentOnline: false })),
    );
    return client;
  };
  const online = (client: QueryClient) =>
    client.getQueryData<ChatConversation>(chatKeys.detail(CONVERSATION_ID))?.agentOnline;

  it("marks the Sale in charge online or away", () => {
    const client = withDetail();
    applyPresenceEvent(
      client,
      CONVERSATION_ID,
      AGENT_ID,
      event("presence", { userId: AGENT_ID, online: true }, null),
    );
    expect(online(client)).toBe(true);
    applyPresenceEvent(
      client,
      CONVERSATION_ID,
      AGENT_ID,
      event("presence", { userId: AGENT_ID, online: false }, null),
    );
    expect(online(client)).toBe(false);
  });

  it("ignores another agent", () => {
    const client = withDetail();
    expect(
      applyPresenceEvent(
        client,
        CONVERSATION_ID,
        AGENT_ID,
        event("presence", { userId: "other", online: true }, null),
      ),
    ).toBe(false);
    expect(online(client)).toBe(false);
  });
});
