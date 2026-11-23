/**
 * Mock routes for the BE orders a customer reaches: /orders/me,
 * /orders/me/{orderId} and /orders/{orderId}/cancellation, and the customer's
 * contract installments (GET /installments/me, /installments/me/orders/{orderId},
 * /installments/me/{installmentId}/transfer-instructions), and the customer's returns
 * (/orders/{orderId}/returns, /returns/me…, mock-fixtures/returns). Responses use the real ApiResponse
 * envelope; the mock adapter rejects error statuses so the client interceptor turns them into
 * ApiError. `GET /orders` (the back-office list) is not mocked here.
 */

import type { AxiosRequestConfig } from "axios";

import { registerMockRoute } from "./mock-adapter";
import { registerDocumentMockRoutes } from "./mock-documents";
import { MOCK_CUSTOMER_ID } from "./mock-customer-addresses";
import {
  createMockOrderBook,
  seedMockOrders,
  seededMockOrderId,
  seededMockOrderIndex,
  type MockOrderBook,
  type MockOrderDeps,
  type MockResult,
} from "./mock-fixtures/orders";
import {
  createMockReturnBook,
  seedMockReturns,
  type MockReturnBook,
} from "./mock-fixtures/returns";

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
  registerMockRoute("GET", "/orders/credit-position/me", () => respond(book.creditPosition()));
  registerMockRoute("GET", "/orders/me", (config) => respond(book.page(queryParams(config))));
  registerMockRoute("GET", "/orders/me/:orderId", (config) =>
    respond(book.get(pathParams(config).orderId ?? "")),
  );
  registerMockRoute("GET", "/einvoices/me", (config) =>
    respond(book.myEInvoices(queryParams(config))),
  );
  registerMockRoute("GET", "/einvoices/me/:id", (config) =>
    respond(book.myEInvoice(pathParams(config).id ?? "")),
  );
  registerMockRoute("GET", "/einvoices/me/:id/error-notices", (config) =>
    respond(book.myEInvoiceErrorNotices(pathParams(config).id ?? "")),
  );
  registerMockRoute("GET", "/einvoices/me/:id/files/:kind", (config) =>
    respond(book.myEInvoiceFile(pathParams(config).id ?? "", pathParams(config).kind ?? "PDF")),
  );
  registerMockRoute("GET", "/refunds/me/orders/:orderId", (config) =>
    respond(book.myOrderRefund(pathParams(config).orderId ?? "")),
  );
  registerMockRoute("GET", "/installments/me", (config) =>
    respond(book.myInstallments(queryParams(config))),
  );
  registerMockRoute("GET", "/installments/me/orders/:orderId", (config) =>
    respond(book.orderInstallments(pathParams(config).orderId ?? "")),
  );
  registerMockRoute("GET", "/installments/me/:installmentId/transfer-instructions", (config) =>
    respond(book.installmentTransfer(pathParams(config).installmentId ?? "")),
  );
  // Before `/installments/me/:installmentId`: the first registered pattern that matches wins.
  registerDocumentMockRoutes();
  registerMockRoute("GET", "/installments/me/:installmentId", (config) =>
    respond(book.installment(pathParams(config).installmentId ?? "")),
  );
  registerMockRoute("POST", "/orders/:orderId/cancellation", (config) =>
    respond(book.cancel(pathParams(config).orderId ?? "", bodyOf(config))),
  );
  registerReturnMockRoutes(defaultReturnBook(book));
}

function defaultReturnBook(book: MockOrderBook): MockReturnBook {
  const orderOf = (orderId: string) => book.ownOrder(orderId);
  const returns = createMockReturnBook(
    book.customerId,
    orderOf,
    seedMockReturns(book.customerId, orderOf, {
      awaiting: seededMockOrderId(seededMockOrderIndex("DELIVERED")),
      resolved: seededMockOrderId(seededMockOrderIndex("RETURNED")),
    }),
  );
  // The order detail's shipments say what a return may still claim, net of these returns.
  book.attachReturnClaims(returns.claimsOf);
  return returns;
}

export function registerReturnMockRoutes(returns: MockReturnBook): void {
  registerMockRoute("POST", "/orders/:orderId/returns", (config) =>
    respond(returns.open(pathParams(config).orderId ?? "", bodyOf(config))),
  );
  registerMockRoute("GET", "/returns/me", (config) => respond(returns.mine(queryParams(config))));
  registerMockRoute("GET", "/returns/me/:returnId", (config) =>
    respond(returns.one(pathParams(config).returnId ?? "")),
  );
  registerMockRoute("POST", "/returns/:returnId/evidence", (config) => {
    const file = config.data instanceof FormData ? config.data.get("file") : null;
    const name = file instanceof File ? file.name : undefined;
    return respond(returns.addEvidence(pathParams(config).returnId ?? "", name));
  });
  registerMockRoute("GET", "/returns/:returnId/evidence/:evidenceId/download-url", (config) =>
    respond(
      returns.evidenceLink(pathParams(config).returnId ?? "", pathParams(config).evidenceId ?? ""),
    ),
  );
  registerMockRoute("POST", "/returns/:returnId/cancellation", (config) =>
    respond(returns.cancel(pathParams(config).returnId ?? "")),
  );
}
