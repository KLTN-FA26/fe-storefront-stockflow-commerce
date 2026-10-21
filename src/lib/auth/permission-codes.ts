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
  /** Place an order and read the payment terms: POST /orders, GET /orders/payment-terms. */
  ordersCreate: "sales-orders:CREATE",
  /** Cancel an order or ask for its cancellation. */
  ordersUpdate: "sales-orders:UPDATE",
  /** Edit a design and move it along: specification, confirmation request, confirmation, revision. */
  designsUpdate: "design-designs:UPDATE",
  /** Technical review of a design (staff). */
  designsApprove: "design-designs:APPROVE",
} as const;

/**
 * What an account must hold to use the storefront: the storefront catalog, its own profile, and
 * order self-service. A staff account lacks `catalog-storefront:READ` (BE: CUSTOMER and
 * System Admin hold it, and System Admin has no customer profile), so it is turned away here.
 */
export const STOREFRONT_PERMISSIONS: readonly string[] = [
  PERM.catalogStorefront,
  PERM.customerRead,
  PERM.ordersRead,
  PERM.ordersCreate,
];

/** True when every required code is among the ones held. */
export function holdsAll(held: readonly string[], required: readonly string[]): boolean {
  return required.every((code) => held.includes(code));
}
