import { PageShell } from "@/components/storefront/layout";
import { DesignListSkeleton } from "@/features/product-design/components/design-list-states";

export default function DesignListLoading() {
  return (
    <PageShell title="Thiết kế của tôi">
      <DesignListSkeleton />
    </PageShell>
  );
}
