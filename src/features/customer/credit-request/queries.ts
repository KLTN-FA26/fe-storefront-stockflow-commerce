import { useQuery } from "@tanstack/react-query";

import { QUERY_TIMES } from "@/lib/api/query-client";

import { getCreditRequest, listMyCreditRequests } from "./api";

export const creditRequestKeys = {
  all: ["customer", "credit-requests"] as const,
  mine: (page: number) => ["customer", "credit-requests", "mine", page] as const,
  detail: (id: string) => ["customer", "credit-requests", "detail", id] as const,
};

export function useMyCreditRequests(page: number, enabled = true) {
  return useQuery({
    queryKey: creditRequestKeys.mine(page),
    queryFn: ({ signal }) => listMyCreditRequests(page, 10, signal),
    enabled,
    ...QUERY_TIMES.list,
  });
}

export function useCreditRequest(id: string, enabled = true) {
  return useQuery({
    queryKey: creditRequestKeys.detail(id),
    queryFn: ({ signal }) => getCreditRequest(id, signal),
    enabled,
    ...QUERY_TIMES.detail,
  });
}
