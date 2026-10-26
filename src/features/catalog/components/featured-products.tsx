"use client";

import { STORE_ROUTES } from "@/constants";
import { Section } from "@/components/storefront/layout";
import { ProductGrid } from "@/components/storefront/product-grid";
import { useSignedIn } from "@/lib/auth/use-signed-in";

import { useCatalogListing } from "../use-catalog-listing";
import { toGridItem } from "./catalog-screen";
import { CatalogGridSkeleton, CatalogLoadError, SignInRequired } from "./catalog-states";

const FEATURED_COUNT = 4;

/** The newest published products, for the home page. Hidden when the catalogue is empty. */
export function FeaturedProducts() {
  const signedIn = useSignedIn();
  const { page, items } = useCatalogListing(
    { sort: "newest", page: 1, size: FEATURED_COUNT },
    signedIn === true,
  );

  let body;
  if (signedIn === undefined || (signedIn && page.isPending)) {
    body = <CatalogGridSkeleton count={FEATURED_COUNT} />;
  } else if (!signedIn) {
    body = <SignInRequired />;
  } else if (!page.data) {
    body = (
      <CatalogLoadError
        title="Không tải được sản phẩm"
        error={page.error}
        onRetry={() => void page.refetch()}
        retrying={page.isFetching}
      />
    );
  } else if (page.data.items.length === 0) {
    return null;
  } else {
    body = <ProductGrid products={items.filter((item) => !item.unavailable).map(toGridItem)} />;
  }

  return (
    <Section title="Sản phẩm mới" action={{ href: STORE_ROUTES.catalog.list, label: "Xem tất cả" }}>
      {body}
    </Section>
  );
}
