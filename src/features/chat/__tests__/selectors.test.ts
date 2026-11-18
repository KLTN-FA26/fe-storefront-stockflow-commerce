import { describe, expect, it } from "vitest";

import {
  chatConversationDtoSchema,
  chatMessageDtoSchema,
  chatMessagePageDtoSchema,
} from "../schemas";
import {
  acceptsMessages,
  canTakeBack,
  newestSeqOf,
  quoteButtonsOf,
  timelineOf,
  upsertMessages,
  type MessagePages,
} from "../selectors";
import { cardMessageJson, conversationJson, messageJson, quotePayload } from "./fixtures";

const page = (items: unknown[]) => chatMessagePageDtoSchema.parse({ items, lastSeq: 0 });
const pages = (...list: ReturnType<typeof page>[]): MessagePages => ({
  pages: list,
  pageParams: list.map(() => null),
});

describe("quote buttons", () => {
  const card = (customerActions: string[]) =>
    chatMessageDtoSchema.parse(
      cardMessageJson("QUOTE", quotePayload(), { customerActions, staffActions: ["CREATE_QUOTE"] }),
    ).card!;

  it("are exactly the card's customerActions", () => {
    expect(quoteButtonsOf(card(["REQUEST_CHANGES"]), "2099-01-01T00:00:00Z")).toEqual([
      { action: "REQUEST_CHANGES", disabled: false },
    ]);
    expect(quoteButtonsOf(card([]), "2099-01-01T00:00:00Z")).toEqual([]);
  });

  it("are disabled once validUntil has passed, even while the payload says SENT", () => {
    const now = new Date("2026-11-18T00:00:00Z");
    expect(
      quoteButtonsOf(card(["ACCEPT", "REQUEST_CHANGES"]), "2026-11-17T00:00:00Z", now),
    ).toEqual([
      { action: "ACCEPT", disabled: true },
      { action: "REQUEST_CHANGES", disabled: true },
    ]);
  });
});

describe("the timeline", () => {
  it("orders by seq, drops duplicates across pages, and never holds an internal note", () => {
    const newer = page([messageJson({ id: "a", seq: 5 }), messageJson({ id: "b", seq: 4 })]);
    const older = page([messageJson({ id: "b", seq: 4 }), messageJson({ id: "c", seq: 2 })]);
    const data = pages(newer, older);
    // An internal note that reached the cache some other way is still not shown.
    data.pages[0]!.items.push({
      ...data.pages[0]!.items[0]!,
      id: "note",
      seq: 6,
      kind: "INTERNAL_NOTE",
      visibility: "STAFF",
    });
    expect(timelineOf(data).map((m) => m.id)).toEqual(["c", "b", "a"]);
  });

  it("upserts: replaces a held message in place and adds a new one to the newest page", () => {
    const data = pages(page([messageJson({ id: "a", seq: 1, body: "cũ" })]));
    const edited = chatMessageDtoSchema.parse(messageJson({ id: "a", seq: 1, body: "mới" }));
    const added = chatMessageDtoSchema.parse(messageJson({ id: "z", seq: 2 }));
    const next = upsertMessages(data, [edited, added]);
    expect(timelineOf(next).map((m) => [m.id, m.body])).toEqual([
      ["a", "mới"],
      ["z", added.body],
    ]);
    expect(newestSeqOf(next)).toBe(2);
  });
});

describe("conversation state", () => {
  const now = new Date("2026-11-18T00:00:00Z");
  const conversation = (overrides: Record<string, unknown>) =>
    chatConversationDtoSchema.parse(conversationJson(overrides));

  it("takes messages while open, or resolved within its reopen window", () => {
    expect(acceptsMessages(conversation({ status: "ACTIVE" }), now)).toBe(true);
    expect(
      acceptsMessages(
        conversation({ status: "RESOLVED", reopenUntil: "2026-11-20T00:00:00Z" }),
        now,
      ),
    ).toBe(true);
    expect(
      acceptsMessages(
        conversation({ status: "RESOLVED", reopenUntil: "2026-11-10T00:00:00Z" }),
        now,
      ),
    ).toBe(false);
    expect(
      acceptsMessages(conversation({ status: "CLOSED", reopenUntil: "2026-11-20T00:00:00Z" }), now),
    ).toBe(false);
  });

  it("lets the customer take back their own text within 5 minutes only", () => {
    const own = chatMessageDtoSchema.parse(
      messageJson({ senderType: "CUSTOMER", sentAt: "2026-11-17T23:57:00Z" }),
    );
    expect(canTakeBack(own, now)).toBe(true);
    expect(canTakeBack(own, new Date("2026-11-18T00:03:00Z"))).toBe(false);
    const agent = chatMessageDtoSchema.parse(messageJson({ sentAt: "2026-11-17T23:59:00Z" }));
    expect(canTakeBack(agent, now)).toBe(false);
  });
});
