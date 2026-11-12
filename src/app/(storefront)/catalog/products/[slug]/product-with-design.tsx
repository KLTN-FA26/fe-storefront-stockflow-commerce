"use client";

import { ProductDetailScreen } from "@/features/catalog";
import { DesignEntry } from "@/features/product-design";

/**
 * The product page composes the design feature's entry into the catalog screen. A render prop
 * cannot cross from a Server Component, so this small client module holds it. The catalog screen
 * shows the entry only for a customizable product, which its purchase panel already quotes
 * through "Chat với Sale": the entry does not offer the chat a second time.
 */
export function ProductWithDesign({ slug }: { slug: string }) {
  return (
    <ProductDetailScreen
      slug={slug}
      renderDesignEntry={(sku) => (
        <DesignEntry productSlug={slug} sku={sku} withSalesChat={false} />
      )}
    />
  );
}
