import { useQuery } from "@tanstack/react-query";

import { QUERY_TIMES } from "@/lib/api/query-client";

import { getMySalesOptions, getMySalesOwner, listMyOwnerChangeRequests } from "./api";

export const salesOwnerKeys = {
  all: ["customer", "sales-owner"] as const,
  mine: () => [...salesOwnerKeys.all, "mine"] as const,
  options: () => [...salesOwnerKeys.all, "options"] as const,
  requests: () => [...salesOwnerKeys.all, "change-requests"] as const,
};

// `retry: false`: a 4xx is "not available", and a 5xx must not hold the account page in a loading state.

export function useMySalesOwner(enabled = true) {
  return useQuery({
    queryKey: salesOwnerKeys.mine(),
    queryFn: ({ signal }) => getMySalesOwner(signal),
    enabled,
    retry: false,
    ...QUERY_TIMES.detail,
  });
}

export function useMySalesOptions(enabled = true) {
  return useQuery({
    queryKey: salesOwnerKeys.options(),
    queryFn: ({ signal }) => getMySalesOptions(signal),
    enabled,
    retry: false,
    ...QUERY_TIMES.master,
  });
}

export function useMyOwnerChangeRequests(enabled = true) {
  return useQuery({
    queryKey: salesOwnerKeys.requests(),
    queryFn: ({ signal }) => listMyOwnerChangeRequests(signal),
    enabled,
    retry: false,
    ...QUERY_TIMES.list,
  });
}
