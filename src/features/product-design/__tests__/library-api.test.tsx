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
import { describeDesignError } from "../errors";
import { toLibraryImage, toLibraryText } from "../project-mappers";
import { projectAssetDtoSchema, projectTextDtoSchema } from "../project-dtos";
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
import {
  libraryImageDto,
  libraryTextDto,
  projectAssetDto,
  projectTextDto,
  textStyleDto,
} from "./project-fixtures";

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

describe("the BE's library files and texts as the screens' items (F-33)", () => {
  it("makes an image of a library file: id from assetId, createdAt from storedAt, name from originalName", () => {
    const image = toLibraryImage(projectAssetDtoSchema.parse(projectAssetDto()), "/p.png");
    expect(image).toEqual({
      id: "7a1b0000-0000-4000-8000-0000000000a1",
      kind: "IMAGE",
      name: "logo.png",
      asset: {
        originalName: "logo.png",
        contentType: "image/png",
        widthPx: 1200,
        heightPx: 800,
        sizeBytes: 90_001,
        checksum: "c".repeat(64),
        storedAt: "2026-11-11T07:50:00Z",
      },
      previewUrl: "/p.png",
      createdAt: "2026-11-11T07:50:00Z",
    });
    expect(libraryItemSchema.parse(image)).toEqual(image); // what the screens read
  });

  it("makes a text item: a kind and a name the BE has not, its style with omitted fields defaulted", () => {
    const text = toLibraryText(
      projectTextDtoSchema.parse(
        projectTextDto({
          text: "  Xin   chào\n  quý khách, mời bạn ghé thăm quán cà phê của chúng tôi  ",
          style: {
            fontCode: "be-vietnam-pro",
            sizePt: 20,
            color: "#112233",
            align: "left",
            lineHeight: 1.3,
          },
        }),
      ),
    );
    expect(text.kind).toBe("TEXT");
    expect(text.name).toBe("Xin chào quý khách, mời bạn ghé thăm qu…");
    expect(text.name.length).toBeLessThanOrEqual(40);
    expect(text.style).toEqual({
      fontCode: "be-vietnam-pro",
      sizePt: 20,
      color: "#112233",
      bold: false,
      italic: false,
      align: "left",
      letterSpacingEm: 0,
      lineHeight: 1.3,
    });
    expect(libraryTextSchema.parse(text)).toEqual(text);
  });

  it("accepts #rgb and #rrggbbaa colours and normalises them to the studio's #RRGGBB", () => {
    const text = toLibraryText(
      projectTextDtoSchema.parse(
        projectTextDto({
          style: textStyleDto({
            color: "#f0a",
            outline: { color: "#11223380", widthMm: 0.4 },
          }),
        }),
      ),
    );
    expect(text.style.color).toBe("#FF00AA");
    expect(text.style.outline).toEqual({ color: "#112233", widthMm: 0.4 });
  });
});

describe("the library API calls", () => {
  it("lists the library: files and texts merged newest first, one preview link read per image (2 + n reads)", async () => {
    const older = "7a1b0000-0000-4000-8000-0000000000b1";
    const get = vi.spyOn(api, "get").mockImplementation(async (url: string) => {
      if (url.endsWith("/assets"))
        return {
          data: [
            projectAssetDto({ storedAt: "2026-11-11T07:50:00Z" }),
            projectAssetDto({ assetId: older, storedAt: "2026-11-09T07:50:00Z" }),
          ],
        };
      if (url.endsWith("/texts")) return { data: [projectTextDto()] };
      if (url.includes(older)) throw new ApiError(500, "INTERNAL_ERROR", "no link");
      return {
        data: { url: "https://files.example.vn/logo.png?sig=1", expiresAt: "2026-11-11T08:00:00Z" },
      };
    });

    const items = await listProjectLibrary(pid);

    expect(items.map((i) => i.kind)).toEqual(["TEXT", "IMAGE", "IMAGE"]);
    // A link that fails leaves its tile without a preview; the others have theirs.
    expect(items.map((i) => (i.kind === "IMAGE" ? i.previewUrl : "-"))).toEqual([
      "-",
      "https://files.example.vn/logo.png?sig=1",
      null,
    ]);
    expect(get.mock.calls.map(([url]) => url)).toEqual(
      expect.arrayContaining([
        `/design-projects/${pid}/assets`,
        `/design-projects/${pid}/texts`,
        `/design-projects/${pid}/assets/7a1b0000-0000-4000-8000-0000000000a1/download-url`,
        `/design-projects/${pid}/assets/${older}/download-url`,
      ]),
    );
    expect(get).toHaveBeenCalledTimes(4);
  });

  it("uploads an image as multipart with its idempotency key", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValueOnce({ data: projectAssetDto() });
    const file = new File([new Uint8Array([1, 2])], "logo.png", { type: "image/png" });

    const item = await uploadLibraryImage(pid, file, "logo.png", "key-1");

    const [url, body, config] = post.mock.calls[0]!;
    expect(url).toBe(`/design-projects/${pid}/assets`);
    expect((body as FormData).get("file")).toBeInstanceOf(Blob);
    expect(config).toMatchObject({ headers: { "Idempotency-Key": "key-1" } });
    expect(item).toMatchObject({ kind: "IMAGE", name: "logo.png", previewUrl: null });
  });

  it("saves a design's image, and a text style, in the library", async () => {
    const post = vi
      .spyOn(api, "post")
      .mockResolvedValueOnce({ data: projectAssetDto() })
      .mockResolvedValueOnce({ data: projectTextDto() });

    const image = await saveImageToLibrary(pid, { designId: did, assetId: ids.asset });
    const text = await saveTextStyle(pid, { text: " Xin chào ", style });

    expect(post.mock.calls[0]).toEqual([
      `/design-projects/${pid}/assets/from-design`,
      { designId: did, assetId: ids.asset },
    ]);
    expect(post.mock.calls[1]![0]).toBe(`/design-projects/${pid}/texts`);
    expect(post.mock.calls[1]![1]).toMatchObject({ text: "Xin chào" });
    expect(image.kind).toBe("IMAGE");
    expect(text.kind).toBe("TEXT");
  });

  it("sends nothing the input schema refuses", async () => {
    const post = vi.spyOn(api, "post");
    await expect(saveTextStyle(pid, { text: "  ", style })).rejects.toThrow();
    expect(post).not.toHaveBeenCalled();
  });

  it("deletes an item by its kind (204, no body: the item itself is the answer) and places one in a design", async () => {
    const del = vi.spyOn(api, "delete").mockResolvedValue({ data: undefined, status: 204 });
    const post = vi.spyOn(api, "post").mockResolvedValueOnce({ data: assetDto });

    const image = await deleteLibraryItem(pid, { id: "a b", kind: "IMAGE" });
    const text = await deleteLibraryItem(pid, { id: "t-1", kind: "TEXT" });
    const asset = await placeFromLibrary(did, ids.asset);

    expect(del.mock.calls.map(([url]) => url)).toEqual([
      `/design-projects/${pid}/assets/a%20b`,
      `/design-projects/${pid}/texts/t-1`,
    ]);
    expect(image).toEqual({ id: "a b", kind: "IMAGE" });
    expect(text).toEqual({ id: "t-1", kind: "TEXT" });
    expect(post).toHaveBeenCalledWith(`/designs/${did}/assets/library`, {
      assetId: ids.asset,
    });
    expect(asset.assetId).toBe(ids.asset);
  });

  it("throws on an answer that breaks the contract", async () => {
    vi.spyOn(api, "get").mockImplementation(async (url: string) =>
      url.endsWith("/assets") ? { data: [{ assetId: "x" }] } : { data: [] },
    );
    await expect(listProjectLibrary(pid)).rejects.toThrow();
  });
});

describe("the library query and its key", () => {
  it("nests the library key under the project's detail key", () => {
    expect(projectKeys.library(pid)).toEqual([...projectKeys.detail(pid), "library"]);
  });

  it("useProjectLibrary reads the list", async () => {
    vi.spyOn(api, "get").mockImplementation(async (url: string) => {
      if (url.endsWith("/assets")) return { data: [projectAssetDto()] };
      if (url.endsWith("/texts")) return { data: [] };
      return { data: { url: "/logo.png", expiresAt: "2026-11-11T08:00:00Z" } };
    });
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
    vi.spyOn(api, "post").mockResolvedValueOnce({ data: projectAssetDto() });
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
      .mockResolvedValueOnce({ data: projectAssetDto() })
      .mockResolvedValueOnce({ data: projectTextDto() });
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
    vi.spyOn(api, "delete").mockResolvedValueOnce({ data: undefined, status: 204 });
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useDeleteLibraryItem(pid), { wrapper });
    result.current.mutate({ id: "item-1", kind: "IMAGE" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expectLibraryReRead(invalidate);
    expect(invalidated(invalidate)).not.toContainEqual({ queryKey: designKeys.assets(did) });
  });

  it("a refused library write (full, closed) re-reads the project", async () => {
    vi.spyOn(api, "post").mockRejectedValueOnce(
      new ApiError(409, "DESIGN_PROJECT_LIBRARY_FULL", "x"),
    );
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useSaveTextStyle(pid), { wrapper });
    result.current.mutate({ text: "Chào", style });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidated(invalidate)).toContainEqual({ queryKey: projectKeys.detail(pid) });
  });

  it("a refusal that changes nothing (a wrong file, a bad text) re-reads nothing", async () => {
    vi.spyOn(api, "post").mockRejectedValueOnce(new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "x"));
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

  it("a project closed meanwhile (DESIGN_PROJECT_ARCHIVED) re-reads the project", async () => {
    vi.spyOn(api, "delete").mockRejectedValueOnce(
      new ApiError(409, "DESIGN_PROJECT_ARCHIVED", "x"),
    );
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useDeleteLibraryItem(pid), { wrapper });
    result.current.mutate({ id: "item-1", kind: "TEXT" });
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
    vi.spyOn(api, "post").mockRejectedValueOnce(new ApiError(409, "DESIGN_NOT_DRAFT", "x"));
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => usePlaceFromLibrary(did), { wrapper });
    result.current.mutate("item-1");
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidated(invalidate)).toContainEqual({
      queryKey: designKeys.detail(did),
      exact: true,
    });
  });

  it("usePlaceFromLibrary re-reads the design when its project no longer has the file (404)", async () => {
    vi.spyOn(api, "post").mockRejectedValueOnce(new ApiError(404, "NOT_FOUND", "x"));
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
  it("words DESIGN_PROJECT_LIBRARY_FULL", () => {
    expect(describeDesignError(new ApiError(409, "DESIGN_PROJECT_LIBRARY_FULL", "x"))).toBe(
      "Thư viện đã đủ số lượng cho phép (30 ảnh, 30 mẫu chữ).",
    );
  });

  it("words a file the BE refuses (415, 413, 429) with only a message, and a file outside the project (404)", () => {
    expect(describeDesignError(new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "x"))).toBe(
      "Tệp không đúng định dạng mà quy cách này nhận.",
    );
    expect(describeDesignError(new ApiError(413, "PAYLOAD_TOO_LARGE", "x"))).toBe(
      "Tệp vượt dung lượng cho phép.",
    );
    expect(describeDesignError(new ApiError(429, "RATE_LIMITED", "x"))).toContain("quá nhiều ảnh");
    expect(describeDesignError(new ApiError(404, "NOT_FOUND", "x"))).toBe(
      "Không tìm thấy thiết kế hoặc sản phẩm này.",
    );
  });
});
