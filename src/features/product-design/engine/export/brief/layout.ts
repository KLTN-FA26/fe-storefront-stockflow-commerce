import type { DesignBrief } from "./model";

/** The brief's page: ISO A4 landscape, in mm. */
export const BRIEF_PAGE_MM = { width: 297, height: 210 } as const;

/** Element rows under an area's drawing, and on each page that carries its table on. */
export const ROWS_UNDER_DRAWING = 5;
export const ROWS_PER_PAGE = 13;
export const COLORS_PER_PAGE = 12;

/** One page of the brief, in order. */
export type BriefPage =
  | { kind: "overview" }
  | { kind: "area"; area: number; from: number; to: number; continued: boolean }
  | { kind: "colors"; from: number; to: number }
  | { kind: "notes" };

/**
 * The brief's pages: the overview; per print area its drawing with the first rows of its element
 * table, then as many pages as the rest of the table needs; the colours, as many pages as they
 * need; the notes and sign-off. Fixed row counts, so the pages are known before anything is drawn.
 */
export function briefPages(brief: DesignBrief): BriefPage[] {
  const pages: BriefPage[] = [{ kind: "overview" }];
  brief.areas.forEach((area, index) => {
    // The background is the table's first row.
    const rows = area.elements.length + 1;
    pages.push({
      kind: "area",
      area: index,
      from: 0,
      to: Math.min(rows, ROWS_UNDER_DRAWING),
      continued: false,
    });
    for (let from = ROWS_UNDER_DRAWING; from < rows; from += ROWS_PER_PAGE) {
      pages.push({
        kind: "area",
        area: index,
        from,
        to: Math.min(rows, from + ROWS_PER_PAGE),
        continued: true,
      });
    }
  });
  const colors = Math.max(1, brief.colors.length);
  for (let from = 0; from < colors; from += COLORS_PER_PAGE) {
    pages.push({ kind: "colors", from, to: Math.min(brief.colors.length, from + COLORS_PER_PAGE) });
  }
  pages.push({ kind: "notes" });
  return pages;
}
