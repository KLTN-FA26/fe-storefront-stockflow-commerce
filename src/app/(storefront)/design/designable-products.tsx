"use client";

import { useEffect, useMemo, useState } from "react";

import {
  DesignListScreen,
  type DesignableCatalogue,
  type DesignableProduct,
} from "@/features/product-design";
import { useSignedIn } from "@/lib/auth/use-signed-in";

import {
  designableOf,
  designableSearchText,
  productSkusOf,
  useDesignableCataloguePages,
} from "./designable-catalogue";

/**
 * The pages know the catalogue, the design feature does not: this reads it for the "Thiết kế mới"
 * dialog while it is open, searched (server-side) by what the dialog asks, a page at a time, and
 * maps it to the dialog's products. The catalogue cannot be asked for customizable products only,
 * so they are picked from each page; a page with none of them reads on to the next, until one has
 * or the catalogue ends.
 */
export function useDesignableCatalogue(): DesignableCatalogue {
  // The catalogue serves signed-in callers only (kltn-docs 13 BR-02): a visitor gets the list's
  // sign-in prompt, and no catalogue call is made for them.
  const signedIn = useSignedIn();
  // The dialog's text while it is open; null while it is closed, and nothing is read then.
  const [search, setSearch] = useState<string | null>(null);
  const reading = signedIn === true && search !== null;
  const pages = useDesignableCataloguePages(designableSearchText(search ?? ""), reading);
  const { data, error, isFetching, isFetchNextPageError, isPlaceholderData, refetch } = pages;
  const { hasNextPage, fetchNextPage, isFetchingNextPage } = pages;

  const products = useMemo(() => {
    const bySlug = new Map<string, DesignableProduct>();
    // A product that moved between two reads of the pages is listed once.
    for (const page of data?.pages ?? []) {
      for (const product of designableOf(page.items)) bySlug.set(product.slug, product);
    }
    return [...bySlug.values()];
  }, [data]);

  const pageCount = data?.pages.length ?? 0;
  const lastPage = data?.pages.at(-1);
  const lastPageEmpty = lastPage !== undefined && designableOf(lastPage.items).length === 0;
  // The pages shown while a new text loads are the previous text's: nothing is read on from them.
  const current = !isPlaceholderData;
  const readOn =
    reading && current && lastPageEmpty && hasNextPage && !isFetching && !isFetchNextPageError;
  // Run again for each page read: a fast answer can land before a render shows the fetch, so
  // `readOn` may stay true from one empty page to the next.
  useEffect(() => {
    if (readOn) void fetchNextPage();
  }, [readOn, pageCount, fetchNextPage]);

  return data
    ? {
        status: "ready",
        products,
        stale: isPlaceholderData,
        more:
          current && hasNextPage
            ? {
                onLoad: () => void fetchNextPage(),
                loading: isFetchingNextPage || readOn,
                error: isFetchNextPageError ? error : null,
              }
            : null,
        onSearch: setSearch,
        skusOf: productSkusOf,
      }
    : error
      ? {
          status: "error",
          error,
          onRetry: () => void refetch(),
          retrying: isFetching,
          onSearch: setSearch,
          skusOf: productSkusOf,
        }
      : { status: "loading", onSearch: setSearch, skusOf: productSkusOf };
}

/** `/design`: the list of designs, with the catalogue behind its "Thiết kế mới" dialog. */
export function DesignListWithCatalog() {
  return <DesignListScreen catalogue={useDesignableCatalogue()} />;
}
