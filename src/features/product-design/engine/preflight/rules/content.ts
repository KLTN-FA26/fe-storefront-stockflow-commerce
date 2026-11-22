import type { DesignElement } from "../../document/schema";
import type { PreflightInput, PreflightIssue, SurfaceScope } from "../types";

// BR-DSG-001 (BE): fonts must be loadable. BR-06 (docs 12 §6): uploaded images pass a
// basic format and size check. EMPTY_DESIGN: no background and no visible element (BE
// LayoutPreflight, SD-8); TOO_THIN is a note (spec §7).

/** A thinner line fills in or breaks up when printed. */
const MIN_LINE_MM = 0.25;
const MIN_TEXT_PT = 6;

const BYTES_PER_MB = 1024 * 1024;

/**
 * The spec lists allowed formats as MIME types, but the BE seed stores bare extensions (`PNG`), so
 * both spellings are accepted: each is lower-cased and an extension maps to its MIME type.
 */
const MIME_BY_EXTENSION = new Map([
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["webp", "image/webp"],
  ["image/jpg", "image/jpeg"],
]);

function canonicalFormat(format: string): string {
  const lower = format.trim().toLowerCase();
  return MIME_BY_EXTENSION.get(lower) ?? lower;
}

function formatMatches(contentType: string, allowed: readonly string[]): boolean {
  const type = canonicalFormat(contentType);
  return allowed.some((format) => canonicalFormat(format) === type);
}

const at = (scope: SurfaceScope, el: DesignElement) => ({
  surfaceCode: scope.code,
  elementId: el.id,
});

function fontIssues(scope: SurfaceScope, el: DesignElement): PreflightIssue[] {
  if (el.type !== "text") return [];

  // BE `LayoutPreflight`: a code outside a non-empty allow-list fails (null or empty = any font).
  const allowed = scope.input.template.allowedFontCodes;
  if (allowed && allowed.length > 0 && !allowed.includes(el.fontCode)) {
    return [
      {
        ruleId: "FONT_NOT_ALLOWED",
        level: "fail",
        message: "Phông chữ này không có trong danh sách của mẫu in, hãy đổi phông khác.",
        ...at(scope, el),
      },
    ];
  }
  if (scope.input.fontStatus[el.fontCode] !== "error") return [];
  return [
    {
      ruleId: "FONT_NOT_ALLOWED",
      level: "fail",
      message: "Phông chữ này không được phép in hoặc chưa tải được.",
      ...at(scope, el),
    },
  ];
}

function assetIssues(scope: SurfaceScope, el: DesignElement): PreflightIssue[] {
  if (el.type !== "image") return [];

  const { template, assets } = scope.input;
  const asset = assets[el.assetId];
  const usable =
    asset !== undefined &&
    asset.status === "ready" &&
    formatMatches(asset.contentType, template.allowedFileFormats) &&
    asset.sizeBytes <= template.maxFileSizeMb * BYTES_PER_MB;
  if (usable) return [];
  return [
    {
      ruleId: "ASSET_INVALID",
      level: "fail",
      message: "Ảnh không hợp lệ hoặc không tải được.",
      ...at(scope, el),
    },
  ];
}

/**
 * The printed size decides thinness, so the placement scale applies. Erase strokes take ink away
 * rather than print it, so only draw strokes count.
 */
function isTooThin(el: DesignElement): boolean {
  const { scale } = el.placement;
  switch (el.type) {
    case "text":
      return (
        el.sizePt * scale < MIN_TEXT_PT ||
        (el.outline !== undefined && el.outline.widthMm * scale < MIN_LINE_MM)
      );
    case "drawing":
      return el.strokes.some((s) => s.mode === "draw" && s.sizeMm * scale < MIN_LINE_MM);
    case "image":
      return false;
  }
}

function thinIssues(scope: SurfaceScope, el: DesignElement): PreflightIssue[] {
  if (!isTooThin(el)) return [];
  return [
    {
      ruleId: "TOO_THIN",
      level: "note",
      message: "Nét hoặc chữ quá mảnh để in rõ.",
      ...at(scope, el),
    },
  ];
}

/** `FONT_NOT_ALLOWED`, `ASSET_INVALID` and `TOO_THIN` for one element. */
export function elementContentIssues(scope: SurfaceScope, el: DesignElement): PreflightIssue[] {
  return [...fontIssues(scope, el), ...assetIssues(scope, el), ...thinIssues(scope, el)];
}

/**
 * `EMPTY_DESIGN`: no surface has a background (colour or pattern) or a visible image, text or
 * drawing — BE `LayoutPreflight` ("no surface has a background or a visible element"; PO
 * 2026-11-22, SD-8: as the BE, a background alone is printed, so it is a design). A design on one
 * face of a bag is not empty, so this is a document-level issue with no surface.
 */
export function emptyDesignIssues(input: PreflightInput): PreflightIssue[] {
  const hasContent = input.surfaces.order.some((code) => {
    const surface = input.document.surfaces[code];
    if (!surface) return false;
    return surface.background.kind !== "none" || surface.elements.some((el) => !el.hidden);
  });
  if (hasContent) return [];
  return [{ ruleId: "EMPTY_DESIGN", level: "fail", message: "Thiết kế chưa có nội dung." }];
}
