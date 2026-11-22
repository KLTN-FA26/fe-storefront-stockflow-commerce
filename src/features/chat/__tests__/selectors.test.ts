import { describe, expect, it } from "vitest";

import {
  chatConversationDtoSchema,
  chatMessageDtoSchema,
  chatMessagePageDtoSchema,
} from "../schemas";
import {
  acceptsMessages,
  canTakeBack,
  contextHref,
  newestSeqOf,
  quoteButtonsOf,
  replaceMessages,
  timelineOf,
  upsertMessages,
  type MessagePages,
} from "../selectors";
import { responseExpectationText } from "../components/response-expectation";
import { contractOrdersOf, shownContexts, signedCopiesOf } from "../thread-facts";
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

describe("context links (WF-02 audit item 6)", () => {
  it("a DRAFT quote or order is no link: the customer would get a 404", () => {
    expect(contextHref({ kind: "QUOTE", refId: "q-1", status: "DRAFT" })).toBeNull();
    expect(contextHref({ kind: "ORDER", refId: "o-1", status: "DRAFT" })).toBeNull();
  });
  it("a sent quote, or one whose status is unknown, opens its page", () => {
    expect(contextHref({ kind: "QUOTE", refId: "q-1", status: "SENT" })).toContain("q-1");
    expect(contextHref({ kind: "QUOTE", refId: "q-1" })).toContain("q-1");
    expect(contextHref({ kind: "DESIGN", refId: "d-1", status: "DRAFT" })).toContain("d-1");
  });
});

describe("SF-UX-26: contract and staff-only contexts", () => {
  it("a contract opens its order's contract section once the order is known", () => {
    expect(contextHref({ kind: "CONTRACT", refId: "c-1" }, "o-1")).toBe(
      "/account/orders/o-1#hop-dong",
    );
    expect(contextHref({ kind: "CONTRACT", refId: "c-1" })).toBeNull();
  });

  it("knows a contract's order from its card, or from the conversation's only order", () => {
    const card = chatMessageDtoSchema.parse(
      cardMessageJson("CONTRACT", {
        contractId: "c-1",
        number: "HD-1",
        orderId: "o-1",
        status: "SENT",
      }),
    );
    const contexts = [
      { id: "1", kind: "ORDER", refId: "o-2" },
      { id: "2", kind: "CONTRACT", refId: "c-2" },
    ];
    expect(contractOrdersOf([card], contexts)).toEqual({ "c-1": "o-1", "c-2": "o-2" });
    expect(contractOrdersOf([], [...contexts, { id: "3", kind: "ORDER", refId: "o-3" }])).toEqual(
      {},
    );
  });

  it("never shows a production order (an internal document)", () => {
    expect(
      shownContexts([
        { id: "1", kind: "PRODUCTION_ORDER", refId: "p" },
        { id: "2", kind: "QUOTE", refId: "q" },
      ]).map((context) => context.kind),
    ).toEqual(["QUOTE"]);
  });
});

describe("SF-UX-24: a signed copy sent after a SENT contract card", () => {
  const contract = (status: string, state = "OPEN") =>
    cardMessageJson(
      "CONTRACT",
      { contractId: "c-1", number: "HD-1", orderId: "o-1", status },
      { state },
      { id: "card", seq: 10 },
    );
  const file = (overrides: Record<string, unknown>) =>
    messageJson({
      kind: "ATTACHMENT",
      senderType: "CUSTOMER",
      attachments: [{ id: "f", fileName: "ky.pdf", contentType: "application/pdf" }],
      ...overrides,
    });
  const parse = (...items: unknown[]) => items.map((item) => chatMessageDtoSchema.parse(item));

  it("is the customer's latest PDF or image after the card", () => {
    const timeline = parse(
      file({ seq: 5, sentAt: "2026-11-20T01:00:00Z" }),
      contract("SENT"),
      file({ seq: 11, sentAt: "2026-11-20T02:00:00Z" }),
      file({
        seq: 12,
        sentAt: "2026-11-20T03:00:00Z",
        attachments: [{ id: "g", fileName: "a.png", contentType: "image/png" }],
      }),
    );
    expect(signedCopiesOf(timeline)).toEqual({ card: "2026-11-20T03:00:00Z" });
  });

  it("ignores files sent before the card, Sales' files, files taken back, and signed contracts", () => {
    expect(signedCopiesOf(parse(file({ seq: 5 }), contract("SENT")))).toEqual({});
    expect(signedCopiesOf(parse(contract("SENT"), file({ seq: 11, senderType: "AGENT" })))).toEqual(
      {},
    );
    expect(signedCopiesOf(parse(contract("SENT"), file({ seq: 11, deleted: true })))).toEqual({});
    expect(signedCopiesOf(parse(contract("SIGNED", "ACTED"), file({ seq: 11 })))).toEqual({});
  });
});

describe("message replacement (socket message.updated)", () => {
  it("replaces held messages only", () => {
    const data = pages(page([messageJson({ id: "a", seq: 1, body: "cũ" })]));
    const edited = chatMessageDtoSchema.parse(messageJson({ id: "a", seq: 1, body: "mới" }));
    const unknown = chatMessageDtoSchema.parse(messageJson({ id: "zz", seq: 0 }));
    expect(timelineOf(replaceMessages(data, [edited, unknown])).map((m) => m.body)).toEqual([
      "mới",
    ]);
    expect(replaceMessages(data, [unknown])).toBe(data);
  });
});

describe("SF-UX-27: what is promised about Sales' answer", () => {
  it("'within minutes' only when the BE says it is business hours", () => {
    expect(responseExpectationText({ withinBusinessHours: true })).toMatch(/trong ít phút/);
    expect(responseExpectationText({ withinBusinessHours: null })).toBeNull();
    expect(responseExpectationText({})).toBeNull();
    expect(responseExpectationText({ withinBusinessHours: false })).toMatch(/Ngoài giờ làm việc/);
  });
});
