/**
 * Query-key roots that more than one feature invalidates. A feature must not import another's
 * `queryKeys` (feature boundaries), so the shared root lives here and the owner builds on it.
 */
export const ORDERS_QUERY_ROOT = ["orders"] as const;

/** The customer's chat: the order page refreshes it when a choice made there changes a card in the thread. */
export const CHAT_QUERY_ROOT = ["chat", "me"] as const;
