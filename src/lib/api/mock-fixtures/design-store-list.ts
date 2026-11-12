/**
 * The customer's list of designs in the design mock (spec 2026-11-09 §4.5 "List"): a page of
 * designs and the DRAFT count. Each runs as an operation of `design-store.ts`.
 */

import { DESIGN_STATUSES, DRAFT_LIMIT, fail, ok, type MockResult } from "./design-rows";
import type { StoreContext } from "./design-store-context";
import type { DesignFiles } from "./design-store-files";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 200;

/** A whole number, `fallback` when the parameter is left out (unset, `null` or empty). */
function toInt(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  return Number.isInteger(n) ? n : Number.NaN;
}

export function createListOps(ctx: StoreContext, files: DesignFiles) {
  return {
    /** GET /designs?status=&page=&size= — newest updated first, 0-based pages, never ARCHIVED. */
    async list(
      query: { status?: unknown; page?: unknown; size?: unknown } = {},
    ): Promise<MockResult> {
      // Left out like the paging parameters when unset, `null` or empty.
      const status = query.status === "" || query.status === null ? undefined : query.status;
      if (status !== undefined && !DESIGN_STATUSES.some((s) => s === status)) {
        return fail(400, "UNSUPPORTED_PARAMETER", "Unsupported status filter");
      }
      const page = toInt(query.page, 0);
      const size = toInt(query.size, DEFAULT_PAGE_SIZE);
      if (!(page >= 0) || !(size >= 1) || size > MAX_PAGE_SIZE) {
        return fail(400, "UNSUPPORTED_PARAMETER", `page ≥ 0 and size 1..${MAX_PAGE_SIZE}`);
      }
      const mine = ctx
        .state()
        .designs.filter(
          (d) => d.status !== "ARCHIVED" && (status === undefined || d.status === status),
        )
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.seq - a.seq);
      const totalPages = Math.ceil(mine.length / size);
      const items = await Promise.all(
        mine.slice(page * size, (page + 1) * size).map((row) => files.toDto(row)),
      );
      return ok({
        items,
        page,
        size,
        totalElements: mine.length,
        totalPages,
        hasNext: page + 1 < totalPages,
        hasPrevious: page > 0,
      });
    },

    /** GET /designs/draft-count */
    async draftCount(): Promise<MockResult> {
      return ok({ drafts: ctx.drafts(), limit: DRAFT_LIMIT });
    },
  };
}
