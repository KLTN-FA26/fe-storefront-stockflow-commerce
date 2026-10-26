/**
 * Storefront routes — same pattern as ADMIN_ROUTES but for (storefront) group.
 */

export const APP_ROUTES = {
  home: "/",
  login: "/login",
} as const;

export const STORE_ROUTES = {
  catalog: {
    list: "/catalog",
    detail: (slug: string) => `/catalog/products/${slug}`,
    search: "/search",
  },
  design: {
    list: "/design",
    new: "/design/new",
    /** The launcher for a product, and for one of its SKUs when the customer already chose it. */
    newFor: (slug: string, sku?: string | null) =>
      `/design/new?product=${encodeURIComponent(slug)}${sku ? `&sku=${encodeURIComponent(sku)}` : ""}`,
    detail: (id: string) => `/design/${id}`,
  },
  cart: "/cart",
  checkout: {
    index: "/checkout",
    shipping: "/checkout/shipping",
    payment: "/checkout/payment",
    review: "/checkout/review",
  },
  chat: {
    list: "/chat",
    detail: (id: string) => `/chat/${id}`,
  },
  account: {
    home: "/account",
    profile: "/account/profile",
    orders: {
      list: "/account/orders",
      detail: (id: string) => `/account/orders/${id}`,
    },
    addresses: "/account/addresses",
    security: "/account/security",
    privacy: "/account/privacy",
  },
} as const;
