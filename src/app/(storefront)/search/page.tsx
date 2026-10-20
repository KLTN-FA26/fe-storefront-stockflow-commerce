import { Suspense } from "react";
import type { Metadata } from "next";

import { CatalogGridSkeleton, CatalogScreen, searchPageTitle } from "@/features/catalog";

import { PageShell } from "@/components/storefront/layout";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const { q } = await searchParams;
  return { title: searchPageTitle(typeof q === "string" ? q : undefined) };
}

/** /search?q= — catalog search (SCRUM-469); /catalog?q= redirects here (next.config.ts). */
export default function SearchPage() {
  return (
    <PageShell title="Tìm kiếm">
      {/* nuqs reads search params: Suspense keeps the page shell out of the client tree. */}
      <Suspense fallback={<CatalogGridSkeleton />}>
        <CatalogScreen scope="search" />
      </Suspense>
    </PageShell>
  );
}
