import { Suspense } from "react";

import { DesignAreaSkeleton } from "@/features/product-design/components/design-area-skeleton";
import { MockReviewPanel } from "@/features/product-design/components/mock-review-panel";

import { DesignListWithCatalog } from "./designable-products";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Thiết kế của tôi" };

export default function DesignListPage() {
  return (
    <>
      {/* nuqs reads search params: Suspense keeps the rest of the route static. */}
      <Suspense
        fallback={<DesignAreaSkeleton section="designs" />}
      >
        <DesignListWithCatalog />
      </Suspense>
      <MockReviewPanel />
    </>
  );
}
