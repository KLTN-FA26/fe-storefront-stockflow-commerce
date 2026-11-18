import { describe, expect, it } from "vitest";

import { cardActionBody, contractDocumentPath } from "../api";
import {
  chatConversationDtoSchema,
  chatFileProblem,
  chatMessageDtoSchema,
  chatMessagePageDtoSchema,
  openConversationInputSchema,
} from "../schemas";
import {
  LINE_ID,
  cardMessageJson,
  conversationJson,
  designRequestPayload,
  messageJson,
  quotePayload,
} from "./fixtures";

describe("chat views parse what the BE omits (non_null)", () => {
  it("reads a conversation row with no subject, agent, contexts or lastMessage", () => {
    const parsed = chatConversationDtoSchema.parse({ id: "c1", status: "NEW" });
    expect(parsed.contexts).toEqual([]);
    expect(parsed.lastMessage).toBeNull();
    expect(parsed.subject).toBeUndefined();
  });

  it("reads a message without card, attachments, editedAt or sender", () => {
    const parsed = chatMessageDtoSchema.parse({
      id: "m1",
      seq: 1,
      kind: "SYSTEM",
      sentAt: "2026-11-18T03:00:00Z",
    });
    expect(parsed.attachments).toEqual([]);
    expect(parsed.card).toBeUndefined();
  });

  it("keeps an unknown status and an unknown card kind instead of failing the page", () => {
    const parsed = chatMessagePageDtoSchema.parse({
      items: [cardMessageJson("PRODUCTION_PROGRESS", { step: 2 })],
      lastSeq: 1,
    });
    expect(parsed.items[0]?.card?.view).toEqual({ type: "UNKNOWN" });
    expect(chatConversationDtoSchema.parse({ id: "c1", status: "SOMETHING_NEW" }).status).toBe(
      "SOMETHING_NEW",
    );
  });

  it("falls back to UNKNOWN for a known kind whose payload does not parse", () => {
    const message = chatMessageDtoSchema.parse(cardMessageJson("QUOTE", { number: 7 }));
    expect(message.card?.view.type).toBe("UNKNOWN");
  });

  it("never reads staffActions into the storefront's card", () => {
    const message = chatMessageDtoSchema.parse(
      cardMessageJson("QUOTE_REQUEST", designRequestPayload(), { staffActions: ["CREATE_QUOTE"] }),
    );
    expect(message.card).not.toHaveProperty("staffActions");
    expect(message.card?.customerActions).toEqual([]);
    expect(message.card?.view.type).toBe("DESIGN_QUOTE_REQUEST");
  });

  it("reads a project request (status, not requestStatus) and lines without customerSku", () => {
    const message = chatMessageDtoSchema.parse(
      cardMessageJson("QUOTE_REQUEST", {
        scope: "PROJECT",
        requestId: "r1",
        projectId: "p1",
        projectName: "Bộ ly mùa hè",
        status: "OPEN",
        lines: [
          { designId: "d1", designName: "Ly A", designStatus: "PENDING_REVIEW", cartons: 50 },
        ],
      }),
    );
    const view = message.card?.view;
    expect(view?.type).toBe("PROJECT_QUOTE_REQUEST");
    if (view?.type === "PROJECT_QUOTE_REQUEST") expect(view.payload.status).toBe("OPEN");
  });

  it("reads PAYMENT_REMINDER as a transfer card marked as a reminder", () => {
    const message = chatMessageDtoSchema.parse(
      cardMessageJson("PAYMENT_REMINDER", {
        installmentId: "i1",
        amount: 814770,
        transferContent: "HD-1 DOT1",
        bank: null,
        vietQr: null,
      }),
    );
    expect(message.card?.view).toMatchObject({ type: "TRANSFER", reminder: true });
  });
});

describe("internal notes never pass the boundary (16 BR-07)", () => {
  it("drops INTERNAL_NOTE and STAFF-visibility messages from a page", () => {
    const page = chatMessagePageDtoSchema.parse({
      items: [
        messageJson({ body: "Xin chào" }),
        messageJson({ kind: "INTERNAL_NOTE", visibility: "STAFF", body: "Ghi chú nội bộ" }),
        messageJson({ kind: "SYSTEM", visibility: "STAFF", body: "Dòng hệ thống nội bộ" }),
      ],
      lastSeq: 3,
    });
    expect(page.items.map((item) => item.body)).toEqual(["Xin chào"]);
  });

  it("drops an internal note given as a conversation's last message", () => {
    const parsed = chatConversationDtoSchema.parse(
      conversationJson({
        lastMessage: messageJson({ kind: "INTERNAL_NOTE", visibility: "STAFF" }),
      }),
    );
    expect(parsed.lastMessage).toBeNull();
  });
});

describe("request bodies", () => {
  it("ACCEPT sends {action, version, cartons: {<quote line id>: n}}", () => {
    expect(cardActionBody({ action: "ACCEPT", version: 3, cartons: { [LINE_ID]: 60 } })).toEqual({
      action: "ACCEPT",
      version: 3,
      cartons: { [LINE_ID]: 60 },
    });
  });

  it("REQUEST_CHANGES needs a note", () => {
    expect(() => cardActionBody({ action: "REQUEST_CHANGES", version: 3, note: "  " })).toThrow();
    expect(cardActionBody({ action: "REQUEST_CHANGES", version: 3, note: " Giảm giá " })).toEqual({
      action: "REQUEST_CHANGES",
      version: 3,
      note: "Giảm giá",
    });
  });

  it("a context is a kind and an id together, or neither (C1)", () => {
    expect(openConversationInputSchema.safeParse({ contextKind: "QUOTE" }).success).toBe(false);
    expect(openConversationInputSchema.safeParse({ contextId: "q1" }).success).toBe(false);
    expect(openConversationInputSchema.safeParse({}).success).toBe(true);
    expect(
      openConversationInputSchema.safeParse({ contextKind: "QUOTE", contextId: "q1" }).success,
    ).toBe(true);
  });

  it("checks a chat file before upload: JPEG/PNG/WebP/PDF up to 20 MB", () => {
    expect(chatFileProblem({ type: "application/pdf", size: 1024 })).toBeNull();
    expect(chatFileProblem({ type: "image/gif", size: 1024 })).toMatch(/JPEG, PNG, WebP/);
    expect(chatFileProblem({ type: "image/png", size: 21 * 1024 * 1024 })).toMatch(/20 MB/);
    expect(chatFileProblem({ type: "image/png", size: 0 })).toMatch(/rỗng/);
  });

  it("strips /api/v1 from a contract documentPath and refuses anything else", () => {
    expect(contractDocumentPath("/api/v1/orders/me/o1/contract/document", "o1")).toBe(
      "/orders/me/o1/contract/document",
    );
    expect(contractDocumentPath("https://evil.example/x", "o1")).toBe(
      "/orders/me/o1/contract/document",
    );
    expect(contractDocumentPath(null, "o 1")).toBe("/orders/me/o%201/contract/document");
  });
});

describe("quote payload", () => {
  it("parses the B.7.3 card with acceptedCartons omitted", () => {
    const message = chatMessageDtoSchema.parse(cardMessageJson("QUOTE", quotePayload()));
    const view = message.card?.view;
    expect(view?.type).toBe("QUOTE");
    if (view?.type === "QUOTE") expect(view.payload.lines[0]?.acceptedCartons).toBeUndefined();
  });
});
