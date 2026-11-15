import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";

import {
  invalidateDesign,
  useCreateDesign,
  useCreateRevision,
  useDeleteDesign,
  useRenameDesign,
  useSaveDesignDocument,
  useUploadAsset,
} from "../mutations";
import { designKeys, designQuery, projectKeys } from "../queries";
import type { Design } from "../types";
import {
  approvedDto,
  assetDto,
  cupDocument,
  design,
  designDto,
  documentRecordDto,
  ids,
} from "./fixtures";

afterEach(() => vi.restoreAllMocks());

const id = ids.design;
const listParams = { page: 1, size: 12 };

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

/** The keys a mutation invalidated, in the shape it passed them. */
const invalidated = (spy: ReturnType<typeof setup>["invalidate"]) =>
  spy.mock.calls.map(([filters]) => filters);

describe("create and revision (spec §4.4: lists, draftCount)", () => {
  it("useCreateDesign creates the draft and re-reads the lists and the draft count", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValueOnce({ data: designDto({ version: 0 }) });
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useCreateDesign(), { wrapper });

    result.current.mutate({ productSlug: "ly", sku: "CUP-1", name: "Ly" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(post).toHaveBeenCalledWith("/designs", { productSlug: "ly", sku: "CUP-1", name: "Ly" });
    expect(result.current.data).toMatchObject({ id, version: 0 });
    expect(invalidated(invalidate)).toEqual([
      { queryKey: designKeys.lists() },
      { queryKey: designKeys.draftCount() },
    ]);
  });

  it("useCreateRevision creates a draft from an approved design and re-reads the same", async () => {
    const post = vi
      .spyOn(api, "post")
      .mockResolvedValueOnce({ data: designDto({ id: ids.revision, version: 0 }) });
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useCreateRevision(), { wrapper });

    result.current.mutate(id);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(post).toHaveBeenCalledWith(`/designs/${id}/revisions`);
    expect(result.current.data?.id).toBe(ids.revision);
    expect(invalidated(invalidate)).toEqual([
      { queryKey: designKeys.lists() },
      { queryKey: designKeys.draftCount() },
      { queryKey: projectKeys.all },
    ]);
  });
});

describe("useRenameDesign (spec §4.4: detail, lists)", () => {
  it("puts the renamed design, with its new version, in the cache and re-reads the lists", async () => {
    vi.spyOn(api, "patch").mockResolvedValueOnce({ data: designDto({ name: "Mới", version: 4 }) });
    const { client, invalidate, wrapper } = setup();
    client.setQueryData(designKeys.detail(id), design());
    const { result } = renderHook(() => useRenameDesign(id), { wrapper });

    result.current.mutate({ name: "Mới", version: 3 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryData<Design>(designKeys.detail(id))).toMatchObject({
      name: "Mới",
      version: 4,
    });
    // The answer is the fresh design: no refetch that could land with an older version.
    expect(invalidated(invalidate)).toEqual([
      { queryKey: designKeys.lists() },
      { queryKey: projectKeys.all },
    ]);
  });

  it("keeps the cached document's version in step: the rename moved the shared version on", async () => {
    vi.spyOn(api, "patch").mockResolvedValueOnce({ data: designDto({ name: "Mới", version: 4 }) });
    const { client, wrapper } = setup();
    client.setQueryData(designKeys.detail(id), design());
    client.setQueryData(designKeys.document(id), documentRecordDto({ version: 3 }));
    const { result } = renderHook(() => useRenameDesign(id), { wrapper });

    result.current.mutate({ name: "Mới", version: 3 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryData(designKeys.document(id))).toMatchObject({
      version: 4,
      checksum: "d".repeat(64),
    });
  });

  it("re-reads the design when it moved to another status meanwhile (409 INVALID_STATE)", async () => {
    vi.spyOn(api, "patch").mockRejectedValueOnce(new ApiError(409, "INVALID_STATE", "x"));
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useRenameDesign(id), { wrapper });

    result.current.mutate({ name: "Mới", version: 3 });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidated(invalidate)).toEqual([
      { queryKey: designKeys.detail(id), exact: true },
      { queryKey: designKeys.lists() },
    ]);
  });

  it("re-reads the design on a stale version (409 VERSION_CONFLICT), so a retry sends the current one", async () => {
    vi.spyOn(api, "patch").mockRejectedValueOnce(new ApiError(409, "VERSION_CONFLICT", "x"));
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useRenameDesign(id), { wrapper });

    result.current.mutate({ name: "Mới", version: 3 });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidated(invalidate)).toEqual([{ queryKey: designKeys.detail(id), exact: true }]);
  });
});

describe("useSaveDesignDocument (spec §4.4: detail version, lists updatedAt)", () => {
  it("caches the saved record, moves the design to its version, and re-reads the lists", async () => {
    const saved = documentRecordDto({ version: 4, updatedAt: "2026-11-02T09:00:00Z" });
    const put = vi.spyOn(api, "put").mockResolvedValueOnce({ data: saved });
    const { client, invalidate, wrapper } = setup();
    client.setQueryData(designKeys.detail(id), design());
    const { result } = renderHook(() => useSaveDesignDocument(id), { wrapper });
    const document = cupDocument();

    result.current.mutate({ version: 3, document });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(put).toHaveBeenCalledWith(`/designs/${id}/document`, { version: 3, document });
    expect(client.getQueryData(designKeys.document(id))).toMatchObject({ version: 4 });
    expect(client.getQueryData<Design>(designKeys.detail(id))).toMatchObject({
      version: 4,
      updatedAt: "2026-11-02T09:00:00Z",
    });
    expect(invalidated(invalidate)).toEqual([{ queryKey: designKeys.lists() }]);
  });

  it("marks the project's designs stale when the design belongs to a project, without waiting", async () => {
    vi.spyOn(api, "put").mockResolvedValueOnce({ data: documentRecordDto({ version: 4 }) });
    const { client, invalidate, wrapper } = setup();
    client.setQueryData(designKeys.detail(id), design({ projectId: ids.project }));
    const { result } = renderHook(() => useSaveDesignDocument(id), { wrapper });

    result.current.mutate({ version: 3, document: cupDocument() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidated(invalidate)).toContainEqual({ queryKey: projectKeys.designs(ids.project) });
  });

  it("does not invent a design in the cache when it holds none", async () => {
    vi.spyOn(api, "put").mockResolvedValueOnce({ data: documentRecordDto({ version: 4 }) });
    const { client, wrapper } = setup();
    const { result } = renderHook(() => useSaveDesignDocument(id), { wrapper });

    result.current.mutate({ version: 3, document: cupDocument() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryData(designKeys.detail(id))).toBeUndefined();
    expect(client.getQueryData(designKeys.document(id))).toMatchObject({ version: 4 });
  });

  it("re-reads the design on 409 INVALID_STATE, so the studio follows its new status", async () => {
    vi.spyOn(api, "put").mockRejectedValueOnce(new ApiError(409, "INVALID_STATE", "x"));
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useSaveDesignDocument(id), { wrapper });

    result.current.mutate({ version: 3, document: cupDocument() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidated(invalidate)).toEqual([
      { queryKey: designKeys.detail(id), exact: true },
      { queryKey: designKeys.lists() },
    ]);
  });

  it("leaves a stale version (409 VERSION_CONFLICT) to the conflict dialog", async () => {
    vi.spyOn(api, "put").mockRejectedValueOnce(new ApiError(409, "VERSION_CONFLICT", "x"));
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useSaveDesignDocument(id), { wrapper });

    result.current.mutate({ version: 3, document: cupDocument() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe("a read of the design under way cannot put an older version back", () => {
  /** The design read again (a poll, a focus), answered at `version` only after 50 ms. */
  function readUnderWay(client: QueryClient, version: number) {
    vi.spyOn(api, "get").mockImplementationOnce(
      () =>
        new Promise((resolve) => setTimeout(() => resolve({ data: designDto({ version }) }), 50)),
    );
    void client.fetchQuery({ ...designQuery(id), staleTime: 0 }).catch(() => undefined);
  }
  const landed = () => new Promise((resolve) => setTimeout(resolve, 100));

  it("after a rename", async () => {
    vi.spyOn(api, "patch").mockResolvedValueOnce({ data: designDto({ name: "Mới", version: 4 }) });
    const { client, wrapper } = setup();
    client.setQueryData(designKeys.detail(id), design());
    const { result } = renderHook(() => useRenameDesign(id), { wrapper });
    readUnderWay(client, 3);

    result.current.mutate({ name: "Mới", version: 3 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await landed();
    expect(client.getQueryData<Design>(designKeys.detail(id))).toMatchObject({
      name: "Mới",
      version: 4,
    });
  });

  it("after a save", async () => {
    vi.spyOn(api, "put").mockResolvedValueOnce({ data: documentRecordDto({ version: 4 }) });
    const { client, wrapper } = setup();
    client.setQueryData(designKeys.detail(id), design());
    const { result } = renderHook(() => useSaveDesignDocument(id), { wrapper });
    readUnderWay(client, 3);

    result.current.mutate({ version: 3, document: cupDocument() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await landed();
    expect(client.getQueryData<Design>(designKeys.detail(id))).toMatchObject({ version: 4 });
  });
});

describe("a write that finds the design gone (404: deleted in another tab)", () => {
  const gone = () => new ApiError(404, "NOT_FOUND", "no such design");
  const reRead = [
    { queryKey: designKeys.detail(id), exact: true },
    { queryKey: designKeys.lists() },
  ];

  it("re-reads the design after a save", async () => {
    vi.spyOn(api, "put").mockRejectedValueOnce(gone());
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useSaveDesignDocument(id), { wrapper });

    result.current.mutate({ version: 3, document: cupDocument() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidated(invalidate)).toEqual(reRead);
  });

  it("re-reads the design after a rename", async () => {
    vi.spyOn(api, "patch").mockRejectedValueOnce(gone());
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useRenameDesign(id), { wrapper });

    result.current.mutate({ name: "Mới", version: 3 });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidated(invalidate)).toEqual(reRead);
  });

  it("re-reads the design after an upload", async () => {
    vi.spyOn(api, "post").mockRejectedValueOnce(gone());
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useUploadAsset(id), { wrapper });

    result.current.mutate({ file: new Blob(["x"]), name: "a.png", idempotencyKey: "k" });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidated(invalidate)).toEqual(reRead);
  });
});

describe("useUploadAsset (spec §4.4: assets)", () => {
  it("uploads the image with its key and re-reads the design's images", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValueOnce({ data: assetDto });
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useUploadAsset(id), { wrapper });

    const file = new Blob(["x"], { type: "image/png" });
    result.current.mutate({ file, name: "logo.png", idempotencyKey: "key-1" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(post.mock.calls[0]?.[0]).toBe(`/designs/${id}/assets`);
    expect(post.mock.calls[0]?.[2]).toMatchObject({ headers: { "Idempotency-Key": "key-1" } });
    expect(invalidated(invalidate)).toEqual([{ queryKey: designKeys.assets(id) }]);
  });
});

describe("useDeleteDesign (spec §4.4: lists, draftCount; removes detail)", () => {
  it("archives the draft with its version, forgets its cache and re-reads the lists and count", async () => {
    const del = vi
      .spyOn(api, "delete")
      .mockResolvedValueOnce({ data: designDto({ status: "ARCHIVED", version: 4 }) });
    const { client, invalidate, wrapper } = setup();
    client.setQueryData(designKeys.detail(id), design());
    client.setQueryData(designKeys.document(id), documentRecordDto());
    client.setQueryData(designKeys.list(listParams), { items: [design()] });
    const { result } = renderHook(() => useDeleteDesign(), { wrapper });

    result.current.mutate({ id, version: 3 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(del).toHaveBeenCalledWith(`/designs/${id}`, { data: { version: 3 } });
    expect(client.getQueryData(designKeys.detail(id))).toBeUndefined();
    expect(client.getQueryData(designKeys.document(id))).toBeUndefined();
    expect(invalidated(invalidate)).toEqual([
      { queryKey: designKeys.lists() },
      { queryKey: designKeys.draftCount() },
      { queryKey: projectKeys.all },
    ]);
  });

  it("re-reads the design too when the draft was submitted meanwhile (409 INVALID_STATE)", async () => {
    vi.spyOn(api, "delete").mockRejectedValueOnce(new ApiError(409, "INVALID_STATE", "x"));
    const { client, invalidate, wrapper } = setup();
    client.setQueryData(designKeys.detail(id), design());
    const { result } = renderHook(() => useDeleteDesign(), { wrapper });

    result.current.mutate({ id, version: 3 });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(client.getQueryData(designKeys.detail(id))).toBeDefined();
    expect(invalidated(invalidate)).toEqual(
      expect.arrayContaining([
        { queryKey: designKeys.detail(id), exact: true },
        { queryKey: designKeys.lists() },
        { queryKey: designKeys.draftCount() },
      ]),
    );
  });

  it("re-reads the lists and the count when the delete is refused, and keeps the cache", async () => {
    vi.spyOn(api, "delete").mockRejectedValueOnce(new ApiError(500, "INTERNAL_ERROR", "x"));
    const { client, invalidate, wrapper } = setup();
    client.setQueryData(designKeys.detail(id), design());
    const { result } = renderHook(() => useDeleteDesign(), { wrapper });

    result.current.mutate({ id, version: 3 });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(client.getQueryData(designKeys.detail(id))).toBeDefined();
    expect(invalidated(invalidate)).toEqual([
      { queryKey: designKeys.lists() },
      { queryKey: designKeys.draftCount() },
      { queryKey: projectKeys.all },
    ]);
  });
});

describe("invalidateDesign (spec §4.4: submit, simulated approve / return)", () => {
  it("re-reads the design, its history and files, the lists and the draft count", async () => {
    const { client, invalidate } = setup();
    client.setQueryData(designKeys.detail(id), design(approvedDto()));

    await invalidateDesign(client, id);

    expect(invalidated(invalidate)).toEqual([
      { queryKey: designKeys.detail(id), exact: true },
      { queryKey: designKeys.history(id) },
      { queryKey: designKeys.files(id) },
      { queryKey: designKeys.lists() },
      { queryKey: designKeys.draftCount() },
      { queryKey: projectKeys.all },
    ]);
  });
});
