"use client";

import { useSearchParams } from "next/navigation";

import { STORE_ROUTES } from "@/constants";
import { LauncherError, LauncherFrame } from "@/features/product-design/components/launcher-states";
import { describeDesignError } from "@/features/product-design/errors";

/** A render error (or a chunk that did not load) of the launcher: back to the product, or the list. */
export default function NewDesignError({ error, reset }: { error: Error; reset: () => void }) {
  const product = useSearchParams()?.get("product")?.trim();
  return (
    <LauncherFrame>
      <LauncherError
        title="Không bắt đầu được thiết kế"
        message={describeDesignError(error)}
        onRetry={() => reset()}
        backHref={product ? STORE_ROUTES.catalog.detail(product) : STORE_ROUTES.design.list}
        {...(product ? {} : { backLabel: "Về thiết kế của tôi" })}
      />
    </LauncherFrame>
  );
}
