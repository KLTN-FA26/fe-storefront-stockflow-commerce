/**
 * Mock routes for the customer's contract of an order: GET /orders/me/{orderId}/contract and
 * GET /orders/me/{orderId}/delivery-batches (the schedule in force), GET /orders/me/{orderId}/contract/document (plan Phụ lục A.2, customer view), over one book per
 * page (mock-fixtures/contracts.ts) on the seeded orders. The chat mock reads the same book through
 * `mockContractCardPayload` for its CONTRACT cards.
 */

import type { AxiosRequestConfig } from "axios";

import { registerMockRoute } from "./mock-adapter";
import { MOCK_CUSTOMER_ID } from "./mock-customer-addresses";
import {
  createMockContractBook,
  mockSentContract,
  mockSignedContract,
  type MockContractBook,
} from "./mock-fixtures/contracts";
import { seedMockOrders, type MockResult } from "./mock-fixtures/orders";
import { MOCK_CONTRACT_ORDER_IDS } from "./mock-fixtures/wf02";

/** The demo customer's contracts over the seeded orders (the order mock seeds the same orders). */
export function createDefaultMockContractBook(now = new Date()): MockContractBook {
  const orders = seedMockOrders(MOCK_CUSTOMER_ID);
  const orderOf = (orderId: string) => orders.find((order) => order.orderId === orderId);
  const sentOrder = orderOf(MOCK_CONTRACT_ORDER_IDS.sent);
  const signedOrder = orderOf(MOCK_CONTRACT_ORDER_IDS.signed);
  return createMockContractBook(MOCK_CUSTOMER_ID, orderOf, [
    ...(sentOrder ? [mockSentContract(sentOrder, now)] : []),
    ...(signedOrder ? [mockSignedContract(signedOrder)] : []),
  ]);
}

let book: MockContractBook | undefined;
const contracts = () => (book ??= createDefaultMockContractBook());

/** Test hook: start again from the seed (or from the given book). */
export function resetMockContracts(next?: MockContractBook): void {
  book = next;
}

/** The CONTRACT card payload (plan B.7.4) of an order's contract; null when it has none sent. */
export function mockContractCardPayload(orderId: string): Record<string, unknown> | null {
  return contracts().cardPayload(orderId);
}

const respond = (result: MockResult) => ({ status: result.status, data: result.data, headers: {} });

const orderIdOf = (config: AxiosRequestConfig) =>
  (config as AxiosRequestConfig & { _mockParams?: Record<string, string> })._mockParams?.orderId ??
  "";

const copyOf = (config: AxiosRequestConfig): string | undefined => {
  const copy = (config.params as { copy?: unknown } | undefined)?.copy;
  return typeof copy === "string" ? copy : undefined;
};

export function registerContractMockRoutes(): void {
  registerMockRoute("GET", "/orders/me/:orderId/contract", (config) =>
    respond(contracts().get(orderIdOf(config))),
  );
  registerMockRoute("GET", "/orders/me/:orderId/delivery-batches", (config) =>
    respond(contracts().schedule(orderIdOf(config))),
  );
  registerMockRoute("GET", "/orders/me/:orderId/contract/document", (config) =>
    respond(contracts().document(orderIdOf(config), copyOf(config))),
  );
}
