import type { DrawingElement, ImageElement, TextElement } from "../document/schema";
import { createSizer } from "../geometry/element";
import type { Ctx2D } from "../render/execute";
import { fontSizePx, type FontRegistry, type TextMeasurer } from "../render/fonts";
import { createSurfaces } from "../surfaces";
import type { CustomizationTemplate, PrintArea } from "../template/schema";

/**
 * Shared engine test fixtures. `cup12oz` is the spec §4.3 worked example: a conical 12 oz paper
 * cup whose body band unrolls into an annular sector (trim radii 230.04–327.05 mm).
 */
export const cup12oz: CustomizationTemplate = {
  templateId: "tpl-cup12-body",
  code: "CUP12-BODY",
  name: "Ly giấy 12oz – in thân ly",
  sku: "CUP-PAPER-12OZ-WHT",
  minDpi: 300,
  colorMode: "RGB",
  allowedFileFormats: ["image/png", "image/jpeg", "image/webp"],
  maxFileSizeMb: 20,
  maxColors: null,
  allowedFontCodes: null,
  model: {
    kind: "parametric-cup",
    topDiameterMm: 90,
    bottomDiameterMm: 60,
    heightMm: 110,
    rimMm: 3,
    seamMm: 8,
    bandTopOffsetMm: 6,
    bandBottomOffsetMm: 8,
    material: "paper-white",
  },
  printAreas: [
    {
      code: "BODY",
      name: "Thân ly",
      xMm: 0,
      yMm: 0,
      widthMm: 279.67,
      heightMm: 120.85,
      safeMarginMm: 3,
      bleedMm: 2,
      shape: {
        type: "annular-sector",
        innerRadiusMm: 230.04,
        outerRadiusMm: 327.05,
        sweepRad: 0.84894,
        seamMm: 8,
      },
      uvMapping: { meshPart: "body" },
    },
  ],
};

function bagFace(code: PrintArea["code"], name: string, widthMm: number): PrintArea {
  return {
    code,
    name,
    xMm: 0,
    yMm: 0,
    widthMm,
    heightMm: 280,
    safeMarginMm: 5,
    bleedMm: 3,
    shape: { type: "rect" },
    uvMapping: { meshPart: code.toLowerCase() },
  };
}

/** Medium kraft bag printed on all four faces; printable height = 320 − 40 mm top fold. */
export const bagM: CustomizationTemplate = {
  templateId: "tpl-bagm-4f",
  code: "BAGM-4F",
  name: "Túi kraft size M – in 4 mặt",
  sku: "BAG-KRAFT-M",
  minDpi: 300,
  colorMode: "RGB",
  allowedFileFormats: ["image/png", "image/jpeg", "image/webp"],
  maxFileSizeMb: 20,
  maxColors: null,
  allowedFontCodes: null,
  model: {
    kind: "parametric-bag",
    widthMm: 260,
    gussetMm: 120,
    heightMm: 320,
    topFoldMm: 40,
    handle: "twisted",
    material: "kraft-brown",
  },
  printAreas: [
    bagFace("FRONT", "Mặt trước", 260),
    bagFace("BACK", "Mặt sau", 260),
    bagFace("LEFT", "Hông trái", 120),
    bagFace("RIGHT", "Hông phải", 120),
  ],
};

/** Inside the bag front safe area (260 × 280 mm face); the default placement of every element helper. */
const defaultPlacement = () => ({ u: 130, v: 140, rotationDeg: 0, scale: 1 });

/** A visible, unlocked text element; `overrides` replaces any field. */
export function textEl(id: string, overrides: Partial<TextElement> = {}): TextElement {
  return {
    id,
    type: "text",
    name: `Text ${id}`,
    hidden: false,
    locked: false,
    opacity: 1,
    placement: defaultPlacement(),
    content: "Xin chào",
    fontCode: "be-vietnam-pro",
    sizePt: 24,
    color: "#000000",
    align: "center",
    bold: false,
    italic: false,
    letterSpacingEm: 0,
    lineHeight: 1.2,
    ...overrides,
  };
}

/** A visible, unlocked 60 × 40 mm image element (1200 × 800 px = 508 DPI); `overrides` replaces any field. */
export function imageEl(id: string, overrides: Partial<ImageElement> = {}): ImageElement {
  return {
    id,
    type: "image",
    name: `Image ${id}`,
    hidden: false,
    locked: false,
    opacity: 1,
    placement: defaultPlacement(),
    assetId: "asset-1",
    naturalWidthPx: 1200,
    naturalHeightPx: 800,
    widthMm: 60,
    heightMm: 40,
    flipX: false,
    flipY: false,
    ...overrides,
  };
}

/** A visible, unlocked drawing element with no strokes; `overrides` replaces any field. */
export function drawingEl(id: string, overrides: Partial<DrawingElement> = {}): DrawingElement {
  return {
    id,
    type: "drawing",
    name: `Drawing ${id}`,
    hidden: false,
    locked: false,
    opacity: 1,
    placement: defaultPlacement(),
    strokes: [],
    ...overrides,
  };
}

/** A font registry with one family that ships italics and one that does not. */
export const FONTS: FontRegistry = {
  "be-vietnam-pro": { label: "Be Vietnam Pro", family: "Be Vietnam Pro", italic: true },
  lobster: { label: "Lobster", family: "Lobster", italic: false },
};

/** Deterministic measurer: 0.5 em per code point, ascent 0.8 em, descent 0.2 em (px at the size in `fontCss`). */
export const fakeMeasure: TextMeasurer = (text, fontCss) => {
  const em = fontSizePx(fontCss);
  return { width: [...text].length * 0.5 * em, ascent: 0.8 * em, descent: 0.2 * em };
};

export const bagFront = createSurfaces(bagM).byCode.FRONT!;
export const cupBody = createSurfaces(cup12oz).byCode.BODY!;

/** Element sizer over `FONTS` and `fakeMeasure`. */
export const sizer = createSizer(FONTS, fakeMeasure);

/** One recorded `Ctx2D` method call: `[method, ...args]`. */
export type RecordedCall = [method: string, ...args: unknown[]];

/**
 * A fake `Ctx2D` that records what it is asked to do. `calls` holds the method calls, `sets` every
 * value assigned to each property (in order), and `log` both interleaved (property sets appear as
 * `["=fillStyle", value]`) for the tests that care about ordering. Properties read back the last
 * value set, like a real context.
 */
export type RecordingCtx = {
  ctx: Ctx2D;
  calls: RecordedCall[];
  sets: Record<string, unknown[]>;
  log: RecordedCall[];
};

const CTX_METHODS = new Set([
  "save",
  "restore",
  "setTransform",
  "transform",
  "beginPath",
  "moveTo",
  "lineTo",
  "arc",
  "closePath",
  "clip",
  "fill",
  "stroke",
  "fillRect",
  "drawImage",
  "fillText",
  "strokeText",
  "rotate",
  "clearRect",
  "translate",
  "scale",
]);

type RecordingOptions = {
  /** Whether the fake supports `letterSpacing` (`"letterSpacing" in ctx`), like Chrome and Safari 17+. */
  letterSpacing?: boolean;
  /** Width `measureText` reports for a string (default 0). */
  glyphWidth?: (text: string) => number;
};

export function recordingCtx(opts: RecordingOptions = {}): RecordingCtx {
  const calls: RecordedCall[] = [];
  const log: RecordedCall[] = [];
  const sets: Record<string, unknown[]> = {};
  const values: Record<string, unknown> = {};
  const ctx = new Proxy({} as Record<string, unknown>, {
    has(_target, prop) {
      if (typeof prop !== "string") return false;
      if (prop === "letterSpacing") return opts.letterSpacing === true;
      return CTX_METHODS.has(prop) || prop in values;
    },
    get(_target, prop) {
      if (typeof prop !== "string") return undefined;
      if (prop === "measureText") {
        return (text: string) => {
          calls.push([prop, text]);
          log.push([prop, text]);
          return { width: opts.glyphWidth?.(text) ?? 0 };
        };
      }
      if (!CTX_METHODS.has(prop)) return values[prop];
      return (...args: unknown[]) => {
        calls.push([prop, ...args]);
        log.push([prop, ...args]);
      };
    },
    set(_target, prop, value) {
      if (typeof prop !== "string") return false;
      (sets[prop] ??= []).push(value);
      log.push([`=${prop}`, value]);
      values[prop] = value;
      return true;
    },
  }) as unknown as Ctx2D;
  return { ctx, calls, sets, log };
}

/** A valid 1 × 1 px opaque red PNG, the smallest raster the PDF builders accept. */
export const PNG_1x1: Uint8Array = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==",
  ),
  (char) => char.charCodeAt(0),
);

const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const be16 = (n: number) => [(n >>> 8) & 255, n & 255];
const le16 = (n: number) => [n & 255, (n >>> 8) & 255];
const le24 = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255];
const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));

/** A PNG header (signature + IHDR, as large as `width × height` says); not a decodable image. */
export function pngBytes(width: number, height: number): Uint8Array<ArrayBuffer> {
  return Uint8Array.from([
    ...[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    ...be32(13),
    ...ascii("IHDR"),
    ...be32(width),
    ...be32(height),
    ...[8, 6, 0, 0, 0],
    ...be32(0), // CRC, unchecked
  ]);
}

/**
 * A JPEG up to its frame header: SOI, a JFIF APP0 and a quantisation table to skip, then the
 * frame header `sof` marker (0xC0 baseline, 0xC2 progressive, …).
 */
export function jpegBytes(width: number, height: number, sof = 0xc0): Uint8Array<ArrayBuffer> {
  return Uint8Array.from([
    ...[0xff, 0xd8],
    ...[0xff, 0xe0, ...be16(16), ...ascii("JFIF"), 0, 1, 1, 0, ...be16(1), ...be16(1), 0, 0],
    ...[0xff, 0xdb, ...be16(5), 0, 1, 2],
    ...[0xff, sof, ...be16(11), 8, ...be16(height), ...be16(width), 1, 1, 0x11, 0],
  ]);
}

/** A WebP header of the given flavour (`VP8` lossy, `VP8L` lossless, `VP8X` extended). */
export function webpBytes(
  kind: "VP8" | "VP8L" | "VP8X",
  width: number,
  height: number,
): Uint8Array<ArrayBuffer> {
  const chunk = (() => {
    switch (kind) {
      case "VP8":
        return [
          ...ascii("VP8 "),
          ...[10, 0, 0, 0],
          ...[0, 0, 0],
          ...[0x9d, 0x01, 0x2a],
          ...le16(width),
          ...le16(height),
        ];
      case "VP8L": {
        const bits = ((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14);
        return [...ascii("VP8L"), ...[5, 0, 0, 0], 0x2f, ...be32(bits).reverse()];
      }
      case "VP8X":
        return [
          ...ascii("VP8X"),
          ...[10, 0, 0, 0],
          ...[0, 0, 0, 0],
          ...le24(width - 1),
          ...le24(height - 1),
        ];
    }
  })();
  return Uint8Array.from([
    ...ascii("RIFF"),
    ...[chunk.length + 4, 0, 0, 0],
    ...ascii("WEBP"),
    ...chunk,
  ]);
}
