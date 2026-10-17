/**
 * Mock routes for the BE customer order history: /orders/me, /orders/me/{orderId},
 * /orders/{orderId}/cancellation. Responses use the real ApiResponse envelope; the mock adapter
 * rejects error statuses so the client interceptor turns them into ApiError.
 */

import type { AxiosRequestConfig } from "axios";

import { registerMockRoute } from "./mock-adapter";
import { MOCK_CUSTOMER_ID } from "./mock-customer-addresses";
import {
  createMockOrderBook,
  seedMockOrders,
  type MockOrderBook,
  type MockResult,
} from "./mock-fixtures/orders";

const respond = (result: MockResult) => ({ status: result.status, data: result.data, headers: {} });

function pathParams(config: AxiosRequestConfig): Record<string, string> {
  return (
    (config as AxiosRequestConfig & { _mockParams?: Record<string, string> })._mockParams ?? {}
  );
}

function queryParams(config: AxiosRequestConfig): Record<string, unknown> {
  const raw: unknown = config.params;
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

export function registerOrderMockRoutes(
  book: MockOrderBook = createMockOrderBook(MOCK_CUSTOMER_ID, seedMockOrders(MOCK_CUSTOMER_ID)),
): void {
  registerMockRoute("GET", "/orders/me", (config) => respond(book.page(queryParams(config))));
  registerMockRoute("GET", "/orders/me/:orderId", (config) =>
    respond(book.get(pathParams(config).orderId ?? "")),
  );
  registerMockRoute("POST", "/orders/:orderId/cancellation", (config) => {
    const reason = queryParams(config).reason;
    return respond(
      book.cancel(
        pathParams(config).orderId ?? "",
        typeof reason === "string" ? reason : undefined,
      ),
    );
  });
}
