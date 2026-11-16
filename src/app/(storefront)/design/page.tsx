import { Suspense } from "react";

import { PageShell } from "@/components/storefront/layout";
import { MockReviewPanel } from "@/features/product-design/components/mock-review-panel";
import { DesignListSkeleton } from "@/features/product-design/components/design-list-states";

import { DesignListWithCatalog } from "./designable-products";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Thiết kế của tôi" };

export default function DesignListPage() {
  return (
    <>
      {/* nuqs reads search params: Suspense keeps the rest of the route static. */}
      <Suspense
        fallback={
          <PageShell title="Thiết kế của tôi">
            <DesignListSkeleton />
          </PageShell>
        }
      >
        <DesignListWithCatalog />
      </Suspense>
      <MockReviewPanel />
    </>
  );
}
