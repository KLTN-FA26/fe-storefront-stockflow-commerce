/**
 * Mock for BE GET /identity/me/permissions, answering as a signed-in CUSTOMER.
 * Mirrors V20260903000100__identity_seed_roles_permissions.sql: CUSTOMER holds
 * VIEW_PAGE/READ/CREATE/UPDATE on its storefront resources, scope OWN.
 */

import { registerMockRoute } from "./mock-adapter";

const CUSTOMER_RESOURCES = [
  "chat-conversations",
  "design-designs",
  "design-snapshots",
  "notification-notifications",
  "payment-payments",
  "sales-carts",
  "sales-orders",
  "sales-rmas",
];
const CUSTOMER_ACTIONS = ["CREATE", "READ", "UPDATE", "VIEW_PAGE"];

export const MOCK_CUSTOMER_PERMISSIONS = CUSTOMER_RESOURCES.flatMap((resource) =>
  CUSTOMER_ACTIONS.map((action) => `${resource}:${action}`),
).sort();

export function registerMyPermissionsMockRoute(
  permissions: readonly string[] = MOCK_CUSTOMER_PERMISSIONS,
): void {
  registerMockRoute("GET", "/identity/me/permissions", () => ({
    status: 200,
    data: {
      success: true,
      data: { roles: ["CUSTOMER"], permissions: [...permissions], dataScope: "OWN" },
      timestamp: new Date().toISOString(),
    },
    headers: {},
  }));
}
