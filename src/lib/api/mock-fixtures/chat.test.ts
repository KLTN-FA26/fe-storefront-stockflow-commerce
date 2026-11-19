import { describe, expect, it } from "vitest";

import { MOCK_CHAT_IDS, MOCK_FOREIGN_CONTEXT_ID, MOCK_QUOTE_LINE_ID } from "./chat-seed";
import { createMockChatStore, type MockChatDeps } from "./chat";
import { MOCK_QUOTE_IDS } from "./wf02";

import type { MockResult } from "./orders";

const CUSTOMER = "c0ffee00-0000-4000-8000-000000000010";
const OWN_ORDER = "0b7d3c1e-0000-4000-8000-000000000001";

type Envelope = { success: boolean; data?: unknown; errorCode?: string; details?: unknown };
const body = (result: MockResult) => result.data as Envelope;
const data = <T>(result: MockResult) => body(result).data as T;

interface Row {
  id: string;
  status: string;
  unread: number;
  contexts: Array<{ kind: string; refId: string; label?: string }>;
  continuedFromId?: string;
}
interface Message {
  id: string;
  seq: number;
  kind: string;
  visibility: string;
  body?: string;
  card?: {
    kind: string;
    state: string;
    payload: Record<string, unknown>;
    customerActions: string[];
  };
}
interface Page {
  items: Message[];
  nextBefore?: number;
  nextSince?: number;
  lastSeq: number;
}

function store(overrides: Partial<MockChatDeps> = {}) {
  let now = new Date("2026-11-18T03:00:00Z");
  const chat = createMockChatStore({
    customerId: CUSTOMER,
    now: () => now,
    owns: (kind, id) =>
      (kind === "ORDER" && id === OWN_ORDER) || (kind === "QUOTE" && id === MOCK_QUOTE_IDS.sent),
    autoReplyMs: null,
    ...overrides,
  });
  return { chat, advance: (ms: number) => (now = new Date(now.getTime() + ms)) };
}

describe("C1 open (16 BR-02, reuse)", () => {
  it("refuses a document that is not the customer's with 404 CHAT_CONTEXT_NOT_FOUND", () => {
    const { chat } = store();
    const refused = chat.open({ contextKind: "ORDER", contextId: MOCK_FOREIGN_CONTEXT_ID });
    expect(refused.status).toBe(404);
    expect(body(refused).errorCode).toBe("CHAT_CONTEXT_NOT_FOUND");
    expect(chat.open({ contextKind: "ORDER", contextId: "not-mine" }).status).toBe(404);
  });

  it("needs a kind and an id together", () => {
    const { chat } = store();
    expect(body(chat.open({ contextKind: "ORDER" })).errorCode).toBe("VALIDATION_FAILED");
  });

  it("reuses the open conversation about the same document, and opens a new one otherwise", () => {
    const { chat } = store();
    const first = data<Row>(chat.open({ contextKind: "ORDER", contextId: OWN_ORDER }));
    const again = chat.open({ contextKind: "ORDER", contextId: OWN_ORDER, text: "Hỏi thêm" });
    expect(again.status).toBe(201);
    expect(data<Row>(again).id).toBe(first.id);
    expect(first.contexts).toEqual([expect.objectContaining({ kind: "ORDER", refId: OWN_ORDER })]);
    const other = data<Row>(chat.open({ contextKind: "QUOTE", contextId: MOCK_QUOTE_IDS.sent }));
    expect(other.id).not.toBe(first.id);
  });

  it("another customer's conversation answers 404", () => {
    const { chat } = store();
    expect(body(chat.get(MOCK_CHAT_IDS.foreignThread)).errorCode).toBe(
      "CHAT_CONVERSATION_NOT_FOUND",
    );
  });
});

describe("C4 messages (BR-07, seq paging)", () => {
  it("never answers the seeded internal note", () => {
    const { chat } = store();
    const page = data<Page>(chat.messages(MOCK_CHAT_IDS.quoteThread, { limit: 100 }));
    expect(page.items.some((m) => m.kind === "INTERNAL_NOTE" || m.visibility === "STAFF")).toBe(
      false,
    );
    expect(page.items.map((m) => m.card?.kind).filter(Boolean)).toEqual([
      "PAYMENT_INFO",
      "CONTRACT",
      "QUOTE",
      "QUOTE_REQUEST",
    ]);
  });

  it("pages back with before and catches up with since", () => {
    const { chat } = store();
    const newest = data<Page>(chat.messages(MOCK_CHAT_IDS.quoteThread, { limit: 3 }));
    expect(newest.items.map((m) => m.seq)).toEqual([9, 8, 7]);
    expect(newest.nextBefore).toBe(7);
    const older = data<Page>(
      chat.messages(MOCK_CHAT_IDS.quoteThread, { before: newest.nextBefore, limit: 3 }),
    );
    // seq 3 is the internal note: the customer's pages skip it.
    expect(older.items.map((m) => m.seq)).toEqual([6, 5, 4]);

    chat.send(MOCK_CHAT_IDS.quoteThread, { text: "Mình chuyển khoản rồi", clientMessageId: "a-1" });
    const caughtUp = data<Page>(chat.messages(MOCK_CHAT_IDS.quoteThread, { since: 9 }));
    expect(caughtUp.items.map((m) => [m.seq, m.body])).toEqual([[10, "Mình chuyển khoản rồi"]]);
    expect(caughtUp.lastSeq).toBe(10);
    expect(caughtUp.nextSince).toBeUndefined();
  });

  it("a retried send with the same clientMessageId is the same message", () => {
    const { chat } = store();
    const first = data<Message>(
      chat.send(MOCK_CHAT_IDS.quoteThread, { text: "A", clientMessageId: "x" }),
    );
    const retry = data<Message>(
      chat.send(MOCK_CHAT_IDS.quoteThread, { text: "A", clientMessageId: "x" }),
    );
    expect(retry.id).toBe(first.id);
    expect(
      body(chat.send(MOCK_CHAT_IDS.quoteThread, { text: "B", clientMessageId: "x" })).errorCode,
    ).toBe("CHAT_CLIENT_MESSAGE_ID_REUSED");
  });
});

describe("unread, read, ended, reopen", () => {
  it("counts unread per customer and clears them on read", () => {
    const { chat } = store();
    expect(data<{ conversations: number; messages: number }>(chat.unread())).toEqual({
      conversations: 2,
      messages: 4,
    });
    chat.read(MOCK_CHAT_IDS.quoteThread, {});
    expect(data<{ messages: number }>(chat.unread()).messages).toBe(1);
  });

  it("a closed conversation refuses messages and C9 continues it in a new one", () => {
    const { chat } = store();
    const refused = chat.send(MOCK_CHAT_IDS.closedThread, { text: "Còn đó không?" });
    expect(refused.status).toBe(409);
    expect(body(refused).errorCode).toBe("CHAT_CONVERSATION_ENDED");
    const next = data<Row>(chat.reopen(MOCK_CHAT_IDS.closedThread));
    expect(next.id).not.toBe(MOCK_CHAT_IDS.closedThread);
    expect(next.continuedFromId).toBe(MOCK_CHAT_IDS.closedThread);
  });

  it("a resolved conversation inside its window reopens when the customer writes", () => {
    const { chat } = store();
    expect(chat.send(MOCK_CHAT_IDS.resolvedThread, { text: "Hỏi thêm" }).status).toBe(201);
    expect(data<Row>(chat.get(MOCK_CHAT_IDS.resolvedThread)).status).toBe("REOPENED");
  });
});

describe("C10 card actions", () => {
  const quoteCard = (chat: ReturnType<typeof store>["chat"]) =>
    data<Page>(chat.messages(MOCK_CHAT_IDS.quoteThread, { limit: 100 })).items.find(
      (m) => m.card?.kind === "QUOTE",
    )!;

  it("offers ACCEPT / REQUEST_CHANGES on the SENT quote, and refuses a staff action", () => {
    const { chat } = store();
    const card = quoteCard(chat);
    expect(card.card?.customerActions).toEqual(["ACCEPT", "REQUEST_CHANGES"]);
    const staff = chat.act(MOCK_CHAT_IDS.quoteThread, card.id, { action: "CREATE_QUOTE" });
    expect(body(staff).errorCode).toBe("CHAT_CARD_ACTION_NOT_ALLOWED");
  });

  it("passes QUOTE_BELOW_MOQ through with details, then accepts", () => {
    const { chat } = store();
    const card = quoteCard(chat);
    const below = chat.act(MOCK_CHAT_IDS.quoteThread, card.id, {
      action: "accept",
      version: 3,
      cartons: { [MOCK_QUOTE_LINE_ID]: 10 },
    });
    expect(below.status).toBe(409);
    expect(body(below)).toMatchObject({
      errorCode: "QUOTE_BELOW_MOQ",
      details: { lineNo: 1, cartons: 10, moq: 20 },
    });
    const accepted = data<Message>(
      chat.act(MOCK_CHAT_IDS.quoteThread, card.id, {
        action: "ACCEPT",
        version: 3,
        cartons: { [MOCK_QUOTE_LINE_ID]: 60 },
      }),
    );
    expect(accepted.card).toMatchObject({ state: "ACTED", customerActions: [] });
    expect(accepted.card?.payload).toMatchObject({ status: "ACCEPTED", acceptedTotal: 76_140_000 });
  });

  it("refuses a stale version with OPTIMISTIC_LOCK", () => {
    const { chat } = store();
    const card = quoteCard(chat);
    const stale = chat.act(MOCK_CHAT_IDS.quoteThread, card.id, { action: "ACCEPT", version: 1 });
    expect(body(stale).errorCode).toBe("OPTIMISTIC_LOCK");
  });

  it("rates the resolved conversation through its CSAT card, once", () => {
    const { chat } = store();
    const survey = data<Page>(chat.messages(MOCK_CHAT_IDS.resolvedThread, {})).items.find(
      (m) => m.card?.kind === "CSAT_SURVEY",
    )!;
    const rated = data<Message>(
      chat.act(MOCK_CHAT_IDS.resolvedThread, survey.id, { action: "RATE", score: 5 }),
    );
    expect(rated.card).toMatchObject({ state: "ACTED", payload: { score: 5 } });
    expect(body(chat.rate(MOCK_CHAT_IDS.resolvedThread, { score: 4 })).errorCode).toBe(
      "CHAT_CSAT_ALREADY_GIVEN",
    );
  });
});

describe("document events (B.6 routing)", () => {
  it("posts a design quote request card once, then refreshes the same card", () => {
    const { chat } = store();
    const payload = {
      scope: "DESIGN",
      requestId: "r-1",
      designId: "d-1",
      designName: "Hộp giấy logo đỏ",
      designStatus: "PENDING_REVIEW",
      customerSku: null,
      requestStatus: "OPEN",
      cartons: 30,
    };
    chat.onEvent({ type: "DESIGN_QUOTE_REQUESTED", created: true, payload });
    chat.onEvent({
      type: "DESIGN_QUOTE_REQUESTED",
      created: false,
      payload: { ...payload, designStatus: "APPROVED", customerSku: "HOP-DO" },
    });
    const all = data<{ items: Row[] }>(chat.list({ size: 100 })).items;
    const cards = all.flatMap((row) =>
      data<Page>(chat.messages(row.id, { limit: 100 })).items.filter(
        (m) => m.card?.kind === "QUOTE_REQUEST" && m.card.payload.requestId === "r-1",
      ),
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]?.card?.payload).toMatchObject({
      designStatus: "APPROVED",
      customerSku: "HOP-DO",
    });
    // Quotable now: Sales get CREATE_QUOTE; the customer still has nothing.
    expect(cards[0]?.card?.customerActions).toEqual([]);
  });
});
