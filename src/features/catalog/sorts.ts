import { CATALOG_SORTS } from "./schemas";

/** "default" sends no `sort`, so the BE picks: relevance with a search text, newest without. */
export type CatalogSort = "default" | (typeof CATALOG_SORTS)[number];

const LABELS: Record<CatalogSort, string> = {
  default: "Mặc định",
  relevance: "Liên quan nhất",
  newest: "Mới nhất",
  title: "Tên A–Z",
};

// BE: sorting by price waits for SCRUM-428, so it is not offered. `relevance` without a search
// text is the same as newest, so it is only offered with one.
export function sortOptions(hasQuery: boolean) {
  return (["default", ...(hasQuery ? ["relevance"] : []), "newest", "title"] as CatalogSort[]).map(
    (value) => ({ value, label: LABELS[value] }),
  );
}

export const toApiSort = (sort: CatalogSort) => (sort === "default" ? undefined : sort);

export const isCatalogSort = (value: string): value is CatalogSort =>
  value === "default" || (CATALOG_SORTS as readonly string[]).includes(value);
