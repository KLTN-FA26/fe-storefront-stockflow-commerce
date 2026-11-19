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
 * A design's requests, newest first. `enabled` is false for a design that cannot have one
 * (`mayHaveQuoteRequest`): a page of drafts never asked about costs no request.
 */
export function useDesignQuoteRequests(designId: string, enabled = true) {
  return useQuery({
    queryKey: designKeys.quoteRequests(designId),
    queryFn: enabled ? ({ signal }) => listDesignQuoteRequests(designId, signal) : skipToken,
    retry: retryTransient,
    ...QUERY_TIMES.detail,
  });
}

/** A project's requests, newest first; a closed project's are readable too. */
export function useProjectQuoteRequests(projectId: string) {
  return useQuery({
    queryKey: projectKeys.quoteRequests(projectId),
    queryFn: ({ signal }) => listProjectQuoteRequests(projectId, signal),
    retry: retryTransient,
    ...QUERY_TIMES.detail,
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
