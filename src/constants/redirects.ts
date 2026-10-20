/**
 * Storefront redirects, applied by next.config.ts `redirects()` (tested with Next's own matcher).
 * Kept here, not inline, so the test can read them.
 */
export const STOREFRONT_REDIRECTS = [
  {
    // One URL for search results (SCRUM-469): /catalog?q=… opens /search?q=…; the query string
    // (q, sort, page) passes through. An empty q does not match, so /catalog?q= stays a listing.
    source: "/catalog",
    has: [{ type: "query" as const, key: "q" }],
    destination: "/search",
    permanent: false,
  },
  {
    // The product page moved to /catalog/products/{slug} (the BE path): old links keep working.
    source: "/catalog/:slug((?!products$)[^/]+)",
    destination: "/catalog/products/:slug",
    permanent: false,
  },
  {
    // /catalog/products alone has no page: it is the catalogue.
    source: "/catalog/products",
    destination: "/catalog",
    permanent: false,
  },
];
