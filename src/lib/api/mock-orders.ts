/**
 * Mock routes for the BE orders a customer reaches: POST /orders (checkout), /orders/me,
 * /orders/me/{orderId} and /orders/{orderId}/cancellation. Responses use the real ApiResponse
 * envelope; the mock adapter rejects error statuses so the client interceptor turns them into
 * ApiError. `GET /orders` (the back-office list) is not mocked here.
 */

import type { AxiosRequestConfig } from "axios";

import { registerMockRoute } from "./mock-adapter";
import { MOCK_CUSTOMER_ID } from "./mock-customer-addresses";
import {
  createMockOrderBook,
  seedMockOrders,
  type MockOrderBook,
  type MockOrderDeps,
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

function bodyOf(config: AxiosRequestConfig): Record<string, unknown> | undefined {
  const raw: unknown = typeof config.data === "string" ? safeParse(config.data) : config.data;
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : undefined;
}

const safeParse = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

export function registerOrderMockRoutes(
  deps: MockOrderDeps = {},
  book: MockOrderBook = createMockOrderBook(
    MOCK_CUSTOMER_ID,
    seedMockOrders(MOCK_CUSTOMER_ID),
    deps,
  ),
): void {
  registerMockRoute("POST", "/orders", (config) => respond(book.place(bodyOf(config) ?? {})));
  registerMockRoute("GET", "/orders/me", (config) => respond(book.page(queryParams(config))));
  registerMockRoute("GET", "/orders/me/:orderId", (config) =>
    respond(book.get(pathParams(config).orderId ?? "")),
  );
  registerMockRoute("POST", "/orders/:orderId/cancellation", (config) =>
    respond(book.cancel(pathParams(config).orderId ?? "", bodyOf(config))),
  );
}
