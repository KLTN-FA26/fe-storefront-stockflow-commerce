import type { DesignDocument, SurfaceContent } from "../document/schema";
import type { PreflightReport } from "../preflight/types";
import type { CustomizationTemplate } from "../template/schema";

/** A run of lines: `[start, end)` as indexes into `SpecSummary.lines`. */
type LineRange = readonly [start: number, end: number];

/**
 * The technical spec as a title and one text line per fact; the sheet and the stored text both read it.
 * `trimmable` marks the lines `specText` may shorten when the text is over its budget: `issues` go
 * first, then `details` (and `details` comes before `issues` in `lines`). Every other line, and the
 * title, is always kept. Without it, `specText` never drops a line.
 */
export type SpecSummary = {
  title: string;
  lines: string[];
  trimmable?: { issues: LineRange; details: LineRange };
};

/** The backend's `spec_text` budget, in UTF-16 code units. */
const SPEC_TEXT_MAX_CHARS = 4000;
const ELLIPSIS = "…";

const NONE = "không có";

/** At most two decimals, no trailing zeros: `279.67`, `260`. */
function formatMm(mm: number): string {
  return String(Math.round(mm * 100) / 100);
}

/** Colours printed by one surface: its background plus every visible text, outline and drawn stroke. */
function surfaceColors(content: SurfaceContent): string[] {
  const { background } = content;
  const colors: string[] = [];
  if (background.kind === "color") colors.push(background.color);
  if (background.kind === "pattern") colors.push(...background.colors);
  for (const element of content.elements) {
    if (element.hidden) continue;
    if (element.type === "text") {
      colors.push(element.color);
      if (element.outline) colors.push(element.outline.color);
    }
    // An erase stroke removes ink; its colour is never printed.
    if (element.type === "drawing") {
      for (const stroke of element.strokes) if (stroke.mode === "draw") colors.push(stroke.color);
    }
  }
  return colors;
}

/** Fonts used by the visible text of one surface. */
function surfaceFonts(content: SurfaceContent): string[] {
  return content.elements.flatMap((el) => (el.type === "text" && !el.hidden ? [el.fontCode] : []));
}

function listOrNone(values: Iterable<string>): string {
  const sorted = [...new Set(values)].sort();
  return sorted.length > 0 ? sorted.join(", ") : NONE;
}

/**
 * What the print shop needs to know about a design. Only what is printed counts: areas come from
 * the template, and hidden elements (which are not printed) add neither to the element count nor
 * to the fonts and colours.
 */
export function buildSpecSummary(input: {
  name: string;
  template: CustomizationTemplate;
  document: DesignDocument;
  report: PreflightReport;
  checksum: string;
}): SpecSummary {
  const { name, template, document, report, checksum } = input;
  const contents = template.printAreas.map((area) => document.surfaces[area.code]);

  const areaLines = template.printAreas.map((area, i) => {
    const printed = contents[i]?.elements.filter((element) => !element.hidden).length ?? 0;
    return `${area.name}: ${formatMm(area.widthMm)} × ${formatMm(area.heightMm)} mm, ${printed} phần tử`;
  });
  const fonts = contents.flatMap((content) => (content ? surfaceFonts(content) : []));
  // Stored upper-case by the schema; normalised again so an unvalidated document still dedupes.
  const colors = contents.flatMap((content) =>
    content ? surfaceColors(content).map((color) => color.toUpperCase()) : [],
  );
  const details = [
    ...areaLines,
    `Phông chữ: ${listOrNone(fonts)}`,
    `Màu sắc: ${listOrNone(colors)}`,
  ];
  const issues = report.issues.map((issue) => `- ${issue.message}`);

  // Layout: template, SKU | details | preflight | issues | checksum.
  const detailsStart = 2;
  const issuesStart = detailsStart + details.length + 1;
  return {
    title: name,
    lines: [
      `Mẫu: ${template.code} – ${template.name}`,
      `SKU: ${template.sku}`,
      ...details,
      `Preflight: ${report.result}`,
      ...issues,
      `SHA-256: ${checksum}`,
    ],
    trimmable: {
      details: [detailsStart, detailsStart + details.length],
      issues: [issuesStart, issuesStart + issues.length],
    },
  };
}

/** `text` cut to at most `max` UTF-16 units, ending in `…`, never leaving half a surrogate pair. */
function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  let end = max - ELLIPSIS.length;
  const last = text.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return text.slice(0, end) + ELLIPSIS;
}

/**
 * Keeps the longest leading part of `range` that makes `lines` fit and replaces the rest with one
 * `…` line, so a reader can tell lines were left out. Nothing happens to an empty range.
 */
function trimRange(
  lines: string[],
  [start, end]: LineRange,
  fits: (lines: string[]) => boolean,
): string[] {
  if (end <= start) return lines;
  const withKept = (kept: number) => [
    ...lines.slice(0, start + kept),
    ELLIPSIS,
    ...lines.slice(end),
  ];
  // `fits` only gets harder as more lines are kept: binary search the most that still fits.
  let [low, high] = [0, end - start - 1];
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (fits(withKept(mid))) low = mid;
    else high = mid - 1;
  }
  return withKept(low);
}

/**
 * The summary as plain text for the stored `spec_text`: title then lines, at most 4000 characters.
 * Over that, the issue lines are cut first and then the detail lines (areas, fonts, colours), each
 * cut leaving one `…` line, so the title, template, SKU, preflight result and checksum always
 * survive. Only if those alone are too long is the title itself shortened (with `…`).
 */
export function specText(summary: SpecSummary): string {
  const { title, trimmable } = summary;
  const joined = (lines: string[]) => [title, ...lines].join("\n");
  const fits = (lines: string[]) => joined(lines).length <= SPEC_TEXT_MAX_CHARS;

  let lines = summary.lines;
  if (trimmable !== undefined && !fits(lines)) {
    lines = trimRange(lines, trimmable.issues, fits);
    if (!fits(lines)) lines = trimRange(lines, trimmable.details, fits);
  }
  const text = joined(lines);
  if (text.length <= SPEC_TEXT_MAX_CHARS) return text;

  const rest = lines.join("\n");
  const room = SPEC_TEXT_MAX_CHARS - rest.length - 1;
  return room >= 1 ? `${clip(title, room)}\n${rest}` : clip(text, SPEC_TEXT_MAX_CHARS);
}
