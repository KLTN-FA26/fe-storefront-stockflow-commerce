import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { ApiError } from "@/lib/api/error";

import {
  confirmDesign,
  createDesign,
  forkDesign,
  requestChanges,
  saveDesignDocument,
  submitForConfirmation,
  uploadDesignAsset,
  withdrawConfirmation,
} from "./api";
import type { DesignDocument } from "./engine/document/schema";
import { deriveUiState } from "./lifecycle";
import { designKeys } from "./queries";
import type { DesignDraft } from "./types";

/** What a workflow write needs from the design the customer is looking at. */
export type DesignWriteTarget = Pick<DesignDraft, "version" | "currentArtifactId">;
export type FinalizeTarget = DesignWriteTarget & Pick<DesignDraft, "status">;
export type DesignReasonInput = { version: number; reason: string };
export type UploadAssetInput = { file: Blob; name: string; idempotencyKey: string };

/**
 * Re-reads a design after a workflow step: the draft itself, the lists that show it, and its
 * history, artifacts and snapshot. The document and the images are left alone (the editor holds
 * them; `detail(id)` is matched exactly so their keys below it are not swept up).
 */
export function invalidateDesign(client: QueryClient, id: string) {
  return Promise.all([
    client.invalidateQueries({ queryKey: designKeys.detail(id), exact: true }),
    client.invalidateQueries({ queryKey: designKeys.lists() }),
    client.invalidateQueries({ queryKey: designKeys.history(id) }),
    client.invalidateQueries({ queryKey: designKeys.artifacts(id) }),
    client.invalidateQueries({ queryKey: designKeys.snapshot(id) }),
  ]);
}

/** The artifact the customer saw is the one they confirm; without one there is nothing to confirm. */
function artifactToConfirm({ currentArtifactId }: DesignWriteTarget) {
  if (!currentArtifactId) {
    throw new ApiError(
      409,
      "DESIGN_ARTIFACT_MISSING",
      "The design has no current artifact to confirm",
    );
  }
  return currentArtifactId;
}

/**
 * Workflow writes settle with a re-read, success or not: a 409 means the cached version is
 * stale, and a finalize can fail after its first half went through. Returning the promise keeps
 * the mutation pending until the design on screen is the BE's.
 */
const reReadOnSettled = (client: QueryClient, id: string) => ({
  onSettled: () => invalidateDesign(client, id),
});

/** P1. The caller navigates to the studio of the draft it gets back. */
export function useCreateDesign() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: createDesign,
    onSuccess: () => client.invalidateQueries({ queryKey: designKeys.lists() }),
  });
}

/** Forks an APPROVED design (`mutate(sourceId)`); the caller navigates to the new draft. */
export function useForkDesign() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: forkDesign,
    onSuccess: () => client.invalidateQueries({ queryKey: designKeys.lists() }),
  });
}

/**
 * P4. The idempotency key belongs to the file, not to the attempt: the caller makes one per
 * picked file so a retry of the same variables is answered once by the BE.
 */
export function useUploadAsset(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ file, name, idempotencyKey }: UploadAssetInput) =>
      uploadDesignAsset(id, file, name, idempotencyKey),
    onSuccess: () => client.invalidateQueries({ queryKey: designKeys.assets(id) }),
  });
}

/**
 * P3, for the autosaver's `save`. The record becomes the cached document and its version the
 * cached design's (the document shares the draft's version). The BE resets the technical review
 * on a save, so a design that was past editing is re-read to show where it stands now. Not awaited:
 * the autosaver must not wait on a refetch to send its next version.
 */
export function useSaveDesignDocument(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { version: number; document: DesignDocument }) =>
      saveDesignDocument(id, body),
    onSuccess: (record) => {
      const cached = client.getQueryData<DesignDraft>(designKeys.detail(id));
      client.setQueryData(designKeys.document(id), record);
      client.setQueryData<DesignDraft>(
        designKeys.detail(id),
        (draft) => draft && { ...draft, version: record.version },
      );
      void client.invalidateQueries({ queryKey: designKeys.lists() });
      if (cached && deriveUiState(cached) !== "editing") {
        void client.invalidateQueries({ queryKey: designKeys.detail(id), exact: true });
      }
    },
  });
}

/** "Chốt thiết kế": submit a DRAFT, then confirm the artifact with the version the submit returned. */
export function useFinalizeDesign(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (target: FinalizeTarget) => {
      const artifactId = artifactToConfirm(target); // before anything is submitted
      const ready = target.status === "DRAFT" ? await submitForConfirmation(id, target) : target;
      return confirmDesign(id, { version: ready.version, artifactId });
    },
    ...reReadOnSettled(client, id),
  });
}

/** Confirms a design Sales submitted (SUBMITTED → APPROVED). */
export function useConfirmDesign(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (target: DesignWriteTarget) =>
      confirmDesign(id, { version: target.version, artifactId: artifactToConfirm(target) }),
    ...reReadOnSettled(client, id),
  });
}

/** SUBMITTED → DRAFT with the customer's reason. */
export function useRequestChanges(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: DesignReasonInput) => requestChanges(id, input),
    ...reReadOnSettled(client, id),
  });
}

/** SUBMITTED → DRAFT: the customer takes the confirmation request back. */
export function useWithdrawConfirmation(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: DesignReasonInput) => withdrawConfirmation(id, input),
    ...reReadOnSettled(client, id),
  });
}
