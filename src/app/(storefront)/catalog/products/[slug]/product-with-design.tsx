"use client";

import { ProductDetailScreen } from "@/features/catalog";
import { DesignEntry } from "@/features/product-design/components/design-entry";

/**
 * The product page composes the design feature's entry into the catalog screen. A render prop
 * cannot cross from a Server Component, so this small client module holds it.
 */
export function ProductWithDesign({ slug }: { slug: string }) {
  return (
    <ProductDetailScreen
      slug={slug}
      renderDesignEntry={(sku) => <DesignEntry productSlug={slug} sku={sku} />}
    />
  );
}
