import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/error";
import type { DesignMockStore } from "@/lib/api/mock-fixtures/design-store";
import { settle } from "@/test/fake-backend";

import {
  getDesign,
  getProject,
  getProjectHistory,
  listDesignFiles,
  openReviewRound,
  recordSetPreflightFailure,
  uploadSubmission,
} from "../api";
import { sha256Hex } from "../engine/export/checksum";
import { emptyDocument } from "../engine/document/factory";
import { cup12oz, PNG_1x1, textEl } from "../engine/__tests__/fixtures";
import { describeDesignError, roundRefusalOf } from "../errors";
import { openReviewRoundInputSchema, setPreflightFailureInputSchema } from "../project-schemas";
import { designKeys, projectKeys } from "../queries";
import {
  recordSetFailures,
  roundIsOpen,
  useOpenReviewRound,
  useSubmissionUpload,
} from "../round-mutations";
import type { ReviewRoundItem, SubmissionFiles } from "../types";
import {
  designBackend,
  STUDIO_PRODUCTS,
  submitElsewhere,
  type DesignBackend,
} from "./design-backend";
import { ids } from "./fixtures";

// "Gửi duyệt cả bộ" through the real client, the mock adapter and the design route table: each
// design's files go up on their own, then one call opens the round (spec 2026-11-12 §4, §8).

vi.setConfig({ testTimeout: 15_000 });

let backend: DesignBackend;
beforeEach(async () => {
  backend = await designBackend();
});
afterEach(() => vi.restoreAllMocks());

const PASS = { result: "Pass" as const, issues: [] };

/** The three files of one design's bundle; `seed` makes them differ between designs. */
const filesOf = (seed: string): SubmissionFiles => ({
  CUSTOMER_PREVIEW: { name: "preview.png", type: "image/png", bytes: PNG_1x1.slice() },
  PRINT_READY: {
    name: "print-ready.pdf",
    type: "application/pdf",
    bytes: new TextEncoder().encode(`print ${seed}`),
  },
  TECHNICAL_SPEC: {
    name: "technical-spec.pdf",
    type: "application/pdf",
    bytes: new TextEncoder().encode(`spec ${seed}`),
  },
});

/** A cup draft of the project; with content (version 1) unless `empty` (version 0). */
async function projectDraft(
  store: DesignMockStore,
  projectId: string,
  name: string,
  empty = false,
) {
  const created = settle(await store.create({ ...STUDIO_PRODUCTS.cup, name, projectId }));
  const { id } = created.data as { id: string };
  if (!empty) {
    const document = emptyDocument(cup12oz);
    document.surfaces.BODY = {
      background: { kind: "none" },
      elements: [textEl("t", { placement: { u: 170, v: 55, rotationDeg: 0, scale: 1 } })],
    };
    settle(await store.putDocument(id, { version: 0, document }));
  }
  return id;
}

async function projectWith(store: DesignMockStore, ...names: string[]) {
  const project = settle(await store.createProject({ name: "Quán Hoa" })).data as { id: string };
  const designIds: string[] = [];
  for (const name of names) designIds.push(await projectDraft(store, project.id, name));
  return { projectId: project.id, designIds };
}

/** Uploads a design's files; answers its round item. */
async function itemOf(designId: string, key = `key-${designId}`): Promise<ReviewRoundItem> {
  const { version } = await getDesign(designId);
  const { uploadToken, checksums } = await uploadSubmission(designId, filesOf(designId), key);
  return { designId, version, uploadToken, preflight: PASS, checksums };
}

describe("uploadSubmission", () => {
  it("sends the three files with their SHA-256 and the key, and answers the token with the checksums", async () => {
    const { designIds } = await projectWith(backend.store, "Ly A", "Ly B");
    const [a] = designIds as [string];
    const files = filesOf("x");

    const upload = await uploadSubmission(a, files, "the-key");

    const sha = {
      CUSTOMER_PREVIEW: await sha256Hex(files.CUSTOMER_PREVIEW.bytes.slice()),
      PRINT_READY: await sha256Hex(files.PRINT_READY.bytes.slice()),
      TECHNICAL_SPEC: await sha256Hex(files.TECHNICAL_SPEC.bytes.slice()),
    };
    expect(upload).toEqual({ uploadToken: expect.any(String), checksums: sha });
    const [url, body, config] = backend.post.mock.calls.at(-1)!;
    expect(url).toBe(`/designs/${a}/submission-uploads`);
    expect(config).toMatchObject({
      headers: { "Content-Type": "multipart/form-data", "Idempotency-Key": "the-key" },
      timeout: 120_000,
    });
    const form = body as FormData;
    expect(JSON.parse(String(form.get("checksums")))).toEqual(sha);
    for (const role of ["CUSTOMER_PREVIEW", "PRINT_READY", "TECHNICAL_SPEC"] as const) {
      expect(form.get(role)).toMatchObject({ name: files[role].name, type: files[role].type });
    }
    // The same key again (a retry after a lost answer) answers the same token.
    expect(await uploadSubmission(a, files, "the-key")).toEqual(upload);
  });
});

describe("openReviewRound", () => {
  it("opens the round: every design PENDING_REVIEW, the project's open round, the files listed", async () => {
    const { projectId, designIds } = await projectWith(backend.store, "Ly A", "Ly B");
    const items = [await itemOf(designIds[0]!), await itemOf(designIds[1]!)];

    const round = await openReviewRound(projectId, { items });

    expect(round).toEqual({
      id: expect.any(String),
      projectId,
      designIds,
      openedAt: expect.any(String),
      closedAt: null,
    });
    expect(backend.post).toHaveBeenCalledWith(`/design-projects/${projectId}/review-rounds`, {
      items,
    });
    for (const id of designIds) {
      expect(await getDesign(id)).toMatchObject({
        status: "PENDING_REVIEW",
        submittedAt: round.openedAt,
      });
    }
    expect((await getProject(projectId)).openRound).toEqual({
      id: round.id,
      designIds,
      openedAt: round.openedAt,
    });
    const files = await listDesignFiles(designIds[0]!);
    expect(files.map((file) => file.sha256)).toEqual([
      items[0]!.checksums.CUSTOMER_PREVIEW,
      items[0]!.checksums.PRINT_READY,
      items[0]!.checksums.TECHNICAL_SPEC,
    ]);
  });

  it("names the design a refusal is about: VERSION_CHANGED, and PREFLIGHT_FAILED with its checks", async () => {
    const { store } = backend;
    const { projectId, designIds } = await projectWith(store, "Ly A", "Ly B");
    const [a, b] = designIds as [string, string];
    const empty = await projectDraft(store, projectId, "Trống", true);
    const items = [await itemOf(a), await itemOf(b)];
    const record = settle(await store.getDocument(b)).data as {
      version: number;
      document: unknown;
    };
    settle(await store.putDocument(b, { version: record.version, document: record.document }));

    const changed = await openReviewRound(projectId, { items }).catch((error: unknown) => error);

    expect(changed).toBeInstanceOf(ApiError);
    expect(roundRefusalOf(changed)).toEqual({
      code: "VERSION_CHANGED",
      designIds: [b],
      failures: [],
    });
    expect(describeDesignError(changed)).toContain(
      "Có bản vừa được sửa ở nơi khác nên chưa bản nào được gửi.",
    );

    const failing = await openReviewRound(projectId, {
      items: [items[0]!, await itemOf(empty)],
    }).catch((error: unknown) => error);
    const refusal = roundRefusalOf(failing);
    expect(refusal).toMatchObject({ code: "PREFLIGHT_FAILED", designIds: [empty] });
    expect(refusal?.failures[0]?.issues.map((issue) => issue.ruleId)).toEqual(["EMPTY_DESIGN"]);
  });

  it("refuses before sending: fewer than 2 designs, a design twice, a Fail preflight", async () => {
    const items = [0, 1].map((n): ReviewRoundItem => ({
      designId: `7d51f000-0000-4000-8000-00000000000${n}`,
      version: 1,
      uploadToken: `token-${n}`,
      preflight: PASS,
      checksums: {
        CUSTOMER_PREVIEW: "a".repeat(64),
        PRINT_READY: "b".repeat(64),
        TECHNICAL_SPEC: "c".repeat(64),
      },
    }));
    expect(openReviewRoundInputSchema.safeParse({ items }).success).toBe(true);
    expect(openReviewRoundInputSchema.safeParse({ items: [items[0]] }).success).toBe(false);
    expect(openReviewRoundInputSchema.safeParse({ items: [items[0], items[0]] }).success).toBe(
      false,
    );
    const failed = { ...items[1]!, preflight: { result: "Fail", issues: [] } };
    expect(openReviewRoundInputSchema.safeParse({ items: [items[0], failed] }).success).toBe(false);

    await expect(openReviewRound(ids.project, { items: [items[0]!] })).rejects.toThrow();
    expect(backend.post).not.toHaveBeenCalled();
  });

  it("words the round's other refusals for the customer", () => {
    const refused = (code: string) => new ApiError(422, code, "x", undefined, undefined, {});
    expect(describeDesignError(refused("SET_TOO_SMALL"))).toBe(
      "Cần ít nhất 2 bản nháp để gửi duyệt cả bộ.",
    );
    expect(describeDesignError(refused("DESIGN_NOT_DRAFT"))).toBe(
      "Có bản không còn là bản nháp nên chưa bản nào được gửi.",
    );
    expect(describeDesignError(refused("DESIGN_NOT_IN_PROJECT"))).toBe(
      "Có bản không còn thuộc dự án này nên chưa bản nào được gửi.",
    );
    expect(describeDesignError(refused("UPLOAD_INVALID"))).toBe(
      "File đã tải lên của một bản không còn dùng được. Hãy thử lại để tải lên lại.",
    );
    expect(roundRefusalOf(refused("SET_TOO_SMALL"))).toBeNull(); // names no design
    expect(roundRefusalOf(new Error("x"))).toBeNull();
  });
});

describe("a set's failed check (docs 12 §5.4 BATCH_PREFLIGHT_FAILED)", () => {
  const issue = { ruleId: "EMPTY_DESIGN" as const, level: "fail" as const, message: "Trống" };

  it("recordSetPreflightFailure records the issues of each design in the project's history", async () => {
    const { projectId, designIds } = await projectWith(backend.store, "Ly A", "Ly B");
    const items = designIds.map((designId) => ({ designId, issues: [issue] }));

    const event = await recordSetPreflightFailure(projectId, { items });

    expect(event).toMatchObject({ type: "BATCH_PREFLIGHT_FAILED", version: 0 });
    expect(backend.post).toHaveBeenCalledWith(`/design-projects/${projectId}/preflight-failures`, {
      items,
    });
    expect(setPreflightFailureInputSchema.safeParse({ items: [] }).success).toBe(false);
    expect(
      setPreflightFailureInputSchema.safeParse({ items: [{ designId: designIds[0], issues: [] }] })
        .success,
    ).toBe(false);
  });

  it("recordSetFailures re-reads the project's history, and answers a refusal instead of throwing", async () => {
    const { projectId, designIds } = await projectWith(backend.store, "Ly A", "Ly B");
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const items = [{ designId: designIds[0]!, issues: [issue] }];

    expect(await recordSetFailures(client, projectId, items)).toBeUndefined();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: projectKeys.history(projectId) });

    settle(await backend.store.archiveProject(projectId, { version: 0 }));
    expect(await recordSetFailures(client, projectId, items)).toMatchObject({
      code: "PROJECT_ARCHIVED",
    });
  });
});

describe("whether a round opened (an answer lost on the way)", () => {
  it("roundIsOpen reads the project afresh: false before the round, true after (its designs re-read)", async () => {
    const { projectId, designIds } = await projectWith(backend.store, "Ly A", "Ly B");
    const items = [await itemOf(designIds[0]!), await itemOf(designIds[1]!)];
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");

    expect(await roundIsOpen(client, projectId, designIds)).toBe(false);
    await openReviewRound(projectId, { items });
    expect(await roundIsOpen(client, projectId, designIds)).toBe(true);
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: designKeys.detail(designIds[0]!),
      exact: true,
    });
    expect(await roundIsOpen(client, projectId, [designIds[0]!])).toBe(false); // another set
  });
});

describe("the hooks", () => {
  function setup() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    return { invalidate, wrapper };
  }
  const keysOf = (invalidate: ReturnType<typeof setup>["invalidate"]) =>
    invalidate.mock.calls.map(([filters]) => filters?.queryKey);

  it("useOpenReviewRound re-reads each design of the round like a submit, and the projects", async () => {
    const { projectId, designIds } = await projectWith(backend.store, "Ly A", "Ly B");
    const items = [await itemOf(designIds[0]!), await itemOf(designIds[1]!)];
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useOpenReviewRound(projectId), { wrapper });

    await result.current.mutateAsync({ items });

    const keys = keysOf(invalidate);
    const times = (key: readonly unknown[]) =>
      keys.filter((k) => JSON.stringify(k) === JSON.stringify(key)).length;
    for (const id of designIds) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: designKeys.detail(id), exact: true });
      expect(times(designKeys.history(id))).toBe(1);
      expect(times(designKeys.files(id))).toBe(1);
    }
    // What every design of the round shares is re-read once, not once per design.
    expect(times(designKeys.lists())).toBe(1);
    expect(times(designKeys.draftCount())).toBe(1);
    expect(times(projectKeys.all)).toBe(1);
  });

  it("useOpenReviewRound re-reads the project and the lists after a refusal", async () => {
    const { store } = backend;
    const { projectId, designIds } = await projectWith(store, "Ly A", "Ly B");
    const [a, b] = designIds as [string, string];
    const items = [await itemOf(a), await itemOf(b)];
    await submitElsewhere(store, b); // b is no longer a draft
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useOpenReviewRound(projectId), { wrapper });

    await expect(result.current.mutateAsync({ items })).rejects.toBeInstanceOf(ApiError);

    await waitFor(() => expect(keysOf(invalidate)).toContainEqual(projectKeys.detail(projectId)));
    expect(keysOf(invalidate)).toContainEqual(projectKeys.lists());
    expect(keysOf(invalidate)).toContainEqual(designKeys.lists());
  });

  it("useSubmissionUpload re-reads nothing on success, and a design that moved on after a refusal", async () => {
    const { store } = backend;
    const { designIds } = await projectWith(store, "Ly A", "Ly B");
    const [a, b] = designIds as [string, string];
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useSubmissionUpload(), { wrapper });

    await result.current.mutateAsync({ designId: a, files: filesOf("a"), idempotencyKey: "k-a" });
    expect(invalidate).not.toHaveBeenCalled();

    await submitElsewhere(store, b);
    await expect(
      result.current.mutateAsync({ designId: b, files: filesOf("b"), idempotencyKey: "k-b" }),
    ).rejects.toMatchObject({ status: 409, code: "INVALID_STATE" });
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: designKeys.detail(b), exact: true }),
    );
    expect(keysOf(invalidate)).toContainEqual(designKeys.lists());
  });
});

describe("a round decided by the reviewer simulation", () => {
  it("names only the designs still waiting, then closes: BATCH_CLOSED is in the history, parsed by the schema", async () => {
    const { projectId, designIds } = await projectWith(backend.store, "Ly A", "Ly B", "Ly C");
    const items = [];
    for (const id of designIds) items.push(await itemOf(id));
    const round = await openReviewRound(projectId, { items });
    const [a, b, c] = designIds as [string, string, string];

    settle(await backend.store.simulateApprove(a));
    expect((await getProject(projectId)).openRound).toEqual({
      id: round.id,
      designIds: [b, c],
      openedAt: round.openedAt,
    });
    settle(await backend.store.simulateReturn(b, { reason: "Logo mờ" }));
    settle(await backend.store.simulateApprove(c));

    expect((await getProject(projectId)).openRound).toBeNull();
    const closed = (await getProjectHistory(projectId)).find(
      (event) => event.type === "BATCH_CLOSED",
    );
    expect(closed?.note).toBe(`${round.id}: ${a} APPROVED, ${b} RETURNED (Logo mờ), ${c} APPROVED`);
  });
});
