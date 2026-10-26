import { readImageDimensions } from "../assets/image-header";

export type ImageVariant = "proxy" | "full";

export type DecodedImage = {
  image: CanvasImageSource;
  width: number;
  height: number;
  /** Memory the decoded image holds (what the cache budget counts). */
  bytes: number;
};

export type Decode = (blob: Blob, maxEdge?: number) => Promise<DecodedImage>;

/** Longest edge of the screen proxy: enough for a 2048 px texture, a fraction of a 40 MP original. */
export const PROXY_MAX_EDGE = 2048;

const BYTES_PER_PIXEL = 4;

function describe(bitmap: ImageBitmap): DecodedImage {
  const { width, height } = bitmap;
  return { image: bitmap, width, height, bytes: width * height * BYTES_PER_PIXEL };
}

/**
 * Bytes read for the header: a JPEG's frame header can sit behind an EXIF block with a thumbnail.
 * A header past this is not found, and the image is decoded whole first, as before.
 */
const HEADER_BYTES = 256 * 1024;

/** The stored size of `blob` from its header, or `null` (not a PNG, JPEG or WebP, or cut short). */
async function headerSize(blob: Blob) {
  try {
    return readImageDimensions(new Uint8Array(await blob.slice(0, HEADER_BYTES).arrayBuffer()));
  } catch {
    return null;
  }
}

/** `bitmap` resampled so its longest edge is `maxEdge` (the original is closed), or as it is. */
async function fitWithin(bitmap: ImageBitmap, maxEdge: number): Promise<ImageBitmap> {
  const longest = Math.max(bitmap.width, bitmap.height);
  if (longest <= maxEdge) return bitmap;
  const k = maxEdge / longest;
  try {
    return await createImageBitmap(bitmap, {
      resizeWidth: Math.max(1, Math.round(bitmap.width * k)),
      resizeHeight: Math.max(1, Math.round(bitmap.height * k)),
      resizeQuality: "high",
    });
  } finally {
    bitmap.close();
  }
}

/**
 * Decodes with `createImageBitmap`, off the main thread. With `maxEdge` an image longer than that
 * is resampled so its longest edge is `maxEdge` (aspect kept); a smaller one is left as it is. The
 * resample happens in the decode when the header gives the size, so a 40 MP original is never
 * held whole for a 2048 px proxy. Only the longest side is named: a JPEG's EXIF orientation may
 * turn the stored size, and the browser keeps the aspect of the turned image; a result still
 * longer than `maxEdge` (turned, or a browser that ignores the option) is resampled once more.
 */
export async function browserDecode(blob: Blob, maxEdge?: number): Promise<DecodedImage> {
  if (maxEdge === undefined) return describe(await createImageBitmap(blob));
  const header = await headerSize(blob);
  const decoded =
    header !== null && Math.max(header.width, header.height) > maxEdge
      ? await createImageBitmap(blob, {
          ...(header.width >= header.height ? { resizeWidth: maxEdge } : { resizeHeight: maxEdge }),
          resizeQuality: "high",
        })
      : await createImageBitmap(blob);
  return describe(await fitWithin(decoded, maxEdge));
}

/** Whether an image must stay cached whatever the budget (e.g. the document on screen places it). */
export type IsPinned = (assetId: string, variant: ImageVariant) => boolean;

type Entry = { image: CanvasImageSource; bytes: number; assetId: string; variant: ImageVariant };

/**
 * Decoded images by asset and variant, within a byte budget: when a load pushes the total past
 * `maxBytes` the least recently used images (read or loaded longest ago) are dropped, except pinned
 * ones (`isPinned`, asked at each load). The image just loaded is always kept, even alone over
 * budget, so the caller can draw what it asked for; pinned images may keep the total over budget
 * too. An evicted `ImageBitmap` is closed (its pixels are native memory the GC does not see);
 * callers must `get` an image again for each paint rather than hold one across loads.
 */
export class ImageCache {
  private readonly maxBytes: number;
  private readonly decode: Decode;
  private readonly isPinned: IsPinned;
  /** Least recently used first: a `Map` iterates in insertion order and a use re-inserts. */
  private readonly entries = new Map<string, Entry>();
  private readonly pending = new Map<string, Promise<CanvasImageSource>>();
  private totalBytes = 0;

  constructor(opts: { maxBytes: number; decode?: Decode; isPinned?: IsPinned }) {
    this.maxBytes = opts.maxBytes;
    this.decode = opts.decode ?? browserDecode;
    this.isPinned = opts.isPinned ?? (() => false);
  }

  /** The decoded image if it is cached (and counts as used), else `undefined`. */
  get(assetId: string, variant: ImageVariant): CanvasImageSource | undefined {
    const key = `${variant}:${assetId}`;
    const entry = this.entries.get(key);
    if (entry === undefined) return undefined;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.image;
  }

  /**
   * Decodes `blob` (the proxy variant at most `PROXY_MAX_EDGE` px on its longest edge, the full
   * variant as is) and caches it. A cached image is returned as is, and concurrent loads of the
   * same image share one decode; a failed decode is not cached, so the next call retries.
   */
  load(assetId: string, blob: Blob, variant: ImageVariant): Promise<CanvasImageSource> {
    const cached = this.get(assetId, variant);
    if (cached !== undefined) return Promise.resolve(cached);

    const key = `${variant}:${assetId}`;
    const inFlight = this.pending.get(key);
    if (inFlight !== undefined) return inFlight;

    const decoding = variant === "proxy" ? this.decode(blob, PROXY_MAX_EDGE) : this.decode(blob);
    const loaded = decoding
      .then(({ image, bytes }) => {
        this.store(key, { image, bytes, assetId, variant });
        return image;
      })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, loaded);
    return loaded;
  }

  /** Drops every image, closing each; what is still decoding is kept once it arrives. */
  clear(): void {
    for (const { image } of this.entries.values()) (image as { close?: () => void }).close?.();
    this.entries.clear();
    this.totalBytes = 0;
  }

  private store(key: string, entry: Entry): void {
    this.totalBytes += entry.bytes - (this.entries.get(key)?.bytes ?? 0);
    this.entries.delete(key);
    this.entries.set(key, entry);
    for (const [candidate, old] of this.entries) {
      if (this.totalBytes <= this.maxBytes) break;
      if (candidate === key || this.isPinned(old.assetId, old.variant)) continue;
      this.entries.delete(candidate);
      this.totalBytes -= old.bytes;
      (old.image as { close?: () => void }).close?.();
    }
  }
}
