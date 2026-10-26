import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";

import {
  DESIGN_HISTORY_SIZE,
  DESIGN_POLL_MS,
  designKeys,
  downloadLinkStaleTime,
  useCustomization,
  useDesign,
  useDesignArtifacts,
  useDesignAssets,
  useDesignDocument,
  useDesignHistory,
  useDesignList,
  useDesignSnapshot,
  useDownloadLink,
} from "../queries";
import {
  beArtifact,
  beAsset,
  beCustomization,
  beDecision,
  beDocumentRecord,
  beDownload,
  beDraft,
  bePage,
  beSnapshot,
  ids,
  proposedDraftFields,
} from "./fixtures";

afterEach(() => vi.restoreAllMocks());

const design = ids.design;

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

describe("designKeys", () => {
  it("nests every per-design key under the detail key, and the list keys under lists()", () => {
    expect(designKeys.all).toEqual(["designs"]);
    expect(designKeys.lists()).toEqual(["designs", "list"]);
    expect(designKeys.list({ page: 2, size: 12 })).toEqual([
      "designs",
      "list",
      { page: 2, size: 12 },
    ]);
    expect(designKeys.details()).toEqual(["designs", "detail"]);
    expect(designKeys.detail("d-1")).toEqual(["designs", "detail", "d-1"]);
    expect(designKeys.document("d-1")).toEqual(["designs", "detail", "d-1", "document"]);
    expect(designKeys.assets("d-1")).toEqual(["designs", "detail", "d-1", "assets"]);
    expect(designKeys.artifacts("d-1")).toEqual(["designs", "detail", "d-1", "artifacts"]);
    expect(designKeys.history("d-1")).toEqual(["designs", "detail", "d-1", "history"]);
    expect(designKeys.snapshot("d-1")).toEqual(["designs", "detail", "d-1", "snapshot"]);
    expect(designKeys.customization("ly-giay")).toEqual(["designs", "customization", "ly-giay"]);
  });

  it("keeps presigned links out of what a workflow step invalidates", () => {
    expect(designKeys.downloadLink("artifact", "d-1", "a-1").slice(0, 2)).not.toEqual(
      designKeys.detail("d-1").slice(0, 2),
    );
  });
});

describe("reads that exist on the real BE", () => {
  it("lists the caller's designs", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValueOnce({ data: bePage([beDraft()]) });
    const { wrapper } = setup();
    const { result } = renderHook(() => useDesignList({ page: 1, size: 12 }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledWith("/designs", {
      params: { page: 0, size: 12 },
      signal: expect.any(AbortSignal),
    });
    expect(result.current.data?.items).toHaveLength(1);
  });

  it("reads one design", async () => {
    vi.spyOn(api, "get").mockResolvedValueOnce({ data: beDraft() });
    const { wrapper } = setup();
    const { result } = renderHook(() => useDesign(design), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({ id: design, version: 3 });
  });

  it("reads the artifacts and the first page of the decision history", async () => {
    const get = vi
      .spyOn(api, "get")
      .mockResolvedValueOnce({ data: [beArtifact] })
      .mockResolvedValueOnce({ data: bePage([beDecision], { size: DESIGN_HISTORY_SIZE }) });
    const { wrapper } = setup();
    const artifacts = renderHook(() => useDesignArtifacts(design), { wrapper });
    const history = renderHook(() => useDesignHistory(design), { wrapper });
    await waitFor(() => expect(artifacts.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(history.result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledWith(`/designs/${design}/artifacts`, expect.anything());
    expect(get).toHaveBeenCalledWith(
      `/designs/${design}/history`,
      expect.objectContaining({ params: { page: 0, size: DESIGN_HISTORY_SIZE } }),
    );
    expect(history.result.current.data?.items[0]?.decision).toBe("TECHNICAL_REVIEW_PASSED");
  });

  it("polls every 5 s while the customer waits for QC or Sales, and stops after (R66)", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      const waiting = beDraft({ ...proposedDraftFields, reviewedAt: undefined });
      const passed = beDraft({ ...proposedDraftFields, technicalReviewPassed: true, version: 4 });
      const get = vi
        .spyOn(api, "get")
        .mockResolvedValueOnce({ data: waiting })
        .mockResolvedValueOnce({ data: waiting })
        .mockResolvedValue({ data: passed });
      const { wrapper } = setup();
      const { result } = renderHook(() => useDesign(design), { wrapper });
      // Real-timer waits: RTL's `waitFor` would poll on the faked `setInterval`.
      await vi.waitFor(() => expect(result.current.data?.technicalReviewPassed).toBe(false));

      await act(() => vi.advanceTimersByTimeAsync(DESIGN_POLL_MS));
      expect(get).toHaveBeenCalledTimes(2);
      await act(() => vi.advanceTimersByTimeAsync(DESIGN_POLL_MS));
      await vi.waitFor(() => expect(result.current.data?.technicalReviewPassed).toBe(true));
      expect(get).toHaveBeenCalledTimes(3);

      // Past the wait (the review passed): no more polling.
      await act(() => vi.advanceTimersByTimeAsync(6 * DESIGN_POLL_MS));
      expect(get).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("refetches a waiting design whenever the window regains focus", async () => {
    const waiting = beDraft({ status: "SUBMITTED" });
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: waiting });
    const { wrapper } = setup();
    const { result } = renderHook(() => useDesign(design), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    focusManager.setFocused(undefined);

    // Fresh data (well within the detail stale time) is read again anyway.
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });

  it("does not retry a 404: the same design answers 404 again", async () => {
    const get = vi.spyOn(api, "get").mockRejectedValue(new ApiError(404, "NOT_FOUND", "x"));
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useDesign(design), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(get).toHaveBeenCalledTimes(1);
  });
});

describe("reads of proposed endpoints only run when the caller says the capability is on", () => {
  it.each([
    ["document", (on: boolean) => useDesignDocument(design, on)],
    ["assets", (on: boolean) => useDesignAssets(design, on)],
    ["snapshot", (on: boolean) => useDesignSnapshot(design, on)],
    ["customization", (on: boolean) => useCustomization("ly-giay", on)],
  ])("%s: no request while disabled", async (_name, hook) => {
    const get = vi.spyOn(api, "get");
    const { wrapper } = setup();
    const { result } = renderHook(() => hook(false), { wrapper });
    await Promise.resolve();
    expect(get).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("reads the stored document once enabled, with no 404-means-empty fallback", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValueOnce({ data: beDocumentRecord() });
    const { wrapper } = setup();
    const { result } = renderHook(() => useDesignDocument(design, true), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledWith(`/designs/${design}/document`, expect.anything());
    expect(result.current.data?.version).toBe(3);
  });

  it("surfaces a missing document as an error instead of inventing an empty one", async () => {
    vi.spyOn(api, "get").mockRejectedValueOnce(new ApiError(404, "NOT_FOUND", "x"));
    const { wrapper } = setup();
    const { result } = renderHook(() => useDesignDocument(design, true), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it("is not refetched behind an editor's back when the window regains focus", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const get = vi.spyOn(api, "get").mockImplementation(async (url) => ({
        data: url.endsWith("/document") ? beDocumentRecord() : beDraft(),
      }));
      const { wrapper } = setup();
      const document = renderHook(() => useDesignDocument(design, true), { wrapper });
      const detail = renderHook(() => useDesign(design), { wrapper });
      await waitFor(() => expect(document.result.current.isSuccess).toBe(true));
      await waitFor(() => expect(detail.result.current.isSuccess).toBe(true));
      expect(get).toHaveBeenCalledTimes(2);

      vi.setSystemTime(Date.now() + 60 * 60_000); // everything is stale by now
      act(() => {
        focusManager.setFocused(false);
        focusManager.setFocused(true);
      });

      // The design is re-read on focus; the document the editor holds is not.
      await waitFor(() => expect(get).toHaveBeenCalledTimes(3));
      expect(get).toHaveBeenLastCalledWith(`/designs/${design}`, expect.anything());
    } finally {
      focusManager.setFocused(undefined);
      vi.useRealTimers();
    }
  });

  it("reads assets, the snapshot and the customization once enabled", async () => {
    const get = vi
      .spyOn(api, "get")
      .mockResolvedValueOnce({ data: [beAsset] })
      .mockResolvedValueOnce({ data: beSnapshot })
      .mockResolvedValueOnce({ data: beCustomization() });
    const { wrapper } = setup();
    const assets = renderHook(() => useDesignAssets(design, true), { wrapper });
    const snapshot = renderHook(() => useDesignSnapshot(design, true), { wrapper });
    const customization = renderHook(() => useCustomization("ly-giay", true), { wrapper });
    await waitFor(() => expect(assets.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(snapshot.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(customization.result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledWith(`/designs/${design}/assets`, expect.anything());
    expect(get).toHaveBeenCalledWith(`/designs/${design}/snapshot`, expect.anything());
    expect(get).toHaveBeenCalledWith("/catalog/products/ly-giay/customization", expect.anything());
  });
});

describe("downloadLinkStaleTime", () => {
  const fetchedAt = Date.parse("2026-10-25T08:00:00Z");

  it("is the time from the fetch to expiry, minus 30 s", () => {
    expect(downloadLinkStaleTime({ url: "u", expiresAt: "2026-10-25T08:05:00Z" }, fetchedAt)).toBe(
      270_000,
    );
  });

  it("is zero for a link that expires within 30 s, has expired or cannot be read", () => {
    const stale = (expiresAt: string) => downloadLinkStaleTime({ url: "u", expiresAt }, fetchedAt);
    expect(stale("2026-10-25T08:00:20Z")).toBe(0);
    expect(stale("2026-10-25T07:00:00Z")).toBe(0);
    expect(stale("soon")).toBe(0);
    expect(downloadLinkStaleTime(undefined, fetchedAt)).toBe(0);
  });
});

describe("useDownloadLink", () => {
  it("asks the artifact route for an artifact and the asset route for an asset", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: beDownload });
    const { wrapper } = setup();
    const artifact = renderHook(() => useDownloadLink("artifact", design, ids.artifact, true), {
      wrapper,
    });
    const asset = renderHook(() => useDownloadLink("asset", design, ids.asset, true), { wrapper });
    await waitFor(() => expect(artifact.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(asset.result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledWith(
      `/designs/${design}/artifacts/${ids.artifact}/download-url`,
      expect.anything(),
    );
    expect(get).toHaveBeenCalledWith(
      `/designs/${design}/assets/${ids.asset}/download-url`,
      expect.anything(),
    );
    expect(artifact.result.current.data).toEqual(beDownload);
  });

  it("makes no request while disabled or without an id (a draft with no preview yet)", async () => {
    const get = vi.spyOn(api, "get");
    const { wrapper } = setup();
    const off = renderHook(() => useDownloadLink("artifact", design, ids.artifact, false), {
      wrapper,
    });
    const noId = renderHook(() => useDownloadLink("artifact", design, undefined, true), {
      wrapper,
    });
    await Promise.resolve();
    expect(get).not.toHaveBeenCalled();
    expect(off.result.current.fetchStatus).toBe("idle");
    expect(noId.result.current.fetchStatus).toBe("idle");
  });

  it("keeps a link fresh until 30 s before it expires, then reads a new one", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-25T08:00:00Z"));
    try {
      const get = vi.spyOn(api, "get").mockResolvedValue({
        data: { url: "https://files.example.vn/p.png?sig=1", expiresAt: "2026-10-25T08:05:00Z" },
      });
      const { client, wrapper } = setup();
      const { result } = renderHook(() => useDownloadLink("artifact", design, ids.artifact, true), {
        wrapper,
      });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      const query = client
        .getQueryCache()
        .find({ queryKey: designKeys.downloadLink("artifact", design, ids.artifact) })!;

      // React Query asks for the stale time again each time it decides, so ask the same way here.
      const isStale = () => {
        const staleTime = (query.observers[0]!.options.staleTime as (q: typeof query) => number)(
          query,
        );
        return query.isStaleByTime(staleTime);
      };
      vi.setSystemTime(new Date("2026-10-25T08:02:00Z"));
      expect(isStale()).toBe(false);
      vi.setSystemTime(new Date("2026-10-25T08:04:29Z"));
      expect(isStale()).toBe(false);
      vi.setSystemTime(new Date("2026-10-25T08:04:31Z"));
      expect(isStale()).toBe(true);
      expect(get).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
