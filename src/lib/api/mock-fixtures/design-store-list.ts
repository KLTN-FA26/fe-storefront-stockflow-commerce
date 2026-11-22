/**
 * The customer's list of designs in the design mock (spec 2026-11-09 §4.5 "List"): a page of
 * designs and the DRAFT count. Each runs as an operation of `design-store.ts`.
 */

import { DESIGN_STATUSES, DRAFT_LIMIT, fail, ok, type MockResult } from "./design-rows";
import type { StoreContext } from "./design-store-context";
import type { DesignFiles } from "./design-store-files";
import { newestFirst, pageOf, readPaging, statusFilter } from "./design-store-paging";

export function createListOps(ctx: StoreContext, files: DesignFiles) {
  return {
    /** GET /designs?status=&page=&size= — newest updated first, 0-based pages, never ARCHIVED. */
    async list(
      query: { status?: unknown; inProject?: unknown; page?: unknown; size?: unknown } = {},
    ): Promise<MockResult> {
      const status = statusFilter(query.status);
      if (status !== undefined && !DESIGN_STATUSES.some((s) => s === status)) {
        return fail(400, "UNSUPPORTED_PARAMETER", "Unsupported status filter");
      }
      // BE-15: `inProject=true|false` filters in the query, so paging and totals count it.
      const inProject = String(query.inProject ?? "").toLowerCase();
      if (inProject !== "" && inProject !== "true" && inProject !== "false") {
        return fail(400, "UNSUPPORTED_PARAMETER", "inProject must be true or false");
      }
      const paging = readPaging(query);
      if ("refused" in paging) return paging.refused;
      const mine = ctx
        .state()
        .designs.filter(
          (d) =>
            d.status !== "ARCHIVED" &&
            (status === undefined || d.status === status) &&
            (inProject === "" || (d.projectId !== null) === (inProject === "true")),
        )
        .sort(newestFirst);
      return pageOf(mine, paging, (row) => files.toDto(row));
    },

    /** GET /designs/draft-count */
    async draftCount(): Promise<MockResult> {
      return ok({ drafts: ctx.drafts(), limit: DRAFT_LIMIT });
    },
  };
}
