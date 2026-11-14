/**
 * Storefront redirects, applied by next.config.ts `redirects()` (tested with Next's own matcher).
 * Kept here, not inline, so the test can read them. Old /catalog/{slug} product links are
 * redirected by the route catalog/[slug]/page.tsx instead: a static /catalog/<page> added later
 * wins over that dynamic route, where a config rule would have hijacked it.
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
    // The BE links the handover notice to /orders/{id}; the storefront page is /account/orders/{id}.
    // Only a UUID id matches, so /orders/anything-else stays a 404.
    source:
      "/orders/:id([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})",
    destination: "/account/orders/:id",
    permanent: false,
  },
];
