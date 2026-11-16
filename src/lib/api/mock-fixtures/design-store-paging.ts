/**
 * What the lists of the design mock share (`design-store-list.ts`, `design-store-projects.ts`):
 * the paging parameters, the newest-first order and the page envelope.
 */

import { fail, ok, type MockResult } from "./design-rows";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 200;

/** A whole number, `fallback` when the parameter is left out (unset, `null` or empty). */
function toInt(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  return Number.isInteger(n) ? n : Number.NaN;
}

/** A `status` filter left out like the paging parameters when unset, `null` or empty. */
export const statusFilter = (value: unknown) =>
  value === "" || value === null ? undefined : value;

/** The 0-based `page` and `size` of a query, or the 400 that refuses them. */
export function readPaging(query: {
  page?: unknown;
  size?: unknown;
}): { page: number; size: number } | { refused: MockResult } {
  const page = toInt(query.page, 0);
  const size = toInt(query.size, DEFAULT_PAGE_SIZE);
  if (!(page >= 0) || !(size >= 1) || size > MAX_PAGE_SIZE) {
    return { refused: fail(400, "UNSUPPORTED_PARAMETER", `page ≥ 0 and size 1..${MAX_PAGE_SIZE}`) };
  }
  return { page, size };
}

/** Newest updated first, then the latest created: the order of every list of this mock. */
export const newestFirst = (
  a: { updatedAt: string; seq: number },
  b: { updatedAt: string; seq: number },
) => b.updatedAt.localeCompare(a.updatedAt) || b.seq - a.seq;

/** The page `page` of `sorted`, each row turned into its DTO, in the envelope the API answers. */
export async function pageOf<Row, Dto>(
  sorted: readonly Row[],
  { page, size }: { page: number; size: number },
  toDto: (row: Row) => Promise<Dto>,
): Promise<MockResult> {
  const totalPages = Math.ceil(sorted.length / size);
  const items = await Promise.all(sorted.slice(page * size, (page + 1) * size).map(toDto));
  return ok({
    items,
    page,
    size,
    totalElements: sorted.length,
    totalPages,
    hasNext: page + 1 < totalPages,
    hasPrevious: page > 0,
  });
}
