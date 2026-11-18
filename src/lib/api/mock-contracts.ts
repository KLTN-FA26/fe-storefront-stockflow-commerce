/**
 * STUB — filled by the contract work (WF-02 D3). Keep the exported signatures: the chat mock calls
 * `mockContractCardPayload` for its CONTRACT cards.
 *
 * Mock routes for the customer's contract of an order: GET /orders/me/{orderId}/contract and
 * GET /orders/me/{orderId}/contract/document (plan Phụ lục A.2, customer view).
 */

/** The CONTRACT card payload (plan B.7.4) of an order's contract; null when it has none sent. */
export function mockContractCardPayload(orderId: string): Record<string, unknown> | null {
  void orderId;
  return null;
}

export function registerContractMockRoutes(): void {}
