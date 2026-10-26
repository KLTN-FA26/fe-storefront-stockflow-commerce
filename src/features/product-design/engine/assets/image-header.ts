export type ImageHeaderType = "image/png" | "image/jpeg" | "image/webp";

export type ImageHeader = { width: number; height: number; type: ImageHeaderType };

/** Whether the bytes at `at` spell `text` (ASCII). */
function hasText(bytes: Uint8Array, at: number, text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (bytes[at + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

const u16be = (b: Uint8Array, at: number) => ((b[at] ?? 0) << 8) | (b[at + 1] ?? 0);
const u32be = (b: Uint8Array, at: number) => (u16be(b, at) * 0x10000 + u16be(b, at + 2)) >>> 0;
const u16le = (b: Uint8Array, at: number) => (b[at] ?? 0) | ((b[at + 1] ?? 0) << 8);
const u24le = (b: Uint8Array, at: number) => u16le(b, at) | ((b[at + 2] ?? 0) << 16);

/** An image has pixels in both directions or it is not one. */
const sized = (width: number, height: number, type: ImageHeaderType): ImageHeader | null =>
  width > 0 && height > 0 ? { width, height, type } : null;

/** The IHDR chunk follows the 8-byte signature: length, "IHDR", width, height (big-endian). */
function readPng(b: Uint8Array): ImageHeader | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length < 24 || !signature.every((byte, i) => b[i] === byte)) return null;
  if (!hasText(b, 12, "IHDR")) return null;
  return sized(u32be(b, 16), u32be(b, 20), "image/png");
}

/** Frame headers (SOF0–SOF15) except DHT (C4), JPG (C8) and DAC (CC), which share the range. */
const isFrameMarker = (marker: number) =>
  marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

/** Markers that stand alone, with no length: TEM, RSTn, SOI and EOI. */
const isStandalone = (marker: number) => marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9);

/** Walks the segments after SOI until a frame header: precision, height, width (big-endian). */
function readJpeg(b: Uint8Array): ImageHeader | null {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let at = 2;
  while (at + 3 < b.length) {
    if (b[at] !== 0xff) return null; // not at a marker: the stream is damaged
    const marker = b[at + 1] ?? 0;
    if (marker === 0xff) {
      at += 1; // fill byte before a marker
      continue;
    }
    if (isStandalone(marker)) {
      at += 2;
      continue;
    }
    if (marker === 0xda) return null; // the scan starts without a frame header
    if (isFrameMarker(marker)) {
      if (at + 9 > b.length) return null;
      return sized(u16be(b, at + 7), u16be(b, at + 5), "image/jpeg");
    }
    at += 2 + u16be(b, at + 2);
  }
  return null;
}

/** RIFF/WEBP: the first chunk is lossy "VP8 ", lossless "VP8L" or extended "VP8X". */
function readWebp(b: Uint8Array): ImageHeader | null {
  if (!hasText(b, 0, "RIFF") || !hasText(b, 8, "WEBP")) return null;
  if (hasText(b, 12, "VP8X")) {
    if (b.length < 30) return null;
    return sized(u24le(b, 24) + 1, u24le(b, 27) + 1, "image/webp");
  }
  if (hasText(b, 12, "VP8L")) {
    if (b.length < 25 || b[20] !== 0x2f) return null;
    const bits = (u16le(b, 21) | (u16le(b, 23) << 16)) >>> 0;
    return sized((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1, "image/webp");
  }
  if (hasText(b, 12, "VP8 ")) {
    if (b.length < 30 || b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return sized(u16le(b, 26) & 0x3fff, u16le(b, 28) & 0x3fff, "image/webp");
  }
  return null;
}

/**
 * The pixel size and the kind of a PNG, JPEG or WebP, read from its header alone (no decoding, so
 * a 40 MP file costs the same as a thumbnail); `null` when the bytes are none of these or the
 * header is cut short. The size is the stored one: a JPEG's EXIF orientation is not applied,
 * which leaves the pixel count (what the limit is about) as it is.
 */
export function readImageDimensions(bytes: Uint8Array): ImageHeader | null {
  return readPng(bytes) ?? readJpeg(bytes) ?? readWebp(bytes);
}
