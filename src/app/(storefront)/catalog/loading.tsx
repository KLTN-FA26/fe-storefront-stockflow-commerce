import { CatalogGridSkeleton } from "@/features/catalog";

import { PageShell } from "@/components/storefront/layout";

export default function CatalogLoading() {
  return (
    <PageShell title="Sản phẩm">
      <CatalogGridSkeleton />
    </PageShell>
  );
}
