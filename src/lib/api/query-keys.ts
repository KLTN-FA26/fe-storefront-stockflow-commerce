/**
 * Query-key roots that more than one feature invalidates. A feature must not import another's
 * `queryKeys` (feature boundaries), so the shared root lives here and the owner builds on it.
 */
export const ORDERS_QUERY_ROOT = ["orders"] as const;
