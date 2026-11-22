import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/error";
import type { DesignMockStore } from "@/lib/api/mock-fixtures/design-store";
import { settle } from "@/test/fake-backend";

import {
  getDesign,
  getDesignDocument,
  getProject,
  getProjectHistory,
  listDesignFiles,
  openReviewRound,
  readDesignVersion,
  recordSetPreflightFailure,
  uploadDesignFiles,
} from "../api";
import { emptyDocument } from "../engine/document/factory";
import { cup12oz, PNG_1x1, textEl } from "../engine/__tests__/fixtures";
import {
  batchRefusalOf,
  describeDesignError,
  goneDesignIdsOf,
  isDesignConflict,
  refusedDesignIdsOf,
} from "../errors";
import { openReviewRoundInputSchema, setPreflightFailureInputSchema } from "../project-schemas";
import { designKeys, projectKeys } from "../queries";
import {
  recordSetFailures,
  roundIsOpen,
  useDesignFilesUpload,
  useOpenReviewRound,
} from "../round-mutations";
import type { SubmissionFiles } from "../types";
import {
  designBackend,
  STUDIO_PRODUCTS,
  submitElsewhere,
  type DesignBackend,
} from "./design-backend";
import { ids } from "./fixtures";

// "Gửi duyệt cả bộ" through the real client, the mock adapter and the design route table, the BE's
// way: each design's files go up as artifacts bound to its layout, then one request names every
// `{ id, version }` (docs 12 BR-19, F-32).

vi.setConfig({ testTimeout: 15_000 });

let backend: DesignBackend;
beforeEach(async () => {
  backend = await designBackend();
});
afterEach(() => vi.restoreAllMocks());

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

/** Uploads a design's files bound to its layout; answers its round entry, at the version they left it. */
async function entryOf(designId: string) {
  const { checksum } = await getDesignDocument(designId);
  await uploadDesignFiles(designId, filesOf(designId), checksum, "run-1");
  return { id: designId, version: await readDesignVersion(designId) };
}

describe("openReviewRound", () => {
  it("opens the round: every design PENDING_REVIEW, the project's open round derived, the files listed", async () => {
    const { projectId, designIds } = await projectWith(backend.store, "Ly A", "Ly B");
    const designs = [await entryOf(designIds[0]!), await entryOf(designIds[1]!)];

    const round = await openReviewRound(projectId, { designs });

    // The BE answers the round's id and the project; a customer cannot read the round itself (F-27).
    expect(round.roundId).toEqual(expect.any(String));
    expect(round.project.openRound?.designIds.toSorted()).toEqual(designIds.toSorted());
    expect(backend.post).toHaveBeenCalledWith(`/design-projects/${projectId}/review-rounds`, {
      designs,
    });
    for (const id of designIds) {
      expect(await getDesign(id)).toMatchObject({ status: "PENDING_REVIEW" });
    }
    const project = await getProject(projectId);
    expect(project.openRound).toEqual(round.project.openRound);
    expect(project.openRound?.openedAt).toEqual(expect.any(String));
    expect((await listDesignFiles(designIds[0]!)).map((file) => file.role)).toEqual([
      "CUSTOMER_PREVIEW",
      "PRINT_READY",
      "TECHNICAL_SPEC",
    ]);
  });

  it("answers a stale version or a design no longer a draft with a 409 that names every such design (BE-4)", async () => {
    const { store } = backend;
    const { projectId, designIds } = await projectWith(store, "Ly A", "Ly B");
    const [a, b] = designIds as [string, string];
    const designs = [await entryOf(a), await entryOf(b)];

    const record = settle(await store.getDocument(b)).data as {
      version: number;
      document: unknown;
    };
    settle(await store.putDocument(b, { version: record.version, document: record.document }));
    const stale = await openReviewRound(projectId, { designs }).catch((error: unknown) => error);
    expect(stale).toMatchObject({ status: 409, code: "CONFLICT" });
    expect(isDesignConflict(stale)).toBe(true);
    expect(batchRefusalOf(stale)).toBeNull(); // not a preflight refusal
    expect(refusedDesignIdsOf(stale)).toEqual([b]); // only b's version moved

    // The BE checks the status before the version (S-6): a design sent elsewhere is
    // DESIGN_NOT_DRAFT whatever version the caller holds, the more severe answer of the two, and
    // `details.designs` still names the stale one with its own code.
    await submitElsewhere(store, a);
    const behind = await openReviewRound(projectId, { designs }).catch((error: unknown) => error);
    expect(behind).toMatchObject({
      status: 409,
      code: "DESIGN_NOT_DRAFT",
      details: {
        designIds: [a],
        designs: [
          { designId: a, errorCode: "DESIGN_NOT_DRAFT" },
          { designId: b, errorCode: "CONFLICT" },
        ],
      },
    });
    expect(batchRefusalOf(behind)).toBeNull();
    expect(refusedDesignIdsOf(behind)).toEqual([a, b]); // every refused design is named
    const current = [await entryOf(a), await entryOf(b)];
    const notDraft = await openReviewRound(projectId, { designs: current }).catch(
      (error: unknown) => error,
    );
    expect(notDraft).toMatchObject({ status: 409, code: "DESIGN_NOT_DRAFT" });
    expect(refusedDesignIdsOf(notDraft)).toEqual([a]);
  });

  it("answers the most severe code of a mixed batch and names every refused design in request order (S-1)", async () => {
    const { store } = backend;
    const { projectId, designIds } = await projectWith(store, "Ly A", "Ly B");
    const [a, b] = designIds as [string, string];
    const staleA = await entryOf(a);
    const record = settle(await store.getDocument(a)).data as {
      version: number;
      document: unknown;
    };
    settle(await store.putDocument(a, { version: record.version, document: record.document }));
    await submitElsewhere(store, b);
    const currentB = { id: b, version: await readDesignVersion(b) };

    for (const [order, names] of [
      [
        [staleA, currentB],
        [a, b],
      ],
      [
        [currentB, staleA],
        [b, a],
      ],
    ] as const) {
      const refusal = await openReviewRound(projectId, { designs: [...order] }).catch(
        (error: unknown) => error,
      );
      expect(refusal).toMatchObject({
        status: 409,
        code: "DESIGN_NOT_DRAFT",
        details: { designIds: [b] },
      });
      expect(refusedDesignIdsOf(refusal)).toEqual(names);
    }
  });

  it("names each design a 422 DESIGN_BATCH_PREFLIGHT_FAILED is about: its findings, in Vietnamese, or the files outdated", async () => {
    const { store } = backend;
    const { projectId, designIds } = await projectWith(store, "Ly A", "Ly B");
    const [a, b] = designIds as [string, string];
    const empty = await projectDraft(store, projectId, "Trống", true);

    // A design with an empty layout: the BE's preflight refuses it, and records that itself.
    const designs = [await entryOf(a), await entryOf(empty)];
    const failing = await openReviewRound(projectId, { designs }).catch((error: unknown) => error);
    expect(failing).toMatchObject({ status: 422, code: "DESIGN_BATCH_PREFLIGHT_FAILED" });
    const refusal = batchRefusalOf(failing);
    expect(refusal).toEqual([
      {
        designId: empty,
        issues: [{ ruleId: "EMPTY_DESIGN", level: "fail", message: "Thiết kế chưa có nội dung." }],
        roles: [],
      },
    ]);
    // None was sent, and the project's history has the failed check.
    expect(await getDesign(a)).toMatchObject({ status: "DRAFT" });
    expect((await getProjectHistory(projectId)).map((event) => event.type)).toContain(
      "BATCH_PREFLIGHT_FAILED",
    );

    // A design whose file was drawn from another layout: its roles are to be drawn again.
    const ok = [await entryOf(a), await entryOf(b)];
    await store.simulateOutdatedFiles(b, ["PRINT_READY"]);
    const outdated = await openReviewRound(projectId, { designs: ok }).catch((e: unknown) => e);
    expect(batchRefusalOf(outdated)).toEqual([{ designId: b, issues: [], roles: ["PRINT_READY"] }]);
  });

  it("refuses before sending: fewer than 2 designs, more than 20, a design twice", async () => {
    const entries = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        id: `7d51f000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        version: 1,
      }));
    expect(openReviewRoundInputSchema.safeParse({ designs: entries(2) }).success).toBe(true);
    expect(openReviewRoundInputSchema.safeParse({ designs: entries(20) }).success).toBe(true);
    expect(openReviewRoundInputSchema.safeParse({ designs: entries(1) }).success).toBe(false);
    expect(openReviewRoundInputSchema.safeParse({ designs: entries(21) }).success).toBe(false);
    const [first] = entries(1);
    expect(openReviewRoundInputSchema.safeParse({ designs: [first, first] }).success).toBe(false);

    await expect(openReviewRound(ids.project, { designs: entries(1) })).rejects.toThrow();
    expect(backend.post).not.toHaveBeenCalled();
  });

  it("words the BE's refusals of a set for the customer", () => {
    const refused = (code: string) => new ApiError(422, code, "x");
    expect(describeDesignError(refused("DESIGN_BATCH_PREFLIGHT_FAILED"))).toBe(
      "Có bản chưa đạt kiểm tra nên chưa bản nào được gửi.",
    );
    expect(describeDesignError(new ApiError(409, "DESIGN_PROJECT_ARCHIVED", "x"))).toBe(
      "Dự án đã đóng.",
    );
    expect(batchRefusalOf(refused("DESIGN_BATCH_PREFLIGHT_FAILED"))).toBeNull(); // no details to read
    expect(batchRefusalOf(new Error("x"))).toBeNull();
  });

  it("parses the refusal's details at the boundary: what cannot be read names nothing", () => {
    const withDetails = (status: number, code: string, details: Record<string, unknown>) =>
      new ApiError(status, code, "x", undefined, undefined, details);
    const [a, b] = ["d-a", "d-b"];

    expect(refusedDesignIdsOf(withDetails(409, "CONFLICT", { designIds: [a, b] }))).toEqual([a, b]);
    expect(refusedDesignIdsOf(withDetails(409, "DESIGN_NOT_DRAFT", { designIds: [b] }))).toEqual([
      b,
    ]);
    expect(refusedDesignIdsOf(withDetails(409, "CONFLICT", { designIds: [] }))).toBeNull();
    expect(refusedDesignIdsOf(withDetails(409, "CONFLICT", { designIds: "d-a" }))).toBeNull();
    expect(refusedDesignIdsOf(withDetails(409, "CONFLICT", { designIds: [1] }))).toBeNull();
    expect(refusedDesignIdsOf(new ApiError(409, "CONFLICT", "x"))).toBeNull();
    // S-1: every refused design with its own code wins over the answer code's own list.
    const designs = [
      { designId: a, errorCode: "DESIGN_NOT_DRAFT" },
      { designId: b, errorCode: "CONFLICT" },
    ];
    expect(
      refusedDesignIdsOf(withDetails(409, "DESIGN_NOT_DRAFT", { designIds: [a], designs })),
    ).toEqual([a, b]);
    // A 404 lists every refused design: only the ones coded NOT_FOUND are gone (BE `refusal()`).
    expect(goneDesignIdsOf(withDetails(404, "NOT_FOUND", { designs }))).toBeNull();
    expect(
      goneDesignIdsOf(
        withDetails(404, "NOT_FOUND", {
          designs: [{ designId: a, errorCode: "NOT_FOUND" }, ...designs],
        }),
      ),
    ).toEqual([a]);
    expect(
      goneDesignIdsOf(
        withDetails(404, "NOT_FOUND", {
          designs: [
            { designId: a, errorCode: "DESIGN_NOT_DRAFT" },
            { designId: b, errorCode: "NOT_FOUND" },
          ],
        }),
      ),
    ).toEqual([b]);
    expect(
      refusedDesignIdsOf(withDetails(409, "CONFLICT", { designs: [{ designId: a }] })),
    ).toBeNull();
    // Only these two refusals name designs this way.
    expect(
      refusedDesignIdsOf(withDetails(409, "DESIGN_PROJECT_ARCHIVED", { designIds: [a] })),
    ).toBeNull();
    expect(goneDesignIdsOf(withDetails(404, "NOT_FOUND", { designIds: [a] }))).toEqual([a]);
    expect(goneDesignIdsOf(new ApiError(404, "NOT_FOUND", "x"))).toBeNull();

    // A 422 naming no design is as unreadable as one without details; an entry with neither
    // findings nor roles has every file drawn again.
    const failed = (designs: unknown) =>
      withDetails(422, "DESIGN_BATCH_PREFLIGHT_FAILED", { designs });
    expect(batchRefusalOf(failed([]))).toBeNull();
    expect(batchRefusalOf(failed([{ designId: a }]))).toEqual([
      { designId: a, issues: [], roles: ["CUSTOMER_PREVIEW", "PRINT_READY", "TECHNICAL_SPEC"] },
    ]);
  });
});

describe("a set's failed check (docs 12 §5.4 BATCH_PREFLIGHT_FAILED)", () => {
  const issue = {
    ruleId: "NO_CARTON_SPEC" as const,
    level: "fail" as const,
    message: "Thiếu quy cách thùng",
    surfaceCode: "BODY" as const,
  };

  it("recordSetPreflightFailure sends each design's findings by rule, no message, and answers the event", async () => {
    const { projectId, designIds } = await projectWith(backend.store, "Ly A", "Ly B");
    const items = designIds.map((designId) => ({ designId, issues: [issue] }));

    const event = await recordSetPreflightFailure(projectId, { items });

    expect(event).toMatchObject({ type: "BATCH_PREFLIGHT_FAILED" });
    expect(backend.post).toHaveBeenCalledWith(`/design-projects/${projectId}/preflight-failures`, {
      items: designIds.map((designId) => ({
        designId,
        issues: [{ rule: "CARTON_SPEC_MISSING", surfaceCode: "BODY" }],
      })),
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
      status: 409,
      code: "DESIGN_PROJECT_ARCHIVED",
    });
  });
});

describe("whether a round opened (an answer lost on the way)", () => {
  it("roundIsOpen reads the project afresh: false before the round, true after (its designs re-read)", async () => {
    const { projectId, designIds } = await projectWith(backend.store, "Ly A", "Ly B");
    const designs = [await entryOf(designIds[0]!), await entryOf(designIds[1]!)];
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");

    expect(await roundIsOpen(client, projectId, designIds)).toBe(false);
    await openReviewRound(projectId, { designs });
    expect(await roundIsOpen(client, projectId, designIds)).toBe(true);
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: designKeys.detail(designIds[0]!),
      exact: true,
    });
    // The project says it from its designs (no round to read): a smaller set is still all waiting.
    expect(await roundIsOpen(client, projectId, [designIds[0]!])).toBe(true);
    expect(await roundIsOpen(client, projectId, [ids.design])).toBe(false);
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
    const designs = [await entryOf(designIds[0]!), await entryOf(designIds[1]!)];
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useOpenReviewRound(projectId), { wrapper });

    await result.current.mutateAsync({ designs });

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

  it("useOpenReviewRound re-reads the project, the lists and each design after a refusal", async () => {
    const { store } = backend;
    const { projectId, designIds } = await projectWith(store, "Ly A", "Ly B");
    const [a, b] = designIds as [string, string];
    const designs = [await entryOf(a), await entryOf(b)];
    await submitElsewhere(store, b); // b is no longer a draft
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useOpenReviewRound(projectId), { wrapper });

    await expect(result.current.mutateAsync({ designs })).rejects.toBeInstanceOf(ApiError);

    await waitFor(() => expect(keysOf(invalidate)).toContainEqual(projectKeys.detail(projectId)));
    expect(keysOf(invalidate)).toContainEqual(projectKeys.lists());
    expect(keysOf(invalidate)).toContainEqual(designKeys.lists());
    // Their uploads moved each design's version: a detail read a moment ago would be stale.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: designKeys.detail(a), exact: true });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: designKeys.detail(b), exact: true });
  });

  it("useDesignFilesUpload re-reads nothing on success, and a design that moved on after a refusal", async () => {
    const { store } = backend;
    const { designIds } = await projectWith(store, "Ly A", "Ly B");
    const [a, b] = designIds as [string, string];
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useDesignFilesUpload(), { wrapper });
    const checksumOf = async (id: string) => (await getDesignDocument(id)).checksum;

    await result.current.mutateAsync({
      designId: a,
      files: filesOf("a"),
      documentChecksum: await checksumOf(a),
      runNonce: "run-1",
    });
    expect(invalidate).not.toHaveBeenCalled();

    // Only the roles named are uploaded.
    await result.current.mutateAsync({
      designId: a,
      files: filesOf("a2"),
      documentChecksum: await checksumOf(a),
      runNonce: "run-1",
      roles: ["PRINT_READY"],
    });
    const uploads = backend.post.mock.calls.filter(([url]) =>
      String(url).endsWith(`/designs/${a}/artifacts`),
    );
    expect(uploads).toHaveLength(4);

    const checksumB = await checksumOf(b);
    await submitElsewhere(store, b);
    await expect(
      result.current.mutateAsync({
        designId: b,
        files: filesOf("b"),
        documentChecksum: checksumB,
        runNonce: "run-1",
      }),
    ).rejects.toMatchObject({ status: 409, code: "DESIGN_NOT_DRAFT" });
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: designKeys.detail(b), exact: true }),
    );
    expect(keysOf(invalidate)).toContainEqual(designKeys.lists());
  });
});

describe("a round decided by the reviewer simulation", () => {
  it("names only the designs still waiting, then closes: BATCH_CLOSED is in the history, parsed by the schema", async () => {
    const { projectId, designIds } = await projectWith(backend.store, "Ly A", "Ly B", "Ly C");
    const designs = [];
    for (const id of designIds) designs.push(await entryOf(id));
    const round = await openReviewRound(projectId, { designs });
    const [a, b, c] = designIds as [string, string, string];

    settle(await backend.store.simulateApprove(a));
    expect((await getProject(projectId)).openRound?.designIds.toSorted()).toEqual(
      [b, c].toSorted(),
    );
    settle(await backend.store.simulateReturn(b, { reason: "Logo mờ" }));
    settle(await backend.store.simulateApprove(c));

    expect((await getProject(projectId)).openRound).toBeNull();
    const closed = (await getProjectHistory(projectId)).find(
      (event) => event.type === "BATCH_CLOSED",
    );
    expect(closed?.note).toBe(
      `${round.roundId}: ${a} APPROVED, ${b} RETURNED (Logo mờ), ${c} APPROVED`,
    );
  });
});
