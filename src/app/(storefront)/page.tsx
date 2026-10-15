import { STORE_ROUTES } from "@/constants";

import { featuredProducts } from "@/components/storefront/demo-commerce-data";
import { CategoryRow } from "@/components/storefront/home/category-row";
import { DesignSteps } from "@/components/storefront/home/design-steps";
import { HomeHero } from "@/components/storefront/home/home-hero";
import { PageShell, Section, TrustBar } from "@/components/storefront/layout";
import { ProductGrid } from "@/components/storefront/product-grid";

export default function HomePage() {
  return (
    <PageShell>
      <div className="space-y-3 sm:space-y-4">
        <HomeHero />
        <TrustBar variant="card" />
      </div>
      <CategoryRow />
      <Section
        title="Sản phẩm nổi bật"
        action={{ href: STORE_ROUTES.catalog.list, label: "Xem tất cả" }}
      >
        <ProductGrid products={featuredProducts} />
      </Section>
      <DesignSteps />
    </PageShell>
  );
}
