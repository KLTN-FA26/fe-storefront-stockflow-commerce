import { Suspense } from "react";

import { DesignAreaSkeleton } from "@/features/product-design/components/design-area-skeleton";
import { MockReviewPanel } from "@/features/product-design/components/mock-review-panel";
import { ProjectListScreen } from "@/features/product-design/components/project-list-screen";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Dự án thiết kế" };

export default function DesignProjectsPage() {
  return (
    <>
      {/* nuqs reads search params: Suspense keeps the rest of the route static. */}
      <Suspense
        fallback={<DesignAreaSkeleton section="projects" />}
      >
        <ProjectListScreen />
      </Suspense>
      <MockReviewPanel />
    </>
  );
}
