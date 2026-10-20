import { Suspense } from "react";
import type { Metadata } from "next";

import { CatalogGridSkeleton, CatalogScreen } from "@/features/catalog";

import { PageShell } from "@/components/storefront/layout";

// Static, so the shell renders at once. A per-text tab title would need generateMetadata, i.e. a
// server render per search; a <title> from the client loses to the metadata title.
export const metadata: Metadata = { title: "Tìm kiếm" };

/** /search?q= — catalog search (SCRUM-469); /catalog?q= redirects here (next.config.ts). */
export default function SearchPage() {
  return (
    <PageShell title="Tìm kiếm">
      {/* nuqs reads search params: Suspense keeps the rest of the route static. */}
      <Suspense fallback={<CatalogGridSkeleton />}>
        <CatalogScreen scope="search" />
      </Suspense>
    </PageShell>
  );
}
