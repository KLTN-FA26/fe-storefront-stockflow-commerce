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
  projectKeys,
  useDesign,
  useDesignAssets,
  useDesignDocument,
  useDesignFiles,
  useDesignHistory,
  useDesignPrintConfig,
  useDesignList,
  useDownloadLink,
  useDraftCount,
  usePrintConfig,
  usePrintConfigs,
  useProject,
  useProjectDesigns,
  useProjectPreviews,
} from "../queries";
import {
  approvedDraftDto,
  assetDto,
  customizationDto,
  decisionDto,
  design,
  designDraftDto,
  documentRecordDto,
  downloadDto,
  artifactDto,
  ids,
  pageDto,
  templateDto,
} from "./fixtures";
import { projectDto } from "./project-fixtures";

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
    const get = vi.spyOn(api, "get").mockResolvedValueOnce({ data: pageDto([designDraftDto()]) });
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
      // The count is `totalElements` of a one-row page of DRAFTs (F-11); the history is a page.
      if (url === "/designs") return { data: pageDto([designDraftDto()], { totalElements: 2 }) };
      if (url.endsWith("/history")) return { data: pageDto([decisionDto()]) };
      return { data: [artifactDto("CUSTOMER_PREVIEW")] };
    });
    const { wrapper } = setup();
    const count = renderHook(() => useDraftCount(), { wrapper });
    const history = renderHook(() => useDesignHistory(id), { wrapper });
    const files = renderHook(() => useDesignFiles(id, true), { wrapper });
    await waitFor(() => expect(count.result.current.data).toEqual({ drafts: 2, limit: 50 }));
    await waitFor(() => expect(history.result.current.data?.[0]?.type).toBe("CREATED"));
    await waitFor(() => expect(files.result.current.data?.[0]?.role).toBe("CUSTOMER_PREVIEW"));
    expect(get).toHaveBeenCalledWith(`/designs/${id}/artifacts`, expect.anything());
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

describe("a project polls only while a round is open", () => {
  // A customer cannot read a round (F-27): it is open while the project's designs wait for review.
  const waiting = designDraftDto({
    status: "PENDING_REVIEW",
    projectId: ids.project,
    reviewRequestedAt: "2026-11-11T09:00:00Z",
  });
  const withRound = () => projectDto({ designs: [waiting] });
  const withoutRound = () => projectDto({ designs: [designDraftDto({ projectId: ids.project })] });

  it("useProject re-reads every 5 s while a round is open, and stops once it closes", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      const get = vi
        .spyOn(api, "get")
        .mockResolvedValueOnce({ data: withRound() })
        .mockResolvedValue({ data: withoutRound() });
      const { wrapper } = setup();
      const { result } = renderHook(() => useProject(ids.project), { wrapper });
      await vi.waitFor(() => expect(result.current.data?.openRound).toBeTruthy());
      expect(result.current.data?.openRound).toEqual({
        designIds: [id],
        openedAt: "2026-11-11T09:00:00Z",
      });

      await act(() => vi.advanceTimersByTimeAsync(DESIGN_POLL_MS));
      await vi.waitFor(() => expect(result.current.data?.openRound).toBeNull());
      expect(get).toHaveBeenCalledTimes(2);
      await act(() => vi.advanceTimersByTimeAsync(6 * DESIGN_POLL_MS));
      expect(get).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("never polls a project with no round open", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      const get = vi.spyOn(api, "get").mockResolvedValue({ data: withoutRound() });
      const { wrapper } = setup();
      const { result } = renderHook(() => useProject(ids.project), { wrapper });
      await vi.waitFor(() => expect(result.current.isSuccess).toBe(true));
      await act(() => vi.advanceTimersByTimeAsync(4 * DESIGN_POLL_MS));
      expect(get).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("useProjectDesigns is the project's own read (F-30): one request for both, polling while a round is open", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      const get = vi
        .spyOn(api, "get")
        .mockResolvedValueOnce({ data: withRound() })
        .mockResolvedValue({ data: withoutRound() });
      const { wrapper } = setup();
      const both = renderHook(
        () => ({ project: useProject(ids.project), designs: useProjectDesigns(ids.project) }),
        { wrapper },
      );
      await vi.waitFor(() => expect(both.result.current.designs.isSuccess).toBe(true));
      expect(both.result.current.designs.data?.map((d) => d.id)).toEqual([id]);
      expect(both.result.current.project.data?.id).toBe(ids.project);
      expect(get).toHaveBeenCalledTimes(1); // one read, two views of it

      await act(() => vi.advanceTimersByTimeAsync(DESIGN_POLL_MS));
      await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(2));
      await vi.waitFor(() => expect(both.result.current.project.data?.openRound).toBeNull());
      await act(() => vi.advanceTimersByTimeAsync(6 * DESIGN_POLL_MS));
      expect(get).toHaveBeenCalledTimes(2); // the round closed: no more polling
    } finally {
      vi.useRealTimers();
    }
  });

  it("useProjectPreviews reads the project's detail for a card's strip, and is empty until it is read", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({
      data: projectDto({ designs: [designDraftDto({ previewUrl: "/logo.png" })] }),
    });
    const { wrapper } = setup();
    const { result } = renderHook(() => useProjectPreviews(ids.project), { wrapper });
    expect(result.current).toEqual([]);
    await vi.waitFor(() => expect(result.current).toEqual(["/logo.png"]));
    expect(get).toHaveBeenCalledTimes(1);
  });
});

describe("useDesign polls only while PENDING_REVIEW", () => {
  it("re-reads every 5 s while the design waits for review, and stops once it is approved", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      const pending = designDraftDto({ status: "PENDING_REVIEW", version: 4 });
      const get = vi
        .spyOn(api, "get")
        .mockResolvedValueOnce({ data: pending })
        .mockResolvedValueOnce({ data: pending })
        .mockResolvedValue({ data: approvedDraftDto() });
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
      const get = vi.spyOn(api, "get").mockResolvedValue({ data: designDraftDto({ status }) });
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
      .mockResolvedValue({ data: designDraftDto({ status: "PENDING_REVIEW" }) });
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
        data: url.endsWith("/document") ? documentRecordDto() : designDraftDto(),
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

describe("a design's project is read once, not on each read of the design (Data M-6)", () => {
  it("the poll of a design in review re-reads the design only; a project write's invalidation re-reads the project", async () => {
    const pending = designDraftDto({ status: "PENDING_REVIEW", projectId: ids.project });
    let projectName = "Bộ ly quán Hoa";
    const get = vi.spyOn(api, "get").mockImplementation(async (url) => ({
      data: url.startsWith("/design-projects/") ? projectDto({ name: projectName }) : pending,
    }));
    const projectReads = () =>
      get.mock.calls.filter(([url]) => url === `/design-projects/${ids.project}`).length;
    const designReads = () => get.mock.calls.filter(([url]) => url === `/designs/${id}`).length;
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { wrapper, client } = setup();
      const { result } = renderHook(() => useDesign(id), { wrapper });
      await vi.waitFor(() => expect(result.current.data?.project?.name).toBe("Bộ ly quán Hoa"));

      // Three polls: three reads of the design, still one of its project.
      for (let poll = 2; poll <= 4; poll += 1) {
        await act(() => vi.advanceTimersByTimeAsync(DESIGN_POLL_MS));
        await vi.waitFor(() => expect(designReads()).toBe(poll));
      }
      expect(projectReads()).toBe(1);

      // A write on the project invalidates it: the next read of the design reads it again.
      projectName = "Bộ ly mới";
      await act(() => client.invalidateQueries({ queryKey: projectKeys.detail(ids.project) }));
      await act(() => vi.advanceTimersByTimeAsync(DESIGN_POLL_MS));
      await vi.waitFor(() => expect(result.current.data?.project?.name).toBe("Bộ ly mới"));
      expect(projectReads()).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("usePrintConfigs (Data M-7)", () => {
  it("reads a product's customization and title once for all its SKUs", async () => {
    const skus = ["CUP-A", "CUP-B", "CUP-C"];
    const get = vi.spyOn(api, "get").mockImplementation(async (url) => ({
      data: url.endsWith("/customization")
        ? customizationDto(skus.map((sku) => templateDto({ sku, hasCartonSpec: true })))
        : { title: "Ly giấy" },
    }));
    const { wrapper } = setup();
    const { result } = renderHook(() => usePrintConfigs("ly-giay", skus), { wrapper });

    await waitFor(() => expect(result.current.every((query) => query.isSuccess)).toBe(true));
    expect(result.current.map((query) => query.data?.sku)).toEqual(skus);
    expect(get.mock.calls.filter(([url]) => url.endsWith("/customization"))).toHaveLength(1);
    expect(get.mock.calls.filter(([url]) => url === "/catalog/products/ly-giay")).toHaveLength(1);
  });

  it("answers null for a SKU the customization does not list, the others still read", async () => {
    vi.spyOn(api, "get").mockImplementation(async (url) => ({
      data: url.endsWith("/customization")
        ? customizationDto([templateDto({ sku: "CUP-A", hasCartonSpec: true })])
        : { title: "Ly giấy" },
    }));
    const { wrapper } = setup();
    const { result } = renderHook(() => usePrintConfigs("ly-giay", ["CUP-A", "CUP-X"]), {
      wrapper,
    });

    await waitFor(() => expect(result.current.every((query) => query.isSuccess)).toBe(true));
    expect(result.current[0]!.data?.sku).toBe("CUP-A");
    expect(result.current[1]!.data).toBeNull();
  });
});

describe("usePrintConfig", () => {
  it("reads the variant's print configuration", async () => {
    // The BE has no print-config read: the product's customization, by SKU (F-22), and its title.
    const sku = templateDto().sku as string;
    const get = vi.spyOn(api, "get").mockImplementation(async (url) => ({
      data: url.endsWith("/customization")
        ? customizationDto([templateDto({ hasCartonSpec: true })])
        : { title: "Ly giấy" },
    }));
    const { wrapper } = setup();
    const { result } = renderHook(() => usePrintConfig("ly giấy", sku, true), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({ variantStatus: "ACTIVE", hasCartonSpec: true });
    expect(get).toHaveBeenCalledWith("/catalog/products/ly%20gi%E1%BA%A5y/customization", {
      signal: expect.any(AbortSignal), // no `sku` hint: that is for the design mock only
    });
  });

  it("reads a design's print configuration from its own template, under its own key", async () => {
    const get = vi.spyOn(api, "get").mockImplementation(async (url) => ({
      data: url.endsWith("/template")
        ? { ...templateDto(), active: true }
        : customizationDto([templateDto({ hasCartonSpec: true })]),
    }));
    const { wrapper, client } = setup();
    const { result } = renderHook(() => useDesignPrintConfig(design()), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({ sku: templateDto().sku, hasCartonSpec: true });
    expect(get.mock.calls.map(([url]) => url)).toContain(`/designs/${id}/template`);
    expect(client.getQueryData(printConfigKeys.design(id))).toBeDefined();
  });

  it("does not read anything until the design is", () => {
    const get = vi.spyOn(api, "get");
    const { wrapper } = setup();
    renderHook(() => useDesignPrintConfig(undefined), { wrapper });
    expect(get).not.toHaveBeenCalled();
  });

  it("answers null for a product that cannot be customized (409 PRODUCT_NOT_CUSTOMIZABLE)", async () => {
    vi.spyOn(api, "get").mockImplementation(async (url) => {
      if (url.endsWith("/customization")) throw new ApiError(409, "PRODUCT_NOT_CUSTOMIZABLE", "x");
      return { data: { title: "Ly" } };
    });
    const { wrapper } = setup();
    const { result } = renderHook(() => usePrintConfig("ly", "CUP-1", true), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
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
    expect(get).toHaveBeenCalledWith(
      `/designs/${id}/assets/${ids.asset}/download-url`,
      expect.anything(),
    );
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
