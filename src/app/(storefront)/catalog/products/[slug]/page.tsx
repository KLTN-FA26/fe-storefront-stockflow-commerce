import { ProductDetailScreen } from "@/features/catalog";

/** Route params arrive percent-encoded for non-ASCII slugs; a stray `%` must not crash the page. */
function readSlug(raw: string) {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export default async function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ProductDetailScreen slug={readSlug(slug)} />;
}
