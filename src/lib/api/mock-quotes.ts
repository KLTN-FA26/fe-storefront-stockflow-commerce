/**
 * STUB — filled by the quotes work (WF-02 D2). Keep the exported signatures: the chat mock calls
 * the two helpers for its QUOTE cards.
 *
 * Mock routes for the customer's quotes: GET /quotes, GET /quotes/{id}, GET /quotes/{id}/document,
 * POST /quotes/{id}/acceptance, POST /quotes/{id}/change-request (plan Phụ lục A.1).
 */

import type { MockResult } from "./mock-fixtures/orders";

export interface MockQuoteCardActionBody {
  version?: number;
  /** ACCEPT: quote line id → cartons; lines not named keep the proposed cartons. */
  cartons?: Record<string, number>;
  /** REQUEST_CHANGES: the feedback (required). */
  note?: string;
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
  void quoteId;
  void action;
  void body;
  return {
    status: 404,
    data: { success: false, errorCode: "NOT_FOUND", message: "Không tìm thấy báo giá." },
  };
}

/** The QUOTE card payload (plan B.7.3) of a quote as it is now; null for an unknown or unsent quote. */
export function mockQuoteCardPayload(quoteId: string): Record<string, unknown> | null {
  void quoteId;
  return null;
}

export function registerQuoteMockRoutes(): void {}
