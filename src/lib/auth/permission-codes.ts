/**
 * Permission codes the storefront relies on, as the BE spells them ("resource:ACTION", BE
 * PermissionCode). Access is decided by these codes and nothing else: never by a role name.
 * An administrator who grants or takes away a permission in the BE matrix changes what the
 * storefront offers with no code change here. UI-only: the BE re-checks every call.
 */

export const PERM = {
  /** Prices and stock of the storefront catalog, scope OWN (BE CatalogController). */
  catalogStorefront: "catalog-storefront:READ",
  /** The customer's own profile: GET /customers/me. */
  customerRead: "customer-customers:READ",
  /** Own orders: GET /orders/me, /orders/me/{id}. */
  ordersRead: "sales-orders:READ",
  /** Cancel an order or ask for its cancellation. */
  ordersUpdate: "sales-orders:UPDATE",
  /** Edit a design and move it along: specification, confirmation request, confirmation, revision. */
  designsUpdate: "design-designs:UPDATE",
  /** Technical review of a design (staff). */
  designsApprove: "design-designs:APPROVE",
  /** Ask Sales for a quote on an approved design or a project (BE design-quote-requests). */
  designQuoteRequest: "design-quote-requests:CREATE",
  /** The quotes Sales sent: GET /quotes, /quotes/{id}, the PDF. */
  quotesRead: "sales-quotes:READ",
  /** Accept a quote or ask for changes (the customer's side of sales-quotes:APPROVE). */
  quotesApprove: "sales-quotes:APPROVE",
  /** The customer's own conversations with Sales (BE chat-conversations, scope OWN). */
  chatRead: "chat-conversations:READ",
  chatCreate: "chat-conversations:CREATE",
  chatUpdate: "chat-conversations:UPDATE",
} as const;

/**
 * What an account must hold to use the storefront: the storefront catalog, its own profile, and
 * its own orders. A staff account lacks `catalog-storefront:READ` (BE: CUSTOMER and
 * System Admin hold it, and System Admin has no customer profile), so it is turned away here.
 * Not `sales-orders:CREATE`: since BE 14b24f55 (2026-11-10) a customer no longer places orders
 * itself (orders come from accepted quotes), so the CUSTOMER role does not hold it.
 */
export const STOREFRONT_PERMISSIONS: readonly string[] = [
  PERM.catalogStorefront,
  PERM.customerRead,
  PERM.ordersRead,
];

/** True when every required code is among the ones held. */
export function holdsAll(held: readonly string[], required: readonly string[]): boolean {
  return required.every((code) => held.includes(code));
}
