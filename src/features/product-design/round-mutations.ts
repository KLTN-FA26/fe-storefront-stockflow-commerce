import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { getProject, openReviewRound, recordSetPreflightFailure, uploadSubmission } from "./api";
import { isDesignGone, isDesignStateChanged } from "./errors";
import { reReadProject, reReadProjects } from "./project-mutations";
import { designKeys, projectKeys } from "./queries";
import type { OpenReviewRoundInput, SetPreflightFailureInput, SubmissionFiles } from "./types";

// "Gửi duyệt cả bộ" (spec 2026-11-12 §8, docs 12 BR-19): each design's files go up on their own,
// then one call opens the round. The project's history records a failed check of the set.

export type SubmissionUploadInput = {
  designId: string;
  files: SubmissionFiles;
  /** Belongs to the files: every retry of the same files sends the same key. */
  idempotencyKey: string;
};

/**
 * The designs of an opened round are PENDING_REVIEW: each is re-read as after a submit (itself,
 * its history, its files), and what they share once — the lists, the draft count, the projects —
 * so a round of 20 does not refetch the page's project 20 times.
 */
export function reReadRound(client: QueryClient, designIds: readonly string[]) {
  return Promise.all([
    ...designIds.flatMap((id) => [
      client.invalidateQueries({ queryKey: designKeys.detail(id), exact: true }),
      client.invalidateQueries({ queryKey: designKeys.history(id) }),
      client.invalidateQueries({ queryKey: designKeys.files(id) }),
    ]),
    client.invalidateQueries({ queryKey: designKeys.lists() }),
    client.invalidateQueries({ queryKey: designKeys.draftCount() }),
    reReadProjects(client),
  ]);
}

/**
 * Whether the round of exactly these designs is the project's open one, read afresh: the answer
 * to opening it may be lost on the way while the round opened all the same. When it is, its
 * designs are re-read as after a successful call.
 */
export async function roundIsOpen(
  client: QueryClient,
  projectId: string,
  designIds: readonly string[],
): Promise<boolean> {
  const project = await client.fetchQuery({
    queryKey: projectKeys.detail(projectId),
    queryFn: ({ signal }) => getProject(projectId, signal),
    staleTime: 0,
    retry: false, // the customer is waiting to hear: "Thử lại" asks again
  });
  const open = project.openRound;
  const same =
    open !== null &&
    open.designIds.length === designIds.length &&
    designIds.every((id) => open.designIds.includes(id));
  if (same) await reReadRound(client, designIds);
  return same;
}

/**
 * Records a failed check of a set in the project's history (docs 12 §5.4 BATCH_PREFLIGHT_FAILED)
 * and re-reads that history. Like a design's own record (`recordFailure`), it answers the failure
 * instead of throwing: the customer sees what failed either way.
 */
export async function recordSetFailures(
  client: QueryClient,
  projectId: string,
  items: SetPreflightFailureInput["items"],
): Promise<unknown> {
  try {
    await recordSetPreflightFailure(projectId, { items });
    void client.invalidateQueries({ queryKey: projectKeys.history(projectId) });
    return undefined;
  } catch (error) {
    return error;
  }
}

/**
 * Uploads one design's files for a set (`mutate({ designId, files, idempotencyKey })`). An upload
 * changes nothing a screen reads, so nothing is re-read; a design that moved on meanwhile (409
 * INVALID_STATE) or is gone (404) is.
 */
export function useSubmissionUpload() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ designId, files, idempotencyKey }: SubmissionUploadInput) =>
      uploadSubmission(designId, files, idempotencyKey),
    onError: (error, { designId }) => {
      if (!isDesignStateChanged(error) && !isDesignGone(error)) return;
      return Promise.all([
        client.invalidateQueries({ queryKey: designKeys.detail(designId), exact: true }),
        client.invalidateQueries({ queryKey: designKeys.lists() }),
      ]);
    },
  });
}

/**
 * Opens the project's review round (`mutate({ items })`): its designs are re-read
 * (`reReadRound`). A refusal changed nothing, but says what the page showed is stale (a design
 * edited, sent or taken out meanwhile, the project closed): the project and the design lists are
 * re-read.
 */
export function useOpenReviewRound(projectId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: OpenReviewRoundInput) => openReviewRound(projectId, input),
    onSuccess: (round) => reReadRound(client, round.designIds),
    onError: () =>
      Promise.all([
        reReadProject(client, projectId),
        client.invalidateQueries({ queryKey: designKeys.lists() }),
      ]),
  });
}
