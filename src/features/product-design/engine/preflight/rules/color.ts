import type { Background, DesignElement, Hex } from "../../document/schema";
import type { CustomizationTemplate } from "../../template/schema";
import type { PreflightIssue, SurfaceScope } from "../types";

// WHITE_ON_KRAFT and TOO_MANY_COLORS: docs 12 §3 (print colour count and limits), no numbered BR.
// CMYK_CONVERSION: BR-07 (docs 12 §6, screen colours can differ from the printed result).

/** WCAG relative luminance above which a colour counts as white on kraft paper. */
const NEAR_WHITE_LUMINANCE = 0.92;

/** Kraft stock cannot print white (docs 12 §3), so colour pickers warn about it too. */
export function isKraft(template: CustomizationTemplate): boolean {
  const { model } = template;
  return model.kind !== "gltf" && (model.material === "kraft" || model.material === "kraft-brown");
}

/** The sRGB channel of `#RRGGBB` at `from`, linearised (WCAG 2.x). */
function linearChannel(hex: Hex, from: number): number {
  const c = Number.parseInt(hex.slice(from, from + 2), 16) / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: Hex): number {
  return (
    0.2126 * linearChannel(hex, 1) + 0.7152 * linearChannel(hex, 3) + 0.0722 * linearChannel(hex, 5)
  );
}

export const isNearWhite = (hex: Hex) => relativeLuminance(hex) > NEAR_WHITE_LUMINANCE;

/** Solid colours an element prints: text fill and outline, draw strokes (erasing prints nothing). */
function elementColors(el: DesignElement): Hex[] {
  switch (el.type) {
    case "text":
      return el.outline ? [el.color, el.outline.color] : [el.color];
    case "drawing":
      return el.strokes.filter((s) => s.mode === "draw").map((s) => s.color);
    case "image":
      return [];
  }
}

function backgroundColors(background: Background): Hex[] {
  switch (background.kind) {
    case "none":
      return [];
    case "color":
      return [background.color];
    case "pattern":
      return [...background.colors];
  }
}

/** `WHITE_ON_KRAFT` for the text or strokes of one element. */
export function elementColorIssues(scope: SurfaceScope, el: DesignElement): PreflightIssue[] {
  if (!isKraft(scope.input.template) || !elementColors(el).some(isNearWhite)) return [];
  return [
    {
      ruleId: "WHITE_ON_KRAFT",
      level: "warning",
      message: "Giấy kraft không in được màu trắng.",
      surfaceCode: scope.code,
      elementId: el.id,
    },
  ];
}

/**
 * Surface-wide colour rules: `WHITE_ON_KRAFT` for the background, and `TOO_MANY_COLORS` when the
 * surface prints more distinct solid colours than `maxColors`, or any image while a limit is set
 * (a photo is not a handful of solid colours). Each print area is printed on its own, so colours
 * are counted per surface.
 */
export function surfaceColorIssues(scope: SurfaceScope): PreflightIssue[] {
  const { template } = scope.input;
  const { background } = scope.content;
  const issues: PreflightIssue[] = [];

  if (isKraft(template) && backgroundColors(background).some(isNearWhite)) {
    issues.push({
      ruleId: "WHITE_ON_KRAFT",
      level: "warning",
      message: "Giấy kraft không in được màu trắng.",
      surfaceCode: scope.code,
    });
  }

  const { maxColors } = template;
  if (maxColors !== null) {
    const colors = new Set(
      [...backgroundColors(background), ...scope.elements.flatMap(elementColors)].map((c) =>
        c.toUpperCase(),
      ),
    );
    const hasImage = scope.elements.some((el) => el.type === "image");
    if (colors.size > maxColors || hasImage) {
      issues.push({
        ruleId: "TOO_MANY_COLORS",
        level: "warning",
        message: `Thiết kế dùng nhiều màu hơn mức cho phép (${maxColors}).`,
        surfaceCode: scope.code,
      });
    }
  }

  return issues;
}

/** `CMYK_CONVERSION`: one document-level info issue for a CMYK template. */
export function colorModeIssues(template: CustomizationTemplate): PreflightIssue[] {
  if (template.colorMode !== "CMYK") return [];
  return [
    {
      ruleId: "CMYK_CONVERSION",
      level: "info",
      message: "Màu sẽ được chuyển sang CMYK khi in, có thể nhạt hơn trên màn hình.",
    },
  ];
}
