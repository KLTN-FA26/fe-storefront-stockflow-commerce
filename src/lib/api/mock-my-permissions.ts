/**
 * Mock for BE GET /identity/me/permissions. The BE resolves the signed-in account's roles to
 * permission codes (ADR-0008); this mock plays that part, so the roles named here are the fake
 * BE's seed and nothing in the storefront reads them: it only reads the codes that come back.
 *
 * CUSTOMER mirrors V20260903000100__identity_seed_roles_permissions.sql plus
 * `catalog-storefront:READ` (BE PR #148), scope OWN. Any other mock account is back-office staff:
 * orders and customers across the shop, but no storefront catalog.
 */

import { claimsOf } from "./mock-auth";
import { registerMockRoute } from "./mock-adapter";

const CUSTOMER_RESOURCES = [
  "chat-conversations",
  "customer-addresses",
  "customer-customers",
  "design-designs",
  "design-snapshots",
  "notification-notifications",
  "payment-payments",
  "sales-carts",
  "sales-orders",
  "sales-rmas",
];
const CUSTOMER_ACTIONS = ["CREATE", "READ", "UPDATE", "VIEW_PAGE"];

export const MOCK_CUSTOMER_PERMISSIONS = [
  ...CUSTOMER_RESOURCES.flatMap((resource) =>
    CUSTOMER_ACTIONS.map((action) => `${resource}:${action}`),
  ),
  "catalog-storefront:READ",
].sort();

/** A sales-staff account: the back-office order and customer screens, no storefront catalog. */
export const MOCK_STAFF_PERMISSIONS = [
  "customer-customers:READ",
  "sales-orders:CREATE",
  "sales-orders:READ",
  "sales-orders:UPDATE",
  "sales-orders:VIEW_PAGE",
].sort();

export function registerMyPermissionsMockRoute(
  permissions: readonly string[] = MOCK_CUSTOMER_PERMISSIONS,
): void {
  registerMockRoute("GET", "/identity/me/permissions", (config) => {
    const roles = claimsOf(config)?.roles;
    // No token (mock mode answers without a sign-in) or a customer's: the customer's permissions.
    const staff = roles !== undefined && !roles.includes("CUSTOMER");
    return {
      status: 200,
      data: {
        success: true,
        data: staff
          ? { roles, permissions: MOCK_STAFF_PERMISSIONS, dataScope: "ALL" }
          : { roles: ["CUSTOMER"], permissions: [...permissions], dataScope: "OWN" },
        timestamp: new Date().toISOString(),
      },
      headers: {},
    };
  });
}
