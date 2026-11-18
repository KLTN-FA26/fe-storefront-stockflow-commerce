/**
 * What the WF-02 mocks (design quote requests, quotes, contracts, chat) share, so one demo story
 * runs through all of them: the ids of the seeded documents, and a small event bus the document
 * mocks use to tell the chat mock what happened (the BE posts or refreshes chat cards after commit,
 * kltn-docs 16 §4.2–§4.4; here the chat mock listens instead).
 *
 * Mock layer only: nothing outside `src/lib/api/mock-*` imports this file.
 */

import { seededMockOrderId, seededMockOrderIndex } from "./orders";

/** The seeded quotes of the demo customer, one per state a customer can meet. */
export const MOCK_QUOTE_IDS = {
  /** SENT and still valid: the customer can accept it or ask for changes (DS-02a steps 4–5). */
  sent: "5a1e0000-0000-4000-8000-000000000001",
  /** CHANGES_REQUESTED: waiting for Sales to open the next revision. */
  changesRequested: "5a1e0000-0000-4000-8000-000000000002",
  /** EXPIRED: read only. */
  expired: "5a1e0000-0000-4000-8000-000000000003",
  /** CONVERTED into the order that has a SENT contract (`MOCK_CONTRACT_ORDER_IDS.sent`). */
  converted: "5a1e0000-0000-4000-8000-000000000004",
} as const;

/** The orders that carry a contract the customer can read (GET /orders/me/{id}/contract). */
export const MOCK_CONTRACT_ORDER_IDS = {
  /** PENDING_CONTRACT: the contract is SENT, waiting to be signed. The order mock must seed it. */
  sent: "0c0e0000-0000-4000-8000-000000000001",
  /** The seeded PENDING_PAYMENT order: its contract is SIGNED, the deposit instalment DUE. */
  signed: seededMockOrderId(seededMockOrderIndex("PENDING_PAYMENT")),
} as const;

/** What the document mocks report to the chat mock. Payload shapes: plan Phụ lục B §B.7. */
export type MockChatEvent =
  /** A design quote request was opened (`created`) or asked again; payload = B.7.1. */
  | { type: "DESIGN_QUOTE_REQUESTED"; created: boolean; payload: Record<string, unknown> }
  /** A project quote request was opened or asked again; payload = B.7.2. */
  | { type: "PROJECT_QUOTE_REQUESTED"; created: boolean; payload: Record<string, unknown> }
  /** A quote changed state outside the chat (accepted / changes asked on the quote page). */
  | { type: "QUOTE_CHANGED"; quoteId: string };

type Listener = (event: MockChatEvent) => void;
const listeners = new Set<Listener>();

/** Subscribes the chat mock; returns the unsubscribe. */
export function onMockChatEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Tells every listener; a mock without the chat registered (design-only mock) tells no one. */
export function emitMockChatEvent(event: MockChatEvent): void {
  for (const listener of listeners) listener(event);
}
