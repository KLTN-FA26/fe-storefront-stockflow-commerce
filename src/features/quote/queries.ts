import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { z } from "zod";

import { QUERY_TIMES } from "@/lib/api/query-client";

import { getMyQuotes, getQuote } from "./api";
import { isApiError } from "./errors";
import { isValidQuoteId } from "./schemas";
import type { MyQuotesParams } from "./types";

export const quoteKeys = {
  all: ["quotes"] as const,
  lists: () => [...quoteKeys.all, "list"] as const,
  list: (params: MyQuotesParams) => [...quoteKeys.lists(), params] as const,
  details: () => [...quoteKeys.all, "detail"] as const,
  detail: (quoteId: string) => [...quoteKeys.details(), quoteId.toLowerCase()] as const,
};

export const QUOTE_PAGE_SIZE = 10;

/** Retry network blips and 5xx only: a 4xx or a contract break (ZodError) answers the same again. */
const retryTransient = (failureCount: number, error: unknown) =>
  !(isApiError(error) && error.isClientError) && !(error instanceof z.ZodError) && failureCount < 2;

export function useMyQuotes(params: MyQuotesParams) {
  return useQuery({
    queryKey: quoteKeys.list(params),
    queryFn: ({ signal }) => getMyQuotes(params, signal),
    placeholderData: keepPreviousData,
    retry: retryTransient,
    ...QUERY_TIMES.list,
  });
}

export function useQuote(quoteId: string) {
  return useQuery({
    queryKey: quoteKeys.detail(quoteId),
    queryFn: ({ signal }) => getQuote(quoteId, signal),
    // A malformed id never reaches the BE; the screen renders not-found for it instead.
    enabled: isValidQuoteId(quoteId),
    retry: retryTransient,
    ...QUERY_TIMES.detail,
  });
}
