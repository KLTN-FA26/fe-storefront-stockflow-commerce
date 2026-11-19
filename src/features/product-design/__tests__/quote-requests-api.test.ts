import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/error";
import { MOCK_DESIGN_IDS } from "@/lib/api/mock-fixtures/design-seed";
import { onMockChatEvent, type MockChatEvent } from "@/lib/api/mock-fixtures/wf02";
import { settle } from "@/test/fake-backend";

import {
  addDesignToProject,
  archiveProject,
  createProject,
  getDesign,
  getDesignDocument,
  getProject,
  listDesignQuoteRequests,
  listProjectQuoteRequests,
  requestDesignQuote,
  requestProjectQuote,
  requestReview,
  submitDesign,
} from "../api";
import { pngBytes } from "../engine/__tests__/fixtures";
import type { SubmissionFiles } from "../types";
import { designBackend, type DesignBackend } from "./design-backend";

// A customer's quote requests (plan WF-02 Phụ lục B area A) through the real client, the mock
// adapter and the design route table over a seeded store: the BE's paths, bodies, statuses (201 a
// new request, 200 the open one changed) and rules, and what the chat mock is told.

const { draft, pending, approved, approvedQuoteRequest } = MOCK_DESIGN_IDS;

/** 18:30 UTC on 18 Nov is already 19 Nov in Vietnam: "today" for the date rule is the 19th. */
// Several mock round trips (~0.2 s each) per test: room for a loaded parallel run.
vi.setConfig({ testTimeout: 15_000 });

const NOW = new Date("2026-11-18T18:30:00Z");

let backend: DesignBackend;
let events: MockChatEvent[];
let stopListening: () => void;
beforeEach(async () => {
  backend = await designBackend({ now: () => NOW });
  events = [];
  stopListening = onMockChatEvent((event) => events.push(event));
});
afterEach(() => {
  stopListening();
  vi.restoreAllMocks();
});

async function errorOf(request: Promise<unknown>) {
  const error = await request.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  return error as ApiError;
}

const bundle = (): SubmissionFiles => ({
  CUSTOMER_PREVIEW: { name: "preview.png", type: "image/png", bytes: pngBytes(1600, 900) },
  PRINT_READY: {
    name: "print-ready.pdf",
    type: "application/pdf",
    bytes: new TextEncoder().encode("%PDF print"),
  },
  TECHNICAL_SPEC: {
    name: "technical-spec.pdf",
    type: "application/pdf",
    bytes: new TextEncoder().encode("%PDF spec"),
  },
});

describe("a design's quote request (A-1, A-3)", () => {
  it("shows the seeded approved design's open request, with the customer's SKU", async () => {
    const [request, ...rest] = await listDesignQuoteRequests(approved);
    expect(rest).toEqual([]);
    expect(request).toMatchObject({
      id: approvedQuoteRequest,
      designId: approved,
      designStatus: "APPROVED",
      status: "OPEN",
      cartons: 120,
      customerSku: expect.stringMatching(/-KH0010-/),
    });
    // The BE leaves a null out: no `closedAt` while it is open.
    expect(request).not.toHaveProperty("closedAt");
  });

  it("opens a request with 201 on a newly approved design, and changes it with 200 when asked again", async () => {
    settle(await backend.store.simulateApprove(pending));
    const first = await requestDesignQuote(pending, { cartons: 50 });
    expect(first).toMatchObject({ created: true, request: { cartons: 50, status: "OPEN" } });
    expect(backend.post).toHaveBeenLastCalledWith(`/designs/${pending}/quote-requests`, {
      cartons: 50,
    });
    expect(first.request).not.toHaveProperty("desiredDeliveryDate");

    const again = await requestDesignQuote(pending, {
      cartons: 80,
      desiredDeliveryDate: "2026-11-19",
    });
    expect(again).toMatchObject({
      created: false,
      request: { id: first.request.id, cartons: 80, desiredDeliveryDate: "2026-11-19" },
    });
    // One open request per design: still one.
    expect(await listDesignQuoteRequests(pending)).toHaveLength(1);

    // The chat mock is told each time, with the card payload of §B.7.1.
    expect(events.map((e) => [e.type, "created" in e ? e.created : null])).toEqual([
      ["DESIGN_QUOTE_REQUESTED", true],
      ["DESIGN_QUOTE_REQUESTED", false],
    ]);
    expect(events[1]).toMatchObject({
      payload: {
        scope: "DESIGN",
        requestId: first.request.id,
        designId: pending,
        designStatus: "APPROVED",
        customerSku: expect.any(String),
        returnReason: null,
        cartons: 80,
        desiredDeliveryDate: "2026-11-19",
        requestStatus: "OPEN",
        requestedAt: expect.any(String),
      },
    });
  });

  it("refuses a design that is not approved with 409 DESIGN_NOT_APPROVED, and tells nobody", async () => {
    const error = await errorOf(requestDesignQuote(draft, { cartons: 10 }));
    expect(error).toMatchObject({ status: 409, code: "DESIGN_NOT_APPROVED" });
    expect(error.message).toContain("Gửi duyệt và yêu cầu báo giá");
    expect(events).toEqual([]);
  });

  it("refuses cartons out of 1–1,000,000 and a date before today in Vietnam on their fields", async () => {
    const none = await errorOf(requestDesignQuote(approved, { cartons: 0 }));
    expect(none).toMatchObject({ status: 400, code: "VALIDATION_FAILED" });
    expect(none.fieldErrors).toEqual({ cartons: expect.any(String) });

    const many = await errorOf(requestDesignQuote(approved, { cartons: 1_000_001 }));
    expect(many.fieldErrorDetails).toEqual([
      expect.objectContaining({ field: "cartons", code: "Max" }),
    ]);

    // The 18th is today in UTC, yesterday in Vietnam.
    const past = await errorOf(
      requestDesignQuote(approved, { cartons: 10, desiredDeliveryDate: "2026-11-18" }),
    );
    expect(past.fieldErrorDetails).toEqual([
      expect.objectContaining({ field: "desiredDeliveryDate", code: "FutureOrPresent" }),
    ]);
    // Nothing changed.
    expect((await listDesignQuoteRequests(approved))[0]).toMatchObject({ cartons: 120 });
  });

  it("answers 404 for a design the customer does not have", async () => {
    const error = await errorOf(
      requestDesignQuote("7d51f000-0000-4000-8000-0000000000ff", { cartons: 1 }),
    );
    expect(error).toMatchObject({ status: 404, code: "NOT_FOUND" });
  });
});

describe("submitting with a quote request (A-2)", () => {
  it("sends `quoteRequest` with the request for review; the request is read back with A-3", async () => {
    const { checksum } = await getDesignDocument(draft);
    const submitted = await submitDesign(draft, {
      documentChecksum: checksum,
      files: bundle(),
      runNonce: "run-1",
      quoteRequest: { cartons: 30, desiredDeliveryDate: "2026-12-01" },
    });
    expect(submitted.status).toBe("PENDING_REVIEW");
    expect(backend.post.mock.calls.at(-1)).toEqual([
      `/designs/${draft}/technical-review-requests`,
      { version: 5, quoteRequest: { cartons: 30, desiredDeliveryDate: "2026-12-01" } },
    ]);
    const [request] = await listDesignQuoteRequests(draft);
    expect(request).toMatchObject({ designStatus: "PENDING_REVIEW", cartons: 30, status: "OPEN" });
    // No customer SKU before approval.
    expect(request).not.toHaveProperty("customerSku");
    expect(events).toEqual([
      expect.objectContaining({ type: "DESIGN_QUOTE_REQUESTED", created: true }),
    ]);
  });

  it("refuses the whole submission when the request is wrong, naming `quoteRequest.*`", async () => {
    const { version } = await getDesign(draft);
    const error = await errorOf(
      requestReview(draft, version, { cartons: 5, desiredDeliveryDate: "2026-01-01" }),
    );
    expect(error).toMatchObject({ status: 400, code: "VALIDATION_FAILED" });
    expect(error.fieldErrors).toEqual({ "quoteRequest.desiredDeliveryDate": expect.any(String) });
    expect((await getDesign(draft)).status).toBe("DRAFT");
    expect(await listDesignQuoteRequests(draft)).toEqual([]);
  });

  it("keeps the request open on a returned design, and a resubmission changes that same request (B40)", async () => {
    const { checksum } = await getDesignDocument(draft);
    const send = (cartons: number, runNonce: string) =>
      submitDesign(draft, {
        documentChecksum: checksum,
        files: bundle(),
        runNonce,
        quoteRequest: { cartons },
      });
    await send(30, "run-1");
    settle(await backend.store.simulateReturn(draft, { reason: "Chữ quá sát mép." }));

    const [returned] = await listDesignQuoteRequests(draft);
    expect(returned).toMatchObject({
      designStatus: "DRAFT",
      status: "OPEN",
      returnReason: "Chữ quá sát mép.",
    });

    await send(45, "run-2");
    const after = await listDesignQuoteRequests(draft);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({
      id: returned!.id,
      cartons: 45,
      designStatus: "PENDING_REVIEW",
    });
  });

  it("a plain submission sends no `quoteRequest`", async () => {
    const { version } = await getDesign(draft);
    await requestReview(draft, version).catch(() => undefined);
    expect(backend.post.mock.calls.at(-1)?.[1]).toEqual({ version });
  });
});

describe("a project's quote request (A-6, A-7)", () => {
  /** A project holding the approved design and a draft. */
  async function project() {
    const made = await createProject({ name: "Bộ ly quán Nhà Mình" });
    await addDesignToProject(made.id, approved);
    await addDesignToProject(made.id, draft);
    return made.id;
  }

  it("asks over approved designs with one date: 201, then 200 for a change, and the same ask changes nothing", async () => {
    const id = await project();
    const first = await requestProjectQuote(id, {
      lines: [{ designId: approved, cartons: 40 }],
      desiredDeliveryDate: "2026-12-20",
    });
    expect(backend.post).toHaveBeenLastCalledWith(`/design-projects/${id}/quote-requests`, {
      lines: [{ designId: approved, cartons: 40 }],
      desiredDeliveryDate: "2026-12-20",
    });
    expect(first).toMatchObject({
      created: true,
      request: {
        projectId: id,
        status: "OPEN",
        desiredDeliveryDate: "2026-12-20",
        lines: [{ designId: approved, cartons: 40, customerSku: expect.any(String) }],
      },
    });

    const same = await requestProjectQuote(id, {
      lines: [{ designId: approved, cartons: 40 }],
      desiredDeliveryDate: "2026-12-20",
    });
    expect(same.created).toBe(false);
    const changed = await requestProjectQuote(id, { lines: [{ designId: approved, cartons: 60 }] });
    expect(changed).toMatchObject({ created: false, request: { id: first.request.id } });
    expect(changed.request.lines[0]?.cartons).toBe(60);
    expect(changed.request).not.toHaveProperty("desiredDeliveryDate");
    expect(await listProjectQuoteRequests(id)).toHaveLength(1);

    // The identical ask told nobody: two events, the payload of §B.7.2 (`status`, not `requestStatus`).
    expect(events.map((e) => e.type)).toEqual([
      "PROJECT_QUOTE_REQUESTED",
      "PROJECT_QUOTE_REQUESTED",
    ]);
    expect(events[0]).toMatchObject({
      created: true,
      payload: {
        scope: "PROJECT",
        requestId: first.request.id,
        projectId: id,
        projectName: "Bộ ly quán Nhà Mình",
        status: "OPEN",
        desiredDeliveryDate: "2026-12-20",
        lines: [{ designId: approved, cartons: 40, designStatus: "APPROVED" }],
      },
    });
  });

  it("refuses a draft of the project, a design outside it, a past date and a closed project", async () => {
    const id = await project();
    expect(
      await errorOf(requestProjectQuote(id, { lines: [{ designId: draft, cartons: 1 }] })),
    ).toMatchObject({ status: 409, code: "DESIGN_NOT_APPROVED" });
    expect(
      await errorOf(requestProjectQuote(id, { lines: [{ designId: pending, cartons: 1 }] })),
    ).toMatchObject({ status: 404, code: "NOT_FOUND" });
    const past = await errorOf(
      requestProjectQuote(id, {
        lines: [{ designId: approved, cartons: 1 }],
        desiredDeliveryDate: "2026-11-18",
      }),
    );
    expect(past.fieldErrors).toEqual({ desiredDeliveryDate: expect.any(String) });
    const cartons = await errorOf(
      requestProjectQuote(id, { lines: [{ designId: approved, cartons: 0 }] }),
    );
    expect(cartons.fieldErrors).toEqual({ "lines[0].cartons": expect.any(String) });

    const unknown = await errorOf(
      requestProjectQuote("7d51f000-0000-4000-8000-0000000000ff", {
        lines: [{ designId: approved, cartons: 1 }],
      }),
    );
    expect(unknown).toMatchObject({ status: 404, code: "NOT_FOUND" });
  });

  it("answers 409 DESIGN_PROJECT_ARCHIVED once the project is closed, and still lists its request", async () => {
    const id = await project();
    await requestProjectQuote(id, { lines: [{ designId: approved, cartons: 10 }] });
    await archiveProject(id, { version: (await getProject(id)).version });
    const error = await errorOf(
      requestProjectQuote(id, { lines: [{ designId: approved, cartons: 11 }] }),
    );
    expect(error).toMatchObject({ status: 409, code: "DESIGN_PROJECT_ARCHIVED" });
    // Closing the project does not close its request (plan §D.9).
    expect((await listProjectQuoteRequests(id))[0]).toMatchObject({
      status: "OPEN",
      lines: [{ cartons: 10 }],
    });
  });
});
