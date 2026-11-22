import { PageShell } from "@/components/storefront/layout";
import { ProjectSkeleton } from "@/features/product-design/components/project-screen-states";

export default function DesignProjectLoading() {
  return (
    <PageShell>
      <ProjectSkeleton />
    </PageShell>
  );
}
