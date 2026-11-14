import { useQuery } from "@tanstack/react-query";

import { QUERY_TIMES } from "@/lib/api/query-client";
import { ORDERS_QUERY_ROOT } from "@/lib/api/query-keys";
import { retryTransient } from "@/lib/api/retry";

import { getMyCreditPosition } from "./api";

/** Under the orders root: an order cancelled or paid changes what the customer owes. */
export const creditPositionKeys = {
  mine: [...ORDERS_QUERY_ROOT, "credit-position", "me"] as const,
};

export function useMyCreditPosition(enabled = true) {
  return useQuery({
    queryKey: creditPositionKeys.mine,
    queryFn: ({ signal }) => getMyCreditPosition(signal),
    enabled,
    retry: retryTransient,
    ...QUERY_TIMES.list,
  });
}
