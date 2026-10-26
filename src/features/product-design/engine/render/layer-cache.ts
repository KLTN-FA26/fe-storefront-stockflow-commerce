/** Rasters `RenderEnv.layerCache` keeps; the least recently used one goes first. */
export const MAX_CACHED_LAYERS = 64;

/** A cache read that counts as a use: the entry moves to the back of the `Map`'s insertion order. */
export function recallLayer(
  cache: Map<string, CanvasImageSource>,
  key: string,
): CanvasImageSource | undefined {
  const hit = cache.get(key);
  if (hit !== undefined) {
    cache.delete(key);
    cache.set(key, hit);
  }
  return hit;
}

/** Stores `layer` under `key` (replacing what was there), then drops the oldest past the bound. */
export function rememberLayer(
  cache: Map<string, CanvasImageSource>,
  key: string,
  layer: CanvasImageSource,
): void {
  cache.delete(key);
  cache.set(key, layer);
  for (const oldest of cache.keys()) {
    if (cache.size <= MAX_CACHED_LAYERS) break;
    cache.delete(oldest);
  }
}

/**
 * A 53-bit hash of `text` (cyrb53), with its length: a short cache key for content that can run to
 * megabytes (a drawing's stroke points), where the content itself would make a huge `Map` key.
 */
export function contentHash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hash = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return `${hash.toString(36)}.${text.length.toString(36)}`;
}
