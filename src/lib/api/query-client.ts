/**
 * TanStack React Query — client factory + default options.
 *
 * PRODUCTION-FRONTEND-RULES §2.2:
 *   List    → 30s / 5m
 *   Detail  → 60s / 10m
 *   Master  → 10m / 30m
 */

import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./error";

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
        retry: (failureCount, error) => {
          if (error instanceof ApiError && error.isClientError) return false;
          return failureCount < 2;
        },
      },
      mutations: {
        retry: false,
      },
    },
  });
}

export const QUERY_TIMES = {
  list: { staleTime: 30_000, gcTime: 5 * 60_000 },
  detail: { staleTime: 60_000, gcTime: 10 * 60_000 },
  master: { staleTime: 10 * 60_000, gcTime: 30 * 60_000, refetchOnWindowFocus: false as const },
  dashboard: { staleTime: 15_000, gcTime: 2 * 60_000 },
  tracking: { staleTime: 10_000, gcTime: 2 * 60_000 },
} as const;
