import { Suspense } from "react";

import { PageShell } from "@/components/storefront/layout";
import { MockReviewPanel } from "@/features/product-design/components/mock-review-panel";
import { ProjectListScreen } from "@/features/product-design/components/project-list-screen";
import { ProjectListSkeleton } from "@/features/product-design/components/project-list-states";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Dự án thiết kế" };

export default function DesignProjectsPage() {
  return (
    <>
      {/* nuqs reads search params: Suspense keeps the rest of the route static. */}
      <Suspense
        fallback={
          <PageShell title="Dự án thiết kế">
            <ProjectListSkeleton />
          </PageShell>
        }
      >
        <ProjectListScreen />
      </Suspense>
      <MockReviewPanel />
    </>
  );
}
