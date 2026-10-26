import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";

import {
  invalidateDesign,
  useConfirmDesign,
  useCreateDesign,
  useFinalizeDesign,
  useForkDesign,
  useRequestChanges,
  useSaveDesignDocument,
  useUploadAsset,
  useWithdrawConfirmation,
} from "../mutations";
import { designKeys } from "../queries";
import {
  beAsset,
  beDocumentRecord,
  beDraft,
  beSnapshot,
  cupDocument,
  designDraft,
  ids,
  proposedDraftFields,
  validCreateInput,
} from "./fixtures";

afterEach(() => vi.restoreAllMocks());

const design = ids.design;
const path = (tail: string) => `/designs/${design}${tail}`;

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, invalidate, wrapper };
}

type Spy = ReturnType<typeof setup>["invalidate"];
const expectDesignInvalidated = (invalidate: Spy, id = design) => {
  expect(invalidate).toHaveBeenCalledWith({ queryKey: designKeys.detail(id), exact: true });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: designKeys.lists() });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: designKeys.history(id) });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: designKeys.snapshot(id) });
};

const submitted = (overrides: Record<string, unknown> = {}) =>
  beDraft({ status: "SUBMITTED", version: 4, currentArtifactId: ids.artifact, ...overrides });
const reviewPassed = designDraft({ technicalReviewPassed: true, currentArtifactId: ids.artifact });

describe("useFinalizeDesign (submit, then confirm)", () => {
  it("submits a DRAFT, confirms the artifact with the version the submit returned, and re-reads the design", async () => {
    const post = vi
      .spyOn(api, "post")
      .mockResolvedValueOnce({ data: submitted() })
      .mockResolvedValueOnce({ data: beSnapshot });
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useFinalizeDesign(design), { wrapper });

    result.current.mutate(reviewPassed);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(post).toHaveBeenCalledTimes(2);
    expect(post).toHaveBeenNthCalledWith(1, path("/confirmation-requests"), { version: 3 });
    expect(post).toHaveBeenNthCalledWith(2, path("/confirmations"), {
      version: 4,
      artifactId: ids.artifact,
    });
    expect(result.current.data).toMatchObject({ id: ids.snapshot });
    expectDesignInvalidated(invalidate);
  });

  it("only confirms a design Sales already submitted", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValueOnce({ data: beSnapshot });
    const { wrapper } = setup();
    const { result } = renderHook(() => useFinalizeDesign(design), { wrapper });

    result.current.mutate(designDraft(submitted()));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(path("/confirmations"), {
      version: 4,
      artifactId: ids.artifact,
    });
  });

  it("re-reads the design even when the confirmation fails after the submission went through", async () => {
    vi.spyOn(api, "post")
      .mockResolvedValueOnce({ data: submitted() })
      .mockRejectedValueOnce(new ApiError(409, "CONFLICT", "stale"));
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useFinalizeDesign(design), { wrapper });

    result.current.mutate(reviewPassed);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ code: "CONFLICT" });
    expectDesignInvalidated(invalidate);
  });

  it("refuses a design without a current artifact before it submits anything", async () => {
    const post = vi.spyOn(api, "post");
    const { wrapper } = setup();
    const { result } = renderHook(() => useFinalizeDesign(design), { wrapper });

    result.current.mutate(designDraft({ technicalReviewPassed: true, currentArtifactId: null }));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(post).not.toHaveBeenCalled();
    expect(result.current.error).toMatchObject({ code: "DESIGN_ARTIFACT_MISSING" });
  });
});

describe("the customer's answers to a submitted design", () => {
  it("confirm posts the artifact and version and re-reads the design", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValueOnce({ data: beSnapshot });
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useConfirmDesign(design), { wrapper });

    result.current.mutate(designDraft(submitted()));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(post).toHaveBeenCalledWith(path("/confirmations"), {
      version: 4,
      artifactId: ids.artifact,
    });
    expectDesignInvalidated(invalidate);
  });

  it("request changes posts the trimmed reason and re-reads the design", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValueOnce({ data: beDraft() });
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useRequestChanges(design), { wrapper });

    result.current.mutate({ version: 4, reason: "  Đổi màu nền  " });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(post).toHaveBeenCalledWith(path("/change-requests"), {
      version: 4,
      reason: "Đổi màu nền",
    });
    expectDesignInvalidated(invalidate);
  });

  it("withdraw posts the reason and re-reads the design", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValueOnce({ data: beDraft() });
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useWithdrawConfirmation(design), { wrapper });

    result.current.mutate({ version: 4, reason: "Cần sửa logo" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(post).toHaveBeenCalledWith(path("/confirmation-withdrawals"), {
      version: 4,
      reason: "Cần sửa logo",
    });
    expectDesignInvalidated(invalidate);
  });

  it.each([
    ["request changes", useRequestChanges],
    ["withdraw", useWithdrawConfirmation],
  ])(
    "%s re-reads the design when the BE answers 409 (the cached version is stale)",
    async (_n, hook) => {
      vi.spyOn(api, "post").mockRejectedValueOnce(new ApiError(409, "CONFLICT", "stale"));
      const { invalidate, wrapper } = setup();
      const { result } = renderHook(() => hook(design), { wrapper });

      result.current.mutate({ version: 4, reason: "Cần sửa" });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expectDesignInvalidated(invalidate);
    },
  );
});

describe("starting and forking", () => {
  it("create posts the input and re-reads the lists", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValueOnce({ data: beDraft() });
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useCreateDesign(), { wrapper });

    result.current.mutate(validCreateInput);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(post).toHaveBeenCalledWith("/designs/mine", validCreateInput);
    expect(result.current.data).toMatchObject({ id: ids.design });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: designKeys.lists() });
  });

  it("create leaves the lists alone when it fails", async () => {
    vi.spyOn(api, "post").mockRejectedValueOnce(new ApiError(409, "PRODUCT_NOT_CUSTOMIZABLE", "x"));
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useCreateDesign(), { wrapper });

    result.current.mutate(validCreateInput);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("fork posts to the source design and re-reads the lists", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValueOnce({
      data: beDraft({ id: ids.artifact2, parentSnapshotId: ids.snapshot }),
    });
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useForkDesign(), { wrapper });

    result.current.mutate(design);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(post).toHaveBeenCalledWith(path("/revisions"));
    expect(result.current.data).toMatchObject({ id: ids.artifact2 });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: designKeys.lists() });
  });
});

describe("uploading an image", () => {
  it("sends the file with the caller's idempotency key and re-reads the design's assets", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValueOnce({ data: beAsset });
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useUploadAsset(design), { wrapper });
    const file = new Blob(["png"], { type: "image/png" });

    result.current.mutate({ file, name: "logo.png", idempotencyKey: "key-1" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(post).toHaveBeenCalledWith(
      path("/assets"),
      expect.any(FormData),
      expect.objectContaining({ headers: expect.objectContaining({ "Idempotency-Key": "key-1" }) }),
    );
    expect(result.current.data).toMatchObject({ assetId: ids.asset });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: designKeys.assets(design) });
  });
});

describe("useSaveDesignDocument", () => {
  const record = beDocumentRecord({ version: 4, updatedAt: "2026-10-25T08:10:00Z" });

  it("stores the saved record, moves the cached design to its version and re-reads the lists", async () => {
    const put = vi.spyOn(api, "put").mockResolvedValueOnce({ data: record });
    const { client, invalidate, wrapper } = setup();
    client.setQueryData(designKeys.detail(design), designDraft());
    const { result } = renderHook(() => useSaveDesignDocument(design), { wrapper });

    result.current.mutate({ version: 3, document: cupDocument() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(put).toHaveBeenCalledWith(path("/document"), { version: 3, document: cupDocument() });
    expect(client.getQueryData(designKeys.document(design))).toMatchObject({ version: 4 });
    expect(client.getQueryData(designKeys.detail(design))).toMatchObject({ version: 4 });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: designKeys.lists() });
    // Still editing: the BE has no review to reset, so the cached design stays as it is.
    expect(invalidate).not.toHaveBeenCalledWith({
      queryKey: designKeys.detail(design),
      exact: true,
    });
  });

  it("does not re-read a design that is editing again after its review was voided by an earlier save", async () => {
    vi.spyOn(api, "put").mockResolvedValueOnce({ data: record });
    const { client, invalidate, wrapper } = setup();
    // The BE clears reviewRequestedAt when an edit voids a review; the artifact stays current.
    client.setQueryData(
      designKeys.detail(design),
      designDraft({
        ...proposedDraftFields,
        currentArtifactId: ids.artifact,
        reviewRequestedAt: undefined,
        reviewedAt: undefined,
      }),
    );
    const { result } = renderHook(() => useSaveDesignDocument(design), { wrapper });

    result.current.mutate({ version: 3, document: cupDocument() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).not.toHaveBeenCalledWith({
      queryKey: designKeys.detail(design),
      exact: true,
    });
  });

  it("re-reads the design when it was past editing: the BE resets the technical review on a save", async () => {
    vi.spyOn(api, "put").mockResolvedValueOnce({ data: record });
    const { client, invalidate, wrapper } = setup();
    client.setQueryData(designKeys.detail(design), reviewPassed);
    const { result } = renderHook(() => useSaveDesignDocument(design), { wrapper });

    result.current.mutate({ version: 3, document: cupDocument() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: designKeys.detail(design), exact: true });
  });

  it("does not invent a design in the cache when it holds none", async () => {
    vi.spyOn(api, "put").mockResolvedValueOnce({ data: record });
    const { client, wrapper } = setup();
    const { result } = renderHook(() => useSaveDesignDocument(design), { wrapper });

    result.current.mutate({ version: 3, document: cupDocument() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryData(designKeys.detail(design))).toBeUndefined();
    expect(client.getQueryData(designKeys.document(design))).toMatchObject({ version: 4 });
  });

  it("changes nothing in the cache when the save fails", async () => {
    vi.spyOn(api, "put").mockRejectedValueOnce(new ApiError(409, "CONFLICT", "stale"));
    const { client, invalidate, wrapper } = setup();
    client.setQueryData(designKeys.detail(design), designDraft());
    const { result } = renderHook(() => useSaveDesignDocument(design), { wrapper });

    result.current.mutate({ version: 3, document: cupDocument() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(client.getQueryData(designKeys.detail(design))).toMatchObject({ version: 3 });
    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe("invalidateDesign", () => {
  it("marks the design, its lists, history, artifacts and snapshot stale, but not its document or assets", async () => {
    const { client } = setup();
    const keys = {
      detail: designKeys.detail(design),
      list: designKeys.list({ page: 1, size: 12 }),
      history: designKeys.history(design),
      artifacts: designKeys.artifacts(design),
      snapshot: designKeys.snapshot(design),
      document: designKeys.document(design),
      assets: designKeys.assets(design),
      otherDesign: designKeys.detail(ids.artifact2),
    };
    for (const key of Object.values(keys)) client.setQueryData(key, { cached: true });

    await invalidateDesign(client, design);

    const stale = (key: readonly unknown[]) => client.getQueryState(key)?.isInvalidated;
    expect(stale(keys.detail)).toBe(true);
    expect(stale(keys.list)).toBe(true);
    expect(stale(keys.history)).toBe(true);
    expect(stale(keys.artifacts)).toBe(true);
    expect(stale(keys.snapshot)).toBe(true);
    // The editor holds the document and the images; a workflow step does not change them.
    expect(stale(keys.document)).toBe(false);
    expect(stale(keys.assets)).toBe(false);
    expect(stale(keys.otherDesign)).toBe(false);
  });
});
