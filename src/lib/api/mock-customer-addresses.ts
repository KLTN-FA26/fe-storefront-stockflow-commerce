/**
 * Mock routes for the BE address book: /v1/customers/{customerId}/addresses.
 * Responses use the real ApiResponse envelope; the mock adapter rejects error statuses so the
 * client interceptor turns them into ApiError (fieldErrors, errorCode, correlationId).
 */

import type { AxiosRequestConfig } from "axios";

import { registerMockRoute } from "./mock-adapter";
import {
  createMockAddressBook,
  seedMockAddresses,
  type MockAddressBook,
  type MockResult,
} from "./mock-fixtures/customer-addresses";

/** Same id as the mock profile returned by GET /v1/customers/me (see mock-routes.ts). */
export const MOCK_CUSTOMER_ID = "CUS-0010";

const respond = (result: MockResult) => ({
  status: result.status,
  data: result.data,
  headers: {},
});

function params(config: AxiosRequestConfig): Record<string, string> {
  return (
    (config as AxiosRequestConfig & { _mockParams?: Record<string, string> })._mockParams ?? {}
  );
}

function body(config: AxiosRequestConfig): Record<string, unknown> {
  const raw: unknown = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

export function registerCustomerAddressMockRoutes(
  book: MockAddressBook = createMockAddressBook(
    MOCK_CUSTOMER_ID,
    seedMockAddresses(MOCK_CUSTOMER_ID),
  ),
): void {
  const BASE = "/v1/customers/:customerId/addresses";

  // BE `authorise`: another customer's book answers NOT_FOUND, hiding that it exists.
  const withOwnBook = (
    config: AxiosRequestConfig,
    run: (p: Record<string, string>) => MockResult,
  ) => {
    const p = params(config);
    if (p.customerId !== book.customerId) {
      return respond({
        status: 404,
        data: {
          success: false,
          errorCode: "NOT_FOUND",
          message: "Resource not found",
          timestamp: new Date().toISOString(),
        },
      });
    }
    return respond(run(p));
  };

  registerMockRoute("GET", BASE, (config) => withOwnBook(config, () => book.list()));
  registerMockRoute("POST", BASE, (config) => withOwnBook(config, () => book.add(body(config))));
  registerMockRoute("PUT", `${BASE}/:addressId`, (config) =>
    withOwnBook(config, (p) => book.update(p.addressId ?? "", body(config))),
  );
  registerMockRoute("DELETE", `${BASE}/:addressId`, (config) =>
    withOwnBook(config, (p) => book.remove(p.addressId ?? "")),
  );
  registerMockRoute("POST", `${BASE}/:addressId/default`, (config) =>
    withOwnBook(config, (p) => book.makeDefault(p.addressId ?? "")),
  );
}
