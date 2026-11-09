"use client";

import { useMemo } from "react";

import { useCatalogPage } from "@/features/catalog";
import { CATALOG_PAGE_SIZE_MAX } from "@/features/catalog/schemas";
import { DesignListScreen } from "@/features/product-design/components/design-list-screen";
import type { DesignableProduct } from "@/features/product-design/components/new-design-dialog";

/**
 * `/design` knows the catalogue, the design feature does not: this maps the catalogue's product
 * list (customizable products with their SKUs) to what the "Thiết kế mới" dialog takes.
 */
export function DesignListWithCatalog() {
  const { data } = useCatalogPage({ page: 1, size: CATALOG_PAGE_SIZE_MAX });
  const products = useMemo<DesignableProduct[]>(
    () =>
      (data?.items ?? [])
        // A kind the catalogue does not send reads as customizable: the print config decides later.
        .filter((card) => card.kind === undefined || card.kind === "CUSTOMIZABLE")
        .flatMap((card) =>
          card.skus && card.skus.length > 0
            ? [
                {
                  slug: card.slug,
                  title: card.title,
                  variants: card.skus.map(({ sku, name }) => ({ sku, label: name ?? sku })),
                },
              ]
            : [],
        ),
    [data],
  );
  return <DesignListScreen products={products} />;
}
