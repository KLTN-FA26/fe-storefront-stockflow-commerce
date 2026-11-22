import { FeaturedProducts } from "@/features/catalog";

import { HomeHero } from "@/components/storefront/home/home-hero";
import { OrderFlow } from "@/components/storefront/home/order-flow";
import { PageShell } from "@/components/storefront/layout";

export default function HomePage() {
  return (
    <PageShell>
      <HomeHero />
      <OrderFlow />
      <FeaturedProducts />
    </PageShell>
  );
}
