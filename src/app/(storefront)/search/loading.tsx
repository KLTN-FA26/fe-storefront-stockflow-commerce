import { CatalogGridSkeleton } from "@/features/catalog";

import { PageShell } from "@/components/storefront/layout";

export default function SearchLoading() {
  return (
    <PageShell title="Tìm kiếm">
      <CatalogGridSkeleton />
    </PageShell>
  );
}
