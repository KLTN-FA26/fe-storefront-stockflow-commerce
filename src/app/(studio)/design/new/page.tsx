import { LauncherMissingProduct } from "@/features/product-design/components/launcher-states";
import { NewDesignScreen } from "@/features/product-design/components/new-design-screen";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Bắt đầu thiết kế" };

type SearchParams = Record<string, string | string[] | undefined>;

/** The first value of a query parameter, or `null` when it is absent or blank. */
function firstParam(value: string | string[] | undefined) {
  const text = (Array.isArray(value) ? value[0] : value)?.trim();
  return text ? text : null;
}

export default async function NewDesignPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const product = firstParam(params.product);
  if (!product) return <LauncherMissingProduct />;
  return <NewDesignScreen product={product} sku={firstParam(params.sku)} />;
}
