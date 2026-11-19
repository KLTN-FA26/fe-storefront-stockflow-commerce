import { useMutation, useQueryClient } from "@tanstack/react-query";

import { hasErrorCode } from "@/lib/api/describe-error";

import { requestDesignQuote, requestProjectQuote } from "./api";
import { isDesignGone } from "./errors";
import { projectKeys } from "./project-queries";
import { designKeys } from "./queries";
import type {
  DesignQuoteRequest,
  ProjectQuoteRequest,
  ProjectQuoteRequestInput,
  QuoteRequestInput,
} from "./types";

// Asking for a quote (A-1, A-6) and what each ask re-reads. An ask does not move the design: its
// requests and its history change (the BE writes `QUOTE_REQUESTED`), nothing else. A refusal that
// says the design or project moved on (no longer approved, closed, gone) re-reads it as well.

/** "Yêu cầu báo giá" on an APPROVED design. */
export function useRequestDesignQuote(designId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: QuoteRequestInput) => requestDesignQuote(designId, input),
    onSuccess: (outcome) => {
      // The answer is the request as it is now: the newest of the list (one is open at a time).
      client.setQueryData<DesignQuoteRequest[]>(designKeys.quoteRequests(designId), (now = []) => [
        outcome.request,
        ...now.filter((request) => request.id !== outcome.request.id),
      ]);
      void client.invalidateQueries({ queryKey: designKeys.quoteRequests(designId) });
      void client.invalidateQueries({ queryKey: designKeys.history(designId) });
    },
    onError: (error) => {
      if (hasErrorCode(error, "DESIGN_NOT_APPROVED") || isDesignGone(error)) {
        void client.invalidateQueries({ queryKey: designKeys.detail(designId), exact: true });
        void client.invalidateQueries({ queryKey: designKeys.lists() });
      }
    },
  });
}

/** "Yêu cầu báo giá cả dự án": approved designs of an open project, one shared date. */
export function useRequestProjectQuote(projectId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: ProjectQuoteRequestInput) => requestProjectQuote(projectId, input),
    onSuccess: (outcome) => {
      client.setQueryData<ProjectQuoteRequest[]>(
        projectKeys.quoteRequests(projectId),
        (now = []) => [
          outcome.request,
          ...now.filter((request) => request.id !== outcome.request.id),
        ],
      );
      void client.invalidateQueries({ queryKey: projectKeys.quoteRequests(projectId) });
      void client.invalidateQueries({ queryKey: projectKeys.history(projectId) });
    },
    onError: (error) => {
      // Closed elsewhere, a design no longer approved, or gone: the page reads the project again.
      if (
        hasErrorCode(error, "DESIGN_PROJECT_ARCHIVED") ||
        hasErrorCode(error, "DESIGN_NOT_APPROVED") ||
        isDesignGone(error)
      ) {
        void client.invalidateQueries({ queryKey: projectKeys.detail(projectId), exact: true });
      }
    },
  });
}
