"use client";

import { CatalogRouteError } from "@/features/catalog/components/route-error";

export default function CatalogError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <CatalogRouteError
      title="Sản phẩm"
      heading="Không hiển thị được sản phẩm"
      error={error}
      reset={reset}
    />
  );
}
