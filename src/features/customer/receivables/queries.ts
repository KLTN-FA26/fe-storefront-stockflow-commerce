import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { QUERY_TIMES } from "@/lib/api/query-client";
import { retryTransient } from "@/lib/api/retry";

import { getMyReceivables } from "./api";

export const RECEIVABLES_PAGE_SIZE = 10;

export const receivableKeys = {
  all: ["receivables"] as const,
  list: (page: number) => [...receivableKeys.all, "me", page] as const,
};

/** The customer's own receivables, one zero-based page at a time. */
export function useMyReceivables(page: number, enabled = true) {
  return useQuery({
    queryKey: receivableKeys.list(page),
    queryFn: ({ signal }) => getMyReceivables({ page, size: RECEIVABLES_PAGE_SIZE }, signal),
    enabled,
    placeholderData: keepPreviousData,
    retry: retryTransient,
    ...QUERY_TIMES.list,
  });
}
