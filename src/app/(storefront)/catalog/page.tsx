import { Suspense } from "react";

import { CatalogGridSkeleton, CatalogScreen } from "@/features/catalog";

import { PageShell } from "@/components/storefront/layout";

export default function CatalogPage() {
  return (
    <PageShell
      title="Sản phẩm"
      subtitle="Giá riêng và tình trạng còn hàng dành cho khách sỉ đã đăng nhập."
    >
      {/* nuqs reads search params: Suspense keeps the rest of the route static. */}
      <Suspense fallback={<CatalogGridSkeleton />}>
        <CatalogScreen />
      </Suspense>
    </PageShell>
  );
}
