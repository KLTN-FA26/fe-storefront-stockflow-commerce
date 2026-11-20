import { PageShell } from "@/components/storefront/layout";
import { ProjectListSkeleton } from "@/features/product-design/components/project-list-states";

export default function DesignProjectsLoading() {
  return (
    <PageShell title="Dự án thiết kế">
      <ProjectListSkeleton />
    </PageShell>
  );
}
