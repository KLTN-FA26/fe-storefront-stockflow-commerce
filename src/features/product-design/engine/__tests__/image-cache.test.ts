// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { browserDecode, ImageCache } from "../render/image-cache";
import { jpegBytes, pngBytes } from "./fixtures";

const blob = new Blob(["x"]);

/** A decoder whose results are distinguishable: each image is `{ id }`, `bytes` per entry is fixed. */
function makeDecode(bytes = 600) {
  let n = 0;
  return vi.fn(async (_blob: Blob, maxEdge?: number) => ({
    image: { id: ++n } as unknown as CanvasImageSource,
    width: maxEdge ?? 4000,
    height: 10,
    bytes,
  }));
}

describe("ImageCache", () => {
  it("evicts the least recently used image beyond maxBytes and decodes proxies at 2048", async () => {
    const decode = vi.fn(async (_b: Blob, maxEdge?: number) => ({
      image: {} as CanvasImageSource,
      width: maxEdge ?? 4000,
      height: 10,
      bytes: 600,
    }));
    const cache = new ImageCache({ maxBytes: 1000, decode });
    await cache.load("a", blob, "proxy");
    await cache.load("b", blob, "proxy");
    expect(decode).toHaveBeenCalledWith(blob, 2048);
    expect(cache.get("a", "proxy")).toBeUndefined();
    expect(cache.get("b", "proxy")).toBeDefined();
  });

  it("treats a read as a use: the untouched image is evicted first", async () => {
    const cache = new ImageCache({ maxBytes: 1000, decode: makeDecode(400) });
    await cache.load("a", blob, "proxy");
    await cache.load("b", blob, "proxy");
    expect(cache.get("a", "proxy")).toBeDefined();
    await cache.load("c", blob, "proxy");
    expect(cache.get("a", "proxy")).toBeDefined();
    expect(cache.get("b", "proxy")).toBeUndefined();
    expect(cache.get("c", "proxy")).toBeDefined();
  });

  it("decodes the full variant without an edge limit and caches variants separately", async () => {
    const decode = makeDecode(10);
    const cache = new ImageCache({ maxBytes: 1000, decode });
    const proxy = await cache.load("a", blob, "proxy");
    const full = await cache.load("a", blob, "full");
    expect(decode).toHaveBeenNthCalledWith(1, blob, 2048);
    expect(decode).toHaveBeenNthCalledWith(2, blob);
    expect(full).not.toBe(proxy);
    expect(cache.get("a", "proxy")).toBe(proxy);
    expect(cache.get("a", "full")).toBe(full);
  });

  it("returns the cached image without decoding again", async () => {
    const decode = makeDecode(10);
    const cache = new ImageCache({ maxBytes: 1000, decode });
    const first = await cache.load("a", blob, "proxy");
    const second = await cache.load("a", blob, "proxy");
    expect(second).toBe(first);
    expect(decode).toHaveBeenCalledTimes(1);
  });

  it("shares one decode between concurrent loads of the same image", async () => {
    const decode = makeDecode(10);
    const cache = new ImageCache({ maxBytes: 1000, decode });
    const [one, two] = await Promise.all([
      cache.load("a", blob, "proxy"),
      cache.load("a", blob, "proxy"),
    ]);
    expect(two).toBe(one);
    expect(decode).toHaveBeenCalledTimes(1);
  });

  it("keeps a single image larger than the budget so the caller can still draw it", async () => {
    const cache = new ImageCache({ maxBytes: 100, decode: makeDecode(600) });
    const image = await cache.load("big", blob, "full");
    expect(cache.get("big", "full")).toBe(image);
    await cache.load("other", blob, "full");
    expect(cache.get("big", "full")).toBeUndefined();
    expect(cache.get("other", "full")).toBeDefined();
  });

  it("does not cache a failed decode and lets the next load retry", async () => {
    const decode = vi
      .fn<(b: Blob, maxEdge?: number) => ReturnType<ReturnType<typeof makeDecode>>>()
      .mockRejectedValueOnce(new Error("corrupt"))
      .mockImplementation(makeDecode(10));
    const cache = new ImageCache({ maxBytes: 1000, decode });
    await expect(cache.load("a", blob, "proxy")).rejects.toThrow("corrupt");
    expect(cache.get("a", "proxy")).toBeUndefined();
    await expect(cache.load("a", blob, "proxy")).resolves.toBeDefined();
    expect(decode).toHaveBeenCalledTimes(2);
  });

  it("closes an evicted image so its memory is released, and only that one", async () => {
    const closes: string[] = [];
    let n = 0;
    const decode = vi.fn(async () => {
      const id = `img-${n++}`;
      const image = { id, close: () => closes.push(id) } as unknown as CanvasImageSource;
      return { image, width: 10, height: 10, bytes: 600 };
    });
    const cache = new ImageCache({ maxBytes: 1000, decode });
    await cache.load("a", blob, "proxy");
    expect(closes).toEqual([]);
    await cache.load("b", blob, "proxy");
    expect(closes).toEqual(["img-0"]);
    expect(cache.get("b", "proxy")).toBeDefined();
    await cache.load("c", blob, "proxy");
    expect(closes).toEqual(["img-0", "img-1"]);
  });

  it("evicts an image that cannot be closed (a canvas or an <img>) without trouble", async () => {
    const decode = vi.fn(async () => ({
      image: {} as CanvasImageSource,
      width: 10,
      height: 10,
      bytes: 600,
    }));
    const cache = new ImageCache({ maxBytes: 1000, decode });
    await cache.load("a", blob, "proxy");
    await expect(cache.load("b", blob, "proxy")).resolves.toBeDefined();
    expect(cache.get("a", "proxy")).toBeUndefined();
  });

  it("never evicts a pinned image, evicting the unpinned ones instead, and asks again on each load", async () => {
    const pinned = new Set(["logo"]);
    const cache = new ImageCache({
      maxBytes: 1000,
      decode: makeDecode(600),
      isPinned: (assetId, variant) => variant === "proxy" && pinned.has(assetId),
    });
    await cache.load("logo", blob, "proxy");
    await cache.load("a", blob, "proxy"); // over budget, but the only candidate is pinned
    expect(cache.get("logo", "proxy")).toBeDefined();
    expect(cache.get("a", "proxy")).toBeDefined();

    await cache.load("b", blob, "proxy");
    expect(cache.get("a", "proxy")).toBeUndefined();
    expect(cache.get("logo", "proxy")).toBeDefined();
    expect(cache.get("b", "proxy")).toBeDefined();

    // Unpinned later (the image left the document): the next load may evict it like any other.
    pinned.delete("logo");
    await cache.load("c", blob, "proxy");
    expect(cache.get("logo", "proxy")).toBeUndefined();
    expect(cache.get("c", "proxy")).toBeDefined();
  });

  it("pins per variant: the full image of a pinned proxy can still be evicted", async () => {
    const cache = new ImageCache({
      maxBytes: 1000,
      decode: makeDecode(600),
      isPinned: (_assetId, variant) => variant === "proxy",
    });
    await cache.load("logo", blob, "full");
    await cache.load("logo", blob, "proxy");
    expect(cache.get("logo", "full")).toBeUndefined();
    expect(cache.get("logo", "proxy")).toBeDefined();
  });

  it("clears every image on request and closes each one", async () => {
    const closes: string[] = [];
    let n = 0;
    const decode = vi.fn(async () => {
      const id = `img-${n++}`;
      const image = { id, close: () => closes.push(id) } as unknown as CanvasImageSource;
      return { image, width: 10, height: 10, bytes: 600 };
    });
    const cache = new ImageCache({ maxBytes: 10_000, decode, isPinned: () => true });
    await cache.load("a", blob, "full");
    await cache.load("b", blob, "full");

    cache.clear();

    expect(closes).toEqual(["img-0", "img-1"]);
    expect(cache.get("a", "full")).toBeUndefined();
    // The budget starts over: a new image is decoded and kept.
    await cache.load("a", blob, "full");
    expect(cache.get("a", "full")).toBeDefined();
    expect(decode).toHaveBeenCalledTimes(3);
  });

  it("returns undefined for an image that was never loaded", () => {
    const cache = new ImageCache({ maxBytes: 1000, decode: makeDecode() });
    expect(cache.get("nope", "proxy")).toBeUndefined();
  });
});

describe("browserDecode", () => {
  type Size = { width: number; height: number };
  type Options = { resizeWidth?: number; resizeHeight?: number };

  /**
   * `createImageBitmap` as a browser does it, on fakes: a file decodes to `shown` (its size after
   * any EXIF turn), a resize option keeps the aspect when only one side is named, and every call is
   * recorded with the bitmap it made.
   */
  function stubDecoder(shown: Size) {
    const made: { from: "file" | "bitmap"; options?: Options; close: ReturnType<typeof vi.fn> }[] =
      [];
    const decode = vi.fn(async (source: Blob | Size, options?: Options) => {
      const base = source instanceof Blob ? shown : source;
      const width =
        options?.resizeWidth ??
        (options?.resizeHeight
          ? Math.ceil((base.width * options.resizeHeight) / base.height)
          : base.width);
      const height =
        options?.resizeHeight ??
        (options?.resizeWidth
          ? Math.ceil((base.height * options.resizeWidth) / base.width)
          : base.height);
      const close = vi.fn();
      made.push({
        from: source instanceof Blob ? "file" : "bitmap",
        ...(options ? { options } : {}),
        close,
      });
      return { width, height, close };
    });
    vi.stubGlobal("createImageBitmap", decode);
    return made;
  }
  afterEach(() => vi.unstubAllGlobals());

  it("resamples a large image in the decode itself, never holding the original whole", async () => {
    const made = stubDecoder({ width: 8000, height: 4000 });
    const image = await browserDecode(new Blob([pngBytes(8000, 4000)]), 2048);
    expect(made).toEqual([
      {
        from: "file",
        options: { resizeWidth: 2048, resizeQuality: "high" },
        close: expect.any(Function),
      },
    ]);
    expect(image).toMatchObject({ width: 2048, height: 1024, bytes: 2048 * 1024 * 4 });
  });

  it("names the longest side of a portrait image, and resamples again what an EXIF turn made longer", async () => {
    const portrait = stubDecoder({ width: 3000, height: 6000 });
    expect(await browserDecode(new Blob([pngBytes(3000, 6000)]), 2048)).toMatchObject({
      width: 1024,
      height: 2048,
    });
    expect(portrait[0]?.options).toEqual({ resizeHeight: 2048, resizeQuality: "high" });

    vi.unstubAllGlobals();
    // Stored 4032 × 3024, shown upright 3024 × 4032 (EXIF orientation 6).
    const turned = stubDecoder({ width: 3024, height: 4032 });
    const image = await browserDecode(new Blob([jpegBytes(4032, 3024)]), 2048);
    expect(turned.map(({ from }) => from)).toEqual(["file", "bitmap"]);
    expect(turned[0]!.close).toHaveBeenCalled();
    expect(Math.max(image.width, image.height)).toBe(2048);
  });

  it("decodes whole, then resamples, an image whose header it cannot read", async () => {
    const made = stubDecoder({ width: 5000, height: 2500 });
    const image = await browserDecode(new Blob([new Uint8Array([1, 2, 3, 4])]), 2048);
    expect(made.map(({ from, options }) => [from, options])).toEqual([
      ["file", undefined],
      ["bitmap", { resizeWidth: 2048, resizeHeight: 1024, resizeQuality: "high" }],
    ]);
    expect(image).toMatchObject({ width: 2048, height: 1024 });
  });

  it("leaves a small image, and the full variant, as they are", async () => {
    const made = stubDecoder({ width: 1200, height: 800 });
    await browserDecode(new Blob([pngBytes(1200, 800)]), 2048);
    await browserDecode(new Blob([pngBytes(1200, 800)]));
    expect(made.map(({ from, options }) => [from, options])).toEqual([
      ["file", undefined],
      ["file", undefined],
    ]);
  });
});
