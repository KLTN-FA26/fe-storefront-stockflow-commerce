import { Suspense } from "react";

import { CatalogGridSkeleton, CatalogScreen } from "@/features/catalog";

import { PageShell } from "@/components/storefront/layout";

/**
 * No visible page title: the header's "Sản phẩm" tab already says where the customer is, and the list opens on its
 * own count and sort. The heading stays for screen readers. (No price line either: the portal shows no prices.)
 */
export default function CatalogPage() {
  return (
    <PageShell>
      <h1 className="sr-only">Sản phẩm</h1>
      {/* nuqs reads search params: Suspense keeps the rest of the route static. */}
      <Suspense fallback={<CatalogGridSkeleton />}>
        <CatalogScreen />
      </Suspense>
    </PageShell>
  );
}
