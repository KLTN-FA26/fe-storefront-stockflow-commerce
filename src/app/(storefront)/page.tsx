import { FeaturedProducts } from "@/features/catalog";

import { CupDemo } from "@/components/storefront/home/cup-demo";
import { HomeHero } from "@/components/storefront/home/home-hero";
import { OrderFlow } from "@/components/storefront/home/order-flow";
import { PageShell } from "@/components/storefront/layout";

/** The hero spans the screen above the page column; products come first, then how ordering works, then a 2D/3D demo to try. */
export default function HomePage() {
  return (
    <>
      <HomeHero />
      <PageShell>
        <FeaturedProducts />
        <OrderFlow />
        <CupDemo />
      </PageShell>
    </>
  );
}
