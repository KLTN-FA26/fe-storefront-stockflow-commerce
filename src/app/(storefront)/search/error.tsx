"use client";

import { CatalogRouteError } from "@/features/catalog/components/route-error";

export default function SearchError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <CatalogRouteError
      title="Tìm kiếm"
      heading="Không tìm kiếm được sản phẩm"
      error={error}
      reset={reset}
    />
  );
}
