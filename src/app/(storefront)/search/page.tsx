import { Suspense } from "react";

import { CatalogGridSkeleton, CatalogScreen } from "@/features/catalog";

import { PageShell } from "@/components/storefront/layout";

/** /search?q= — catalog search (SCRUM-469); /catalog?q= redirects here (next.config.ts). */
export default function SearchPage() {
  return (
    <PageShell title="Tìm kiếm" subtitle="Tìm theo tên hoặc mã SKU trong danh mục sản phẩm.">
      {/* nuqs reads search params: Suspense keeps the rest of the route static. */}
      <Suspense fallback={<CatalogGridSkeleton />}>
        <CatalogScreen scope="search" />
      </Suspense>
    </PageShell>
  );
}
