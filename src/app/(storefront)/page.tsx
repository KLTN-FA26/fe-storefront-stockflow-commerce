import { FeaturedProducts } from "@/features/catalog";

import { CategoryRow } from "@/components/storefront/home/category-row";
import { DesignSteps } from "@/components/storefront/home/design-steps";
import { HomeHero } from "@/components/storefront/home/home-hero";
import { PageShell } from "@/components/storefront/layout";

export default function HomePage() {
  return (
    <PageShell>
      <HomeHero />
      <CategoryRow />
      <FeaturedProducts />
      <DesignSteps />
    </PageShell>
  );
}
