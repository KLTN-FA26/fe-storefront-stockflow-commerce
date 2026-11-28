import { skipToken, useQuery } from "@tanstack/react-query";

import { QUERY_TIMES } from "@/lib/api/query-client";
import { retryTransient } from "@/lib/api/retry";

import { listDesignQuoteRequests, listProjectQuoteRequests } from "./api";
import { projectKeys } from "./project-queries";
import { designKeys } from "./queries";
import type { DesignQuoteRequest, ProjectQuoteRequest } from "./types";

// The quote requests of a design or a project (A-3, A-7), read where they are shown: a design's
// card, the studio of an approved design, the project page.

/**
 * What the cards of a list read with: every approved card asks once, and the ask and the send
 * mutations re-read the key themselves, so a list that is shown again within 5 minutes (a tab
 * switch, a focus) costs no request per card.
 */
export const CARD_QUOTE_REQUESTS = {
  staleTime: 5 * 60_000,
  refetchOnWindowFocus: false as const,
} as const;

/**
 * A design's requests, newest first. `enabled` is false for a design that cannot have one
 * (`mayHaveQuoteRequest`): a page of drafts never asked about costs no request. `options` widens the
 * freshness of the cache (`CARD_QUOTE_REQUESTS`); every observer of the key should pass the same.
 */
export function useDesignQuoteRequests(
  designId: string,
  enabled = true,
  options: { staleTime: number; refetchOnWindowFocus: false } | undefined = undefined,
) {
  return useQuery({
    queryKey: designKeys.quoteRequests(designId),
    queryFn: enabled ? ({ signal }) => listDesignQuoteRequests(designId, signal) : skipToken,
    retry: retryTransient,
    ...QUERY_TIMES.detail,
    ...options,
  });
}

/**
 * A project's requests, newest first; a closed project's are readable too. The list of projects
 * reads them per card with `CARD_QUOTE_REQUESTS` (UI/UX 27/11, sf-11).
 */
export function useProjectQuoteRequests(
  projectId: string,
  options: { staleTime: number; refetchOnWindowFocus: false } | undefined = undefined,
) {
  return useQuery({
    queryKey: projectKeys.quoteRequests(projectId),
    queryFn: ({ signal }) => listProjectQuoteRequests(projectId, signal),
    retry: retryTransient,
    ...QUERY_TIMES.detail,
    ...options,
  });
}

/**
 * The request a card shows: the open one (at most one per design or project), else the newest
 * closed one; null when none was ever asked.
 */
export function currentQuoteRequest<T extends DesignQuoteRequest | ProjectQuoteRequest>(
  requests: readonly T[] | undefined,
): T | null {
  if (!requests?.length) return null;
  return requests.find((request) => request.status === "OPEN") ?? requests[0] ?? null;
}

/** The request still open, which a new ask changes instead of opening another. */
export const openQuoteRequest = <T extends DesignQuoteRequest | ProjectQuoteRequest>(
  requests: readonly T[] | undefined,
): T | null => requests?.find((request) => request.status === "OPEN") ?? null;
