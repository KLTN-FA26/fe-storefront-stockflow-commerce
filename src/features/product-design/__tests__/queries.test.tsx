import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";

import {
  DESIGN_POLL_MS,
  designKeys,
  downloadLinkQuery,
  downloadLinkStaleTime,
  printConfigKeys,
  useDesign,
  useDesignAssets,
  useDesignDocument,
  useDesignFiles,
  useDesignHistory,
  useDesignList,
  useDownloadLink,
  useDraftCount,
  usePrintConfig,
} from "../queries";
import {
  approvedDto,
  assetDto,
  designDto,
  documentRecordDto,
  downloadDto,
  eventDto,
  fileDto,
  ids,
  pageDto,
  printConfigDto,
} from "./fixtures";

afterEach(() => vi.restoreAllMocks());

const id = ids.design;

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

describe("query keys (spec §4.4)", () => {
  it("nests every per-design key under detail(id), and the list keys under lists()", () => {
    expect(designKeys.all).toEqual(["designs"]);
    expect(designKeys.lists()).toEqual(["designs", "list"]);
    expect(designKeys.list({ page: 2, size: 12 })).toEqual([
      "designs",
      "list",
      { page: 2, size: 12 },
    ]);
    expect(designKeys.draftCount()).toEqual(["designs", "draft-count"]);
    expect(designKeys.detail("d-1")).toEqual(["designs", "detail", "d-1"]);
    for (const part of ["history", "document", "assets", "files"] as const) {
      expect(designKeys[part]("d-1")).toEqual(["designs", "detail", "d-1", part]);
    }
    expect(printConfigKeys.detail("ly", "CUP-1")).toEqual(["print-configs", "ly", "CUP-1"]);
  });

  it("keeps short-lived links out of a design's keys", () => {
    expect(designKeys.downloadLink("d-1", "a-1").slice(0, 3)).not.toEqual(designKeys.detail("d-1"));
  });
});

describe("reads", () => {
  it("lists the caller's designs with a 1-based page", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValueOnce({ data: pageDto([designDto()]) });
    const { wrapper } = setup();
    const { result } = renderHook(() => useDesignList({ page: 1, size: 12 }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledWith("/designs", {
      params: { page: 0, size: 12 },
      signal: expect.any(AbortSignal),
    });
    expect(result.current.data).toMatchObject({ page: 1, items: [{ id }] });
  });

  it("reads the draft count, the history and the submitted files", async () => {
    const get = vi.spyOn(api, "get").mockImplementation(async (url) => {
      if (url === "/designs/draft-count") return { data: { drafts: 2, limit: 50 } };
      if (url.endsWith("/history")) return { data: [eventDto()] };
      return { data: [fileDto("CUSTOMER_PREVIEW")] };
    });
    const { wrapper } = setup();
    const count = renderHook(() => useDraftCount(), { wrapper });
    const history = renderHook(() => useDesignHistory(id), { wrapper });
    const files = renderHook(() => useDesignFiles(id, true), { wrapper });
    await waitFor(() => expect(count.result.current.data).toEqual({ drafts: 2, limit: 50 }));
    await waitFor(() => expect(history.result.current.data?.[0]?.type).toBe("CREATED"));
    await waitFor(() => expect(files.result.current.data?.[0]?.role).toBe("CUSTOMER_PREVIEW"));
    expect(get).toHaveBeenCalledWith(`/designs/${id}/files`, expect.anything());
  });

  it("does not retry a 404: the same design answers 404 again", async () => {
    const get = vi.spyOn(api, "get").mockRejectedValue(new ApiError(404, "NOT_FOUND", "x"));
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useDesign(id), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(get).toHaveBeenCalledTimes(1);
  });
});

describe("useDesign polls only while PENDING_REVIEW", () => {
  it("re-reads every 5 s while the design waits for review, and stops once it is approved", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      const pending = designDto({ status: "PENDING_REVIEW", version: 4 });
      const get = vi
        .spyOn(api, "get")
        .mockResolvedValueOnce({ data: pending })
        .mockResolvedValueOnce({ data: pending })
        .mockResolvedValue({ data: approvedDto() });
      const { wrapper } = setup();
      const { result } = renderHook(() => useDesign(id), { wrapper });
      // Real-timer waits: RTL's `waitFor` would poll on the faked `setInterval`.
      await vi.waitFor(() => expect(result.current.data?.status).toBe("PENDING_REVIEW"));

      await act(() => vi.advanceTimersByTimeAsync(DESIGN_POLL_MS));
      expect(get).toHaveBeenCalledTimes(2);
      await act(() => vi.advanceTimersByTimeAsync(DESIGN_POLL_MS));
      await vi.waitFor(() => expect(result.current.data?.status).toBe("APPROVED"));
      expect(get).toHaveBeenCalledTimes(3);

      await act(() => vi.advanceTimersByTimeAsync(6 * DESIGN_POLL_MS));
      expect(get).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(["DRAFT", "APPROVED"])("never polls a %s design", async (status) => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      const get = vi.spyOn(api, "get").mockResolvedValue({ data: designDto({ status }) });
      const { wrapper } = setup();
      const { result } = renderHook(() => useDesign(id), { wrapper });
      await vi.waitFor(() => expect(result.current.isSuccess).toBe(true));
      await act(() => vi.advanceTimersByTimeAsync(4 * DESIGN_POLL_MS));
      expect(get).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("re-reads a design waiting for review whenever the window regains focus", async () => {
    const get = vi
      .spyOn(api, "get")
      .mockResolvedValue({ data: designDto({ status: "PENDING_REVIEW" }) });
    const { wrapper } = setup();
    const { result } = renderHook(() => useDesign(id), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    focusManager.setFocused(undefined);

    // Fresh data (well within the detail stale time) is read again anyway.
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });
});

describe("reads that wait for their caller", () => {
  it.each([
    ["document", (on: boolean) => useDesignDocument(id, on)],
    ["assets", (on: boolean) => useDesignAssets(id, on)],
    ["files", (on: boolean) => useDesignFiles(id, on)],
    ["print config", (on: boolean) => usePrintConfig("ly", "CUP-1", on)],
  ])("%s: no request while disabled", async (_name, hook) => {
    const get = vi.spyOn(api, "get");
    const { wrapper } = setup();
    const { result } = renderHook(() => hook(false), { wrapper });
    await Promise.resolve();
    expect(get).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("reads the document and the images once enabled", async () => {
    const get = vi.spyOn(api, "get").mockImplementation(async (url) => ({
      data: url.endsWith("/document") ? documentRecordDto() : [assetDto],
    }));
    const { wrapper } = setup();
    const document = renderHook(() => useDesignDocument(id, true), { wrapper });
    const assets = renderHook(() => useDesignAssets(id, true), { wrapper });
    await waitFor(() => expect(document.result.current.data?.version).toBe(3));
    await waitFor(() => expect(assets.result.current.data?.[0]?.assetId).toBe(ids.asset));
    expect(get).toHaveBeenCalledWith(`/designs/${id}/document`, expect.anything());
    expect(get).toHaveBeenCalledWith(`/designs/${id}/assets`, expect.anything());
  });

  it("does not refetch the document behind an editor's back when the window regains focus", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const get = vi.spyOn(api, "get").mockImplementation(async (url) => ({
        data: url.endsWith("/document") ? documentRecordDto() : designDto(),
      }));
      const { wrapper } = setup();
      const document = renderHook(() => useDesignDocument(id, true), { wrapper });
      const detail = renderHook(() => useDesign(id), { wrapper });
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
      expect(get).toHaveBeenLastCalledWith(`/designs/${id}`, expect.anything());
    } finally {
      focusManager.setFocused(undefined);
      vi.useRealTimers();
    }
  });
});

describe("usePrintConfig", () => {
  it("reads the variant's print configuration", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValueOnce({ data: printConfigDto() });
    const { wrapper } = setup();
    const { result } = renderHook(() => usePrintConfig("ly giấy", "CUP-1", true), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({ variantStatus: "ACTIVE" });
    expect(get).toHaveBeenCalledWith(
      "/catalog/products/ly%20gi%E1%BA%A5y/variants/CUP-1/print-config",
      expect.anything(),
    );
  });

  it("answers null for a variant without one (404): it is an answer, not a failure", async () => {
    vi.spyOn(api, "get").mockRejectedValueOnce(new ApiError(404, "NOT_FOUND", "x"));
    const { wrapper } = setup();
    const { result } = renderHook(() => usePrintConfig("ly", "CUP-1", true), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it("keeps any other failure an error", async () => {
    vi.spyOn(api, "get").mockRejectedValue(new ApiError(403, "FORBIDDEN", "x"));
    const { wrapper } = setup();
    const { result } = renderHook(() => usePrintConfig("ly", "CUP-1", true), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("downloadLinkStaleTime", () => {
  const fetchedAt = Date.parse("2026-11-01T08:00:00Z");

  it("is the time from the fetch to expiry, minus 30 s", () => {
    expect(downloadLinkStaleTime({ url: "u", expiresAt: "2026-11-01T08:05:00Z" }, fetchedAt)).toBe(
      270_000,
    );
  });

  it("is zero for a link that expires within 30 s, has expired or cannot be read", () => {
    const stale = (expiresAt: string) => downloadLinkStaleTime({ url: "u", expiresAt }, fetchedAt);
    expect(stale("2026-11-01T08:00:20Z")).toBe(0);
    expect(stale("2026-11-01T07:00:00Z")).toBe(0);
    expect(stale("soon")).toBe(0);
    expect(downloadLinkStaleTime(undefined, fetchedAt)).toBe(0);
  });
});

describe("useDownloadLink (images)", () => {
  it("asks for an image's short-lived link", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: downloadDto });
    const { wrapper } = setup();
    const { result } = renderHook(() => useDownloadLink(id, ids.asset, true), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledWith(`/designs/${id}/assets/${ids.asset}/url`, expect.anything());
    expect(result.current.data).toEqual(downloadDto);
  });

  it("makes no request while disabled or without an id", async () => {
    const get = vi.spyOn(api, "get");
    const { wrapper } = setup();
    const off = renderHook(() => useDownloadLink(id, ids.asset, false), { wrapper });
    const noId = renderHook(() => useDownloadLink(id, undefined, true), { wrapper });
    await Promise.resolve();
    expect(get).not.toHaveBeenCalled();
    expect(off.result.current.fetchStatus).toBe("idle");
    expect(noId.result.current.fetchStatus).toBe("idle");
  });

  it("keeps a link fresh until 30 s before it expires, then reads a new one", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-01T08:00:00Z"));
    try {
      const get = vi.spyOn(api, "get").mockResolvedValue({
        data: { url: "https://files.example.vn/p.png?sig=1", expiresAt: "2026-11-01T08:05:00Z" },
      });
      const { client } = setup();
      // Read the way the images read theirs: through React Query, which asks the stale time.
      const read = () => client.fetchQuery(downloadLinkQuery(id, ids.asset));

      await read();
      vi.setSystemTime(new Date("2026-11-01T08:04:29Z"));
      await read();
      expect(get).toHaveBeenCalledTimes(1);

      vi.setSystemTime(new Date("2026-11-01T08:04:31Z"));
      await read();
      expect(get).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
