/**
 * Storefront routes — same pattern as ADMIN_ROUTES but for (storefront) group.
 */

/** The documents a customer may open a conversation about (BE chat ContextKind, the customer's subset). */
export type ChatContextKind =
  "PRODUCT" | "CUSTOMER_SKU" | "DESIGN" | "DESIGN_PROJECT" | "QUOTE" | "ORDER" | "CONTRACT";

/**
 * What the page that sent the customer to the chat wants them to send there. `pdf`: the signed copy of the contract
 * the conversation is about. The thread shows a prompt with a button that opens the file picker; a browser opens a
 * picker only on a click, so the page never opens it by itself.
 */
export const CHAT_ATTACH_INTENTS = ["pdf"] as const;
export type ChatAttachIntent = (typeof CHAT_ATTACH_INTENTS)[number];

const attachQuery = (attach: ChatAttachIntent | undefined, joiner: "?" | "&") =>
  attach ? `${joiner}attach=${attach}` : "";

export const APP_ROUTES = {
  home: "/",
  login: "/login",
  /** The invitation e-mail's page (BE `stockflow.customer.portal-activation-url`); the token follows in `#token=`. */
  activate: "/portal/activate",
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
    newFor: (slug: string, sku?: string | null, projectId?: string | null) =>
      `/design/new?product=${encodeURIComponent(slug)}${sku ? `&sku=${encodeURIComponent(sku)}` : ""}${projectId ? `&project=${encodeURIComponent(projectId)}` : ""}`,
    detail: (id: string) => `/design/${id}`,
    projects: "/design/projects",
    project: (id: string) => `/design/projects/${id}`,
    /** The set submission of a project: the chosen drafts travel in `ids`. */
    projectSubmit: (id: string, ids: readonly string[]) =>
      `/design/projects/${id}/submit?ids=${ids.map(encodeURIComponent).join(",")}`,
  },
  chat: {
    list: "/chat",
    detail: (id: string, attach?: ChatAttachIntent) => `/chat/${id}${attachQuery(attach, "?")}`,
    /**
     * Opens, or reuses, a conversation about one of the customer's own documents (BE C1: the only
     * way a customer attaches a context, BR-02). The chat page reads `kind`, `id` and `attach`.
     */
    about: (kind: ChatContextKind, id: string, attach?: ChatAttachIntent) =>
      `/chat/new?kind=${kind}&id=${encodeURIComponent(id)}${attachQuery(attach, "&")}`,
    /** "Chat với Sale" about nothing in particular. */
    new: "/chat/new",
  },
  account: {
    home: "/account",
    profile: "/account/profile",
    orders: {
      list: "/account/orders",
      detail: (id: string) => `/account/orders/${id}`,
      /** Mở yêu cầu trả hàng cho đơn đã giao (kltn-docs 17 §4.10). */
      newReturn: (id: string) => `/account/orders/${id}/return`,
    },
    returns: {
      list: "/account/returns",
      detail: (id: string) => `/account/returns/${id}`,
    },
    /** The quotes Sales sent the customer (kltn-docs 14, WF-02 D2). */
    quotes: {
      list: "/account/quotes",
      detail: (id: string) => `/account/quotes/${id}`,
    },
    /** The customer's installments to pay, overdue and due first (SF-UX-39). */
    payments: "/account/payments",
    addresses: "/account/addresses",
    security: "/account/security",
  },
} as const;
