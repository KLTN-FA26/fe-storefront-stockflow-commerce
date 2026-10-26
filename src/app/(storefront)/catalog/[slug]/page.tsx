import { redirect } from "next/navigation";

import { STORE_ROUTES } from "@/constants";

/**
 * Old product URL: the page moved to /catalog/products/{slug}, the BE path (SCRUM-469). Any
 * static /catalog/<page> takes precedence over this dynamic segment.
 */
export default async function LegacyProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(STORE_ROUTES.catalog.detail(slug));
}
