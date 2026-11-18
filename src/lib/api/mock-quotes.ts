/**
 * Mock routes for the customer's quotes: GET /quotes, GET /quotes/{id}, GET /quotes/{id}/document,
 * POST /quotes/{id}/acceptance, POST /quotes/{id}/change-request (plan Phụ lục A.1), over one book
 * per page (mock-fixtures/quotes.ts). The chat mock reaches the same book through the two card
 * helpers below, so a quote answered on its page or on its chat card is one quote.
 */

import type { AxiosRequestConfig } from "axios";

import { registerMockRoute } from "./mock-adapter";
import { MOCK_CUSTOMER_ID } from "./mock-customer-addresses";
import type { MockResult } from "./mock-fixtures/orders";
import { createMockQuoteBook, type MockQuoteBook } from "./mock-fixtures/quotes";
import { emitMockChatEvent } from "./mock-fixtures/wf02";

export interface MockQuoteCardActionBody {
  version?: number;
  /** ACCEPT: quote line id → cartons; lines not named keep the proposed cartons. */
  cartons?: Record<string, number>;
  /** REQUEST_CHANGES: the feedback (required). */
  note?: string;
}

let book: MockQuoteBook | undefined;
/** The page's quote book, made on first use. */
const quotes = () => (book ??= createMockQuoteBook(MOCK_CUSTOMER_ID));

/** Test hook: start again from the seed (or from the given book). */
export function resetMockQuotes(next?: MockQuoteBook): void {
  book = next;
}

/**
 * A customer's QUOTE card action (chat C10), run through the same rules as POST /acceptance and
 * /change-request. The answer is the updated QuoteResponse envelope, or the quote's own refusal
 * envelope (QUOTE_BELOW_MOQ with `details { lineNo, sku, cartons, moq }`, QUOTE_EXPIRED,
 * OPTIMISTIC_LOCK, INVALID_QUOTE_TRANSITION, VALIDATION_FAILED…).
 */
export function mockQuoteCardAction(
  quoteId: string,
  action: "ACCEPT" | "REQUEST_CHANGES",
  body: MockQuoteCardActionBody,
): MockResult {
  return quotes().cardAction(quoteId, action, body);
}

/** The QUOTE card payload (plan B.7.3) of a quote as it is now; null for an unknown or unsent quote. */
export function mockQuoteCardPayload(quoteId: string): Record<string, unknown> | null {
  return quotes().cardPayload(quoteId);
}

const respond = (result: MockResult) => ({ status: result.status, data: result.data, headers: {} });

const idOf = (config: AxiosRequestConfig) =>
  (config as AxiosRequestConfig & { _mockParams?: Record<string, string> })._mockParams?.id ?? "";

function bodyOf(config: AxiosRequestConfig): Record<string, unknown> {
  let raw: unknown = config.data;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = undefined;
    }
  }
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

const queryOf = (config: AxiosRequestConfig): Record<string, unknown> =>
  config.params && typeof config.params === "object"
    ? (config.params as Record<string, unknown>)
    : {};

/** An answer given on the quote's page: the chat mock refreshes the quote's card (16 §4.3). */
function told(quoteId: string, result: MockResult): MockResult {
  if (result.status < 300) emitMockChatEvent({ type: "QUOTE_CHANGED", quoteId });
  return result;
}

export function registerQuoteMockRoutes(): void {
  registerMockRoute("GET", "/quotes", (config) => respond(quotes().page(queryOf(config))));
  registerMockRoute("GET", "/quotes/:id", (config) => respond(quotes().get(idOf(config))));
  registerMockRoute("GET", "/quotes/:id/document", (config) =>
    respond(quotes().document(idOf(config))),
  );
  registerMockRoute("POST", "/quotes/:id/acceptance", (config) =>
    respond(told(idOf(config), quotes().accept(idOf(config), bodyOf(config)))),
  );
  registerMockRoute("POST", "/quotes/:id/change-request", (config) =>
    respond(told(idOf(config), quotes().requestChanges(idOf(config), bodyOf(config)))),
  );
}
