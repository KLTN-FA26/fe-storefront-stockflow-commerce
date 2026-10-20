"use client";

import { useEffect } from "react";
import { parseAsInteger, parseAsString, useQueryState } from "nuqs";

import { STORE_ROUTES } from "@/constants";
import { ListPagination } from "@/components/storefront/list-pagination";
import { ProductGrid, type ProductGridItem } from "@/components/storefront/product-grid";
import { useSignedIn } from "@/lib/auth/use-signed-in";

import { useCurrentSearch } from "../current-search-store";
import { CATALOG_QUERY_MAX } from "../schemas";
import { badgeStatus } from "@/lib/catalog/selectors";

import { isCatalogSort, toApiSort, type CatalogSort } from "../sorts";
import { CATALOG_PAGE_SIZE } from "../queries";
import { useCatalogListing, type CatalogListingItem } from "../use-catalog-listing";
import {
  CatalogGridSkeleton,
  CatalogLoadError,
  FiguresNotice,
  NoProducts,
  SearchPrompt,
  SignInRequired,
} from "./catalog-states";
import { CatalogToolbar } from "./catalog-toolbar";

const pageParser = parseAsInteger.withDefault(1).withOptions({ history: "push", scroll: true });

export function toGridItem(item: CatalogListingItem): ProductGridItem {
  return {
    id: item.card.productId,
    href: STORE_ROUTES.catalog.detail(item.card.slug),
    name: item.card.title,
    imageSrc: item.imageUrl,
    imageAlt: item.imageAlt,
    price: item.priceFrom,
    priceLabel: "Từ",
    availability: badgeStatus(item.availability),
  };
}

/** This list's own URL, to come back to after signing in. */
function here(scope: "catalog" | "search", q: string | undefined, sort: CatalogSort, page: number) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (sort !== "default") params.set("sort", sort);
  if (page > 1) params.set("page", String(page));
  const path = scope === "search" ? STORE_ROUTES.catalog.search : STORE_ROUTES.catalog.list;
  return params.size ? `${path}?${params}` : path;
}

/**
 * The product list. `scope="search"` is /search?q= (SCRUM-469): without a text it asks for one
 * and calls nothing; `/catalog?q=` redirects there (next.config.ts).
 */
export function CatalogScreen({ scope = "catalog" }: { scope?: "catalog" | "search" }) {
  const signedIn = useSignedIn();
  const [urlPage, setPage] = useQueryState("page", pageParser);
  const [rawQuery, setQuery] = useQueryState("q", parseAsString);
  const [rawSort, setSort] = useQueryState("sort", parseAsString);
  // Whatever the URL says, only what the BE accepts is sent (q ≤ 100, page ≥ 1, known sort).
  const query = [...(rawQuery?.trim() ?? "")].slice(0, CATALOG_QUERY_MAX).join("") || undefined;
  const sort: CatalogSort = rawSort && isCatalogSort(rawSort) ? rawSort : "default";
  const page = Number.isInteger(urlPage) && urlPage >= 1 ? urlPage : 1;
  const awaitingText = scope === "search" && !query;

  const {
    page: result,
    items,
    figuresError,
  } = useCatalogListing(
    { q: query, sort: toApiSort(sort), page, size: CATALOG_PAGE_SIZE },
    signedIn === true && !awaitingText,
  );
  const { data, isPending, isFetching, isPlaceholderData, error, refetch } = result;

  // Tell the header box what /search shows (text and sort), and nothing once the page is left.
  useEffect(() => {
    if (scope !== "search") return;
    useCurrentSearch.setState({ current: { q: query, sort: rawSort ?? undefined } });
    return () => useCurrentSearch.setState({ current: undefined });
  }, [scope, query, rawSort]);
  // `relevance` means newest without a search text; drop it when the text goes away.
  useEffect(() => {
    if (!query && sort === "relevance") void setSort(null, { history: "replace" });
  }, [query, sort, setSort]);
  // Bring an out-of-range page back to a real one (replace, so Back skips the bad URL).
  useEffect(() => {
    if (urlPage !== page) void setPage(page, { history: "replace" });
    else if (data && !isPlaceholderData && page > Math.max(data.totalPages, 1)) {
      void setPage(Math.max(data.totalPages, 1), { history: "replace" });
    }
  }, [urlPage, page, data, isPlaceholderData, setPage]);

  if (signedIn === undefined) return <CatalogGridSkeleton />;
  if (!signedIn) return <SignInRequired from={here(scope, query, sort, page)} />;
  if (awaitingText) return <SearchPrompt />;

  return (
    <div className="min-w-0 space-y-4">
      <CatalogToolbar
        total={data?.totalElements}
        query={query}
        sort={sort}
        onSortChange={(next) => {
          void setSort(next === "default" ? null : next);
          void setPage(1);
        }}
        onClearQuery={() => {
          void setQuery(null);
          void setPage(1);
        }}
      />
      {isPending ? (
        <CatalogGridSkeleton />
      ) : error && !data ? (
        <CatalogLoadError
          title="Không tải được danh sách sản phẩm"
          error={error}
          onRetry={() => void refetch()}
          retrying={isFetching}
        />
      ) : !data || data.totalElements === 0 ? (
        <NoProducts
          query={query}
          onClear={() => {
            void setQuery(null);
            void setPage(1);
          }}
        />
      ) : (
        <>
          {figuresError ? <FiguresNotice error={figuresError} /> : null}
          <div aria-busy={isPlaceholderData}>
            <ProductGrid products={items.filter((item) => !item.unavailable).map(toGridItem)} />
          </div>
          <ListPagination
            label="Phân trang sản phẩm"
            page={data.page}
            totalPages={data.totalPages}
            hasPrevious={data.hasPrevious}
            hasNext={data.hasNext}
            busy={isPlaceholderData}
            onPageChange={(next) => void setPage(next)}
          />
        </>
      )}
    </div>
  );
}
