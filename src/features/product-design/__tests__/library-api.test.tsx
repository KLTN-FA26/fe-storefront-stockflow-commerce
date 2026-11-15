import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";

import {
  deleteLibraryItem,
  listProjectLibrary,
  placeFromLibrary,
  saveImageToLibrary,
  saveTextStyle,
  uploadLibraryImage,
} from "../api";
import { describeDesignError, fileRuleOf } from "../errors";
import {
  libraryImageSchema,
  libraryItemSchema,
  libraryTextInputSchema,
  libraryTextSchema,
  textStyleSchema,
} from "../library-schemas";
import {
  useDeleteLibraryItem,
  usePlaceFromLibrary,
  useSaveImageToLibrary,
  useSaveTextStyle,
  useUploadLibraryImage,
} from "../mutations";
import { designKeys, projectKeys, useProjectLibrary } from "../queries";
import { assetDto, ids } from "./fixtures";
import { libraryImageDto, libraryTextDto, textStyleDto } from "./project-fixtures";

afterEach(() => vi.restoreAllMocks());

const pid = ids.project;
const did = ids.design;
const style = textStyleSchema.parse(textStyleDto());

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
const invalidated = (spy: ReturnType<typeof setup>["invalidate"]) =>
  spy.mock.calls.map(([filters]) => filters);

describe("the library DTOs", () => {
  it("parses an image and a text style by their kind", () => {
    const image = libraryItemSchema.parse(libraryImageDto());
    const text = libraryItemSchema.parse(libraryTextDto());
    expect(image.kind === "IMAGE" && image.asset.widthPx).toBe(1200);
    expect(text.kind === "TEXT" && text.style.fontCode).toBe("be-vietnam-pro");
  });

  it("refuses an image without its asset, a text without its style, and an unknown kind", () => {
    const { asset: _asset, ...noAsset } = libraryImageDto();
    const { style: _style, ...noStyle } = libraryTextDto();
    expect(libraryItemSchema.safeParse(noAsset).success).toBe(false);
    expect(libraryItemSchema.safeParse(noStyle).success).toBe(false);
    expect(libraryItemSchema.safeParse(libraryImageDto({ kind: "VIDEO" })).success).toBe(false);
    expect(libraryImageSchema.safeParse(libraryTextDto()).success).toBe(false);
    expect(libraryTextSchema.safeParse(libraryImageDto()).success).toBe(false);
  });

  it("holds a text style to the fields of a text element", () => {
    for (const bad of [
      { fontCode: "" },
      { sizePt: 0 },
      { color: "red" },
      { align: "justify" },
      { lineHeight: 0 },
      { outline: { color: "#FFFFFF", widthMm: 0 } },
    ]) {
      expect(
        libraryTextSchema.safeParse(libraryTextDto({ style: textStyleDto(bad) })).success,
      ).toBe(false);
    }
    const { bold: _bold, ...noBold } = textStyleDto();
    expect(libraryTextSchema.safeParse(libraryTextDto({ style: noBold })).success).toBe(false);
    const withOutline = textStyleDto({ outline: { color: "#FFFFFF", widthMm: 0.5 } });
    expect(libraryTextSchema.parse(libraryTextDto({ style: withOutline })).style.outline).toEqual({
      color: "#FFFFFF",
      widthMm: 0.5,
    });
  });

  it("takes no uppercase field yet (a later plan adds it)", () => {
    const parsed = libraryTextSchema.parse(
      libraryTextDto({ style: textStyleDto({ uppercase: true }) }),
    );
    expect(parsed.style).not.toHaveProperty("uppercase");
  });

  it("limits the text input to 1..500 characters and trims it", () => {
    expect(libraryTextInputSchema.parse({ text: "  Chào  ", style }).text).toBe("Chào");
    expect(libraryTextInputSchema.safeParse({ text: "   ", style }).success).toBe(false);
    expect(libraryTextInputSchema.safeParse({ text: "a".repeat(500), style }).success).toBe(true);
    expect(libraryTextInputSchema.safeParse({ text: "a".repeat(501), style }).success).toBe(false);
  });
});

describe("the library API calls", () => {
  it("lists the library of a project", async () => {
    const get = vi
      .spyOn(api, "get")
      .mockResolvedValueOnce({ data: [libraryTextDto(), libraryImageDto()] });
    const items = await listProjectLibrary(pid);
    expect(get).toHaveBeenCalledWith(`/design-projects/${pid}/library`, {});
    expect(items.map((i) => i.kind)).toEqual(["TEXT", "IMAGE"]);
  });

  it("uploads an image as multipart with its idempotency key", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValueOnce({ data: libraryImageDto() });
    const file = new File([new Uint8Array([1, 2])], "logo.png", { type: "image/png" });

    const item = await uploadLibraryImage(pid, file, "logo.png", "key-1");

    const [url, body, config] = post.mock.calls[0]!;
    expect(url).toBe(`/design-projects/${pid}/library/images`);
    expect((body as FormData).get("file")).toBeInstanceOf(Blob);
    expect(config).toMatchObject({ headers: { "Idempotency-Key": "key-1" } });
    expect(item.kind).toBe("IMAGE");
  });

  it("saves a design's image, and a text style, in the library", async () => {
    const post = vi
      .spyOn(api, "post")
      .mockResolvedValueOnce({ data: libraryImageDto() })
      .mockResolvedValueOnce({ data: libraryTextDto() });

    await saveImageToLibrary(pid, { designId: did, assetId: ids.asset });
    const text = await saveTextStyle(pid, { text: " Xin chào ", style });

    expect(post.mock.calls[0]).toEqual([
      `/design-projects/${pid}/library/images/from-design`,
      { designId: did, assetId: ids.asset },
    ]);
    expect(post.mock.calls[1]![0]).toBe(`/design-projects/${pid}/library/texts`);
    expect(post.mock.calls[1]![1]).toMatchObject({ text: "Xin chào" });
    expect(text.kind).toBe("TEXT");
  });

  it("sends nothing the input schema refuses", async () => {
    const post = vi.spyOn(api, "post");
    await expect(saveTextStyle(pid, { text: "  ", style })).rejects.toThrow();
    expect(post).not.toHaveBeenCalled();
  });

  it("deletes an item and places one in a design", async () => {
    const del = vi.spyOn(api, "delete").mockResolvedValueOnce({
      data: libraryImageDto({ previewUrl: null }),
    });
    const post = vi.spyOn(api, "post").mockResolvedValueOnce({ data: assetDto });

    const removed = await deleteLibraryItem(pid, "a b");
    const asset = await placeFromLibrary(did, ids.asset);

    expect(del).toHaveBeenCalledWith(`/design-projects/${pid}/library/a%20b`);
    expect(removed.kind).toBe("IMAGE");
    expect(post).toHaveBeenCalledWith(`/designs/${did}/assets/from-library`, {
      libraryItemId: ids.asset,
    });
    expect(asset.assetId).toBe(ids.asset);
  });

  it("throws on an answer that breaks the contract", async () => {
    vi.spyOn(api, "get").mockResolvedValueOnce({ data: [{ id: "x", kind: "IMAGE" }] });
    await expect(listProjectLibrary(pid)).rejects.toThrow();
  });
});

describe("the library query and its key", () => {
  it("nests the library key under the project's detail key", () => {
    expect(projectKeys.library(pid)).toEqual([...projectKeys.detail(pid), "library"]);
  });

  it("useProjectLibrary reads the list", async () => {
    vi.spyOn(api, "get").mockResolvedValueOnce({ data: [libraryImageDto()] });
    const { wrapper } = setup();
    const { result } = renderHook(() => useProjectLibrary(pid), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
  });
});

describe("what the library writes re-read", () => {
  // The library and the history sit under the project's key: invalidating that prefix re-reads
  // them; each is checked as covered by a key that was invalidated, not as an exact entry.
  const expectLibraryReRead = (spy: ReturnType<typeof setup>["invalidate"]) => {
    const keys = invalidated(spy).map((filters) => filters?.queryKey ?? []);
    const covered = (target: readonly unknown[]) =>
      keys.some((key) => key.every((part, i) => part === target[i]));
    expect(covered(projectKeys.library(pid))).toBe(true);
    expect(covered(projectKeys.history(pid))).toBe(true);
    expect(keys).toContainEqual(projectKeys.detail(pid)); // updatedAt moved
    expect(keys).toContainEqual(projectKeys.lists());
  };

  it("useUploadLibraryImage re-reads the library and the project's history", async () => {
    vi.spyOn(api, "post").mockResolvedValueOnce({ data: libraryImageDto() });
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useUploadLibraryImage(pid), { wrapper });
    result.current.mutate({
      file: new File([new Uint8Array([1])], "a.png", { type: "image/png" }),
      name: "a.png",
      idempotencyKey: "k",
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expectLibraryReRead(invalidate);
  });

  it("useSaveImageToLibrary and useSaveTextStyle re-read the library", async () => {
    vi.spyOn(api, "post")
      .mockResolvedValueOnce({ data: libraryImageDto() })
      .mockResolvedValueOnce({ data: libraryTextDto() });
    const image = setup();
    const a = renderHook(() => useSaveImageToLibrary(pid), { wrapper: image.wrapper });
    a.result.current.mutate({ designId: did, assetId: ids.asset });
    await waitFor(() => expect(a.result.current.isSuccess).toBe(true));
    expectLibraryReRead(image.invalidate);

    const text = setup();
    const b = renderHook(() => useSaveTextStyle(pid), { wrapper: text.wrapper });
    b.result.current.mutate({ text: "Chào", style });
    await waitFor(() => expect(b.result.current.isSuccess).toBe(true));
    expectLibraryReRead(text.invalidate);
  });

  it("useDeleteLibraryItem re-reads the library and leaves every design's assets alone (BR-18)", async () => {
    vi.spyOn(api, "delete").mockResolvedValueOnce({ data: libraryImageDto({ previewUrl: null }) });
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useDeleteLibraryItem(pid), { wrapper });
    result.current.mutate("item-1");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expectLibraryReRead(invalidate);
    expect(invalidated(invalidate)).not.toContainEqual({ queryKey: designKeys.assets(did) });
  });

  it("a refused library write (full, closed) re-reads the project", async () => {
    vi.spyOn(api, "post").mockRejectedValueOnce(new ApiError(422, "LIBRARY_FULL", "x"));
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useSaveTextStyle(pid), { wrapper });
    result.current.mutate({ text: "Chào", style });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidated(invalidate)).toContainEqual({ queryKey: projectKeys.detail(pid) });
  });

  it("a refusal that changes nothing (a wrong file, a bad text) re-reads nothing", async () => {
    vi.spyOn(api, "post").mockRejectedValueOnce(new ApiError(422, "FILE_REJECTED", "x"));
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useUploadLibraryImage(pid), { wrapper });
    result.current.mutate({
      file: new File([new Uint8Array([1])], "a.gif", { type: "image/gif" }),
      name: "a.gif",
      idempotencyKey: "k",
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidated(invalidate)).toEqual([]);
  });

  it("a project closed meanwhile (PROJECT_ARCHIVED) re-reads the project", async () => {
    vi.spyOn(api, "delete").mockRejectedValueOnce(new ApiError(409, "PROJECT_ARCHIVED", "x"));
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useDeleteLibraryItem(pid), { wrapper });
    result.current.mutate("item-1");
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidated(invalidate)).toContainEqual({ queryKey: projectKeys.detail(pid) });
  });

  it("usePlaceFromLibrary re-reads the design's assets, not the library", async () => {
    vi.spyOn(api, "post").mockResolvedValueOnce({ data: assetDto });
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => usePlaceFromLibrary(did), { wrapper });
    result.current.mutate("item-1");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidated(invalidate)).toContainEqual({ queryKey: designKeys.assets(did) });
    expect(invalidated(invalidate)).not.toContainEqual({ queryKey: projectKeys.library(pid) });
  });

  it("usePlaceFromLibrary re-reads the design when it moved on or is gone", async () => {
    vi.spyOn(api, "post").mockRejectedValueOnce(new ApiError(409, "INVALID_STATE", "x"));
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => usePlaceFromLibrary(did), { wrapper });
    result.current.mutate("item-1");
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidated(invalidate)).toContainEqual({
      queryKey: designKeys.detail(did),
      exact: true,
    });
  });

  it("usePlaceFromLibrary re-reads the design when it left the project (422 NOT_IN_PROJECT)", async () => {
    vi.spyOn(api, "post").mockRejectedValueOnce(new ApiError(422, "NOT_IN_PROJECT", "x"));
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => usePlaceFromLibrary(did), { wrapper });
    result.current.mutate("item-1");
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidated(invalidate)).toContainEqual({
      queryKey: designKeys.detail(did),
      exact: true,
    });
  });
});

describe("the library's error codes", () => {
  it("words NOT_IN_PROJECT", () => {
    expect(describeDesignError(new ApiError(422, "NOT_IN_PROJECT", "x"))).toBe(
      "Bản thiết kế này không thuộc dự án của thư viện.",
    );
  });

  it("words LIBRARY_FULL", () => {
    expect(describeDesignError(new ApiError(422, "LIBRARY_FULL", "x"))).toBe(
      "Thư viện đã đủ số lượng cho phép (30 ảnh, 30 mẫu chữ).",
    );
  });

  it("words FILE_RULE by the rule that failed, and generally without details", () => {
    const format = new ApiError(422, "FILE_RULE", "x", undefined, undefined, {
      rule: "FORMAT",
      contentType: "image/jpeg",
      formats: ["image/png"],
    });
    const size = new ApiError(422, "FILE_RULE", "x", undefined, undefined, {
      rule: "FILE_SIZE",
      sizeBytes: 2_097_152,
      maxFileSizeMb: 1,
    });
    expect(fileRuleOf(format)).toEqual({
      rule: "FORMAT",
      contentType: "image/jpeg",
      formats: ["image/png"],
    });
    expect(describeDesignError(format)).toBe("Quy cách này chỉ nhận ảnh PNG.");
    expect(describeDesignError(size)).toBe("Ảnh vượt 1 MB, mức quy cách này cho phép.");
    expect(fileRuleOf(new ApiError(422, "FILE_RULE", "x"))).toBeNull();
    expect(describeDesignError(new ApiError(422, "FILE_RULE", "x"))).toBe(
      "Ảnh không đúng ràng buộc tệp của quy cách này.",
    );
  });
});
