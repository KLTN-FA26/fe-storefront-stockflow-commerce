"use client";

import { useMemo } from "react";

import { useCatalogPage } from "@/features/catalog";
import { CATALOG_PAGE_SIZE_MAX } from "@/features/catalog/schemas";
import { DesignListScreen } from "@/features/product-design/components/design-list-screen";
import type {
  DesignableCatalogue,
  DesignableProduct,
} from "@/features/product-design/components/new-design-dialog";
import { useSignedIn } from "@/lib/auth/use-signed-in";

/**
 * `/design` knows the catalogue, the design feature does not: this maps the catalogue's product
 * list (customizable products with their SKUs) to what the "Thiết kế mới" dialog takes, and says
 * while it loads or when it failed, so the dialog does not read either as "no product".
 */
export function DesignListWithCatalog() {
  // The catalogue serves signed-in callers only (kltn-docs 13 BR-02): a visitor gets the list's
  // sign-in prompt, and no catalogue call is made for them.
  const signedIn = useSignedIn();
  const { data, error, isFetching, refetch } = useCatalogPage(
    { page: 1, size: CATALOG_PAGE_SIZE_MAX },
    signedIn === true,
  );
  const products = useMemo<DesignableProduct[]>(
    () =>
      (data?.items ?? [])
        // A kind the catalogue does not send reads as customizable: the print config decides later.
        .filter((card) => card.kind === undefined || card.kind === "CUSTOMIZABLE")
        .flatMap((card) =>
          card.skus && card.skus.length > 0
            ? [{ slug: card.slug, title: card.title, skus: card.skus.map(({ sku }) => sku) }]
            : [],
        ),
    [data],
  );
  const catalogue: DesignableCatalogue = data
    ? { status: "ready", products }
    : error
      ? { status: "error", error, onRetry: () => void refetch(), retrying: isFetching }
      : { status: "loading" };
  return <DesignListScreen catalogue={catalogue} />;
}
