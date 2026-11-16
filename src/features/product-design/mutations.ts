import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";

import {
  cloneDesign,
  createDesign,
  createRevision,
  deleteDesign,
  renameDesign,
  saveDesignDocument,
  uploadDesignAsset,
} from "./api";
import { isDesignConflict, isDesignGone, isDesignStateChanged } from "./errors";
import { reReadProject, reReadProjects } from "./project-mutations";
import { designKeys, projectKeys } from "./queries";
import type {
  CloneDesignInput,
  Design,
  DesignDocumentRecord,
  RenameDesignInput,
  SaveDocumentInput,
} from "./types";

// What each write re-reads (spec 2026-11-09 §4.4). A write whose answer is the fresh design puts
// it in the cache instead of refetching it: a refetch racing the next autosave could land with an
// older version and turn that save into a 409.

export {
  useDeleteLibraryItem,
  usePlaceFromLibrary,
  useSaveImageToLibrary,
  useSaveTextStyle,
  useUploadLibraryImage,
} from "./library-mutations";
export {
  useAddDesignToProject,
  useArchiveProject,
  useCreateProject,
  useRemoveDesignFromProject,
  useUpdateProject,
} from "./project-mutations";

export type UploadAssetInput = { file: Blob; name: string; idempotencyKey: string };
export type DeleteDesignTarget = { id: string; version: number };

/**
 * Re-reads a design after its status changed — a submit, or the reviewer's approve / return: the
 * design itself, its history and files, the lists and the draft count. The document and images
 * are left alone (the editor holds them), so `detail(id)` is matched exactly.
 */
export function invalidateDesign(client: QueryClient, id: string) {
  return Promise.all([
    client.invalidateQueries({ queryKey: designKeys.detail(id), exact: true }),
    client.invalidateQueries({ queryKey: designKeys.history(id) }),
    client.invalidateQueries({ queryKey: designKeys.files(id) }),
    client.invalidateQueries({ queryKey: designKeys.lists() }),
    client.invalidateQueries({ queryKey: designKeys.draftCount() }),
    reReadProjects(client),
  ]);
}

/** A design's new drafts change the lists and the draft count. */
const reReadDrafts = (client: QueryClient) =>
  Promise.all([
    client.invalidateQueries({ queryKey: designKeys.lists() }),
    client.invalidateQueries({ queryKey: designKeys.draftCount() }),
  ]);

/**
 * A write refused because the design moved on (another tab submitted it, the reviewer answered) or
 * is gone (another tab deleted it): 409 `DESIGN_NOT_DRAFT`, 404, and the plain 409 `CONFLICT` the BE
 * answers a stale tab first, since it checks the version before the status (`DesignWorkflow`).
 * Re-read it, so the studio follows its new status, or says it is gone (spec §9). A write that
 * handles a CONFLICT itself (the autosaver) passes `conflict: false`.
 */
function reReadWhenStateChanged(
  client: QueryClient,
  id: string,
  error: unknown,
  { conflict = true }: { conflict?: boolean } = {},
) {
  const moved = isDesignStateChanged(error) || isDesignGone(error);
  if (!moved && !(conflict && isDesignConflict(error))) return;
  void client.invalidateQueries({ queryKey: designKeys.detail(id), exact: true });
  void client.invalidateQueries({ queryKey: designKeys.lists() });
}

/**
 * POST /designs. The caller opens the studio of the draft it gets back. With a `projectId` the
 * draft starts inside that project, so the project is re-read too (its count, its strip).
 */
export function useCreateDesign() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: createDesign,
    onSuccess: (_design, input) =>
      Promise.all([
        reReadDrafts(client),
        input.projectId ? reReadProject(client, input.projectId) : undefined,
      ]),
  });
}

/** "Tạo bản sửa" (`mutate(approvedId)`); the caller opens the new draft. */
export function useCreateRevision() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => createRevision(id),
    // ASSUMPTION (A-E3, as for a clone): a revision joins its source's project when that is
    // ACTIVE and has room; a closed project takes none (BR-22).
    onSuccess: () => Promise.all([reReadDrafts(client), reReadProjects(client)]),
  });
}

/**
 * "Nhân bản sang cỡ khác" (`mutate({ variantSku, document })`); the caller opens the new draft. The
 * copy is a new draft and may join the source's project (A-E3): lists, draft count and projects
 * are re-read. A source another tab deleted or moved on is re-read too.
 */
export function useCloneDesign(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ idempotencyKey, ...input }: CloneDesignInput & { idempotencyKey: string }) =>
      cloneDesign(id, input, idempotencyKey),
    onSuccess: () => Promise.all([reReadDrafts(client), reReadProjects(client)]),
    onError: (error) => reReadWhenStateChanged(client, id, error),
  });
}

/**
 * A read of the design under way (a poll, a focus) answers what the server held before this write:
 * it is called off before the write's answer goes into the cache, so it cannot put it back.
 */
const cancelDesignRead = (client: QueryClient, id: string) =>
  client.cancelQueries({ queryKey: designKeys.detail(id), exact: true });

/**
 * Rename moves the version on: the answer becomes the cached design, so the next write sends it,
 * and the cached document's version follows (one version for the design and its document, docs 12
 * BR-11). The caller hands the new version to autosave. A stale version (409 CONFLICT:
 * another tab saved or renamed) re-reads the design, so trying again sends the current one.
 */
export function useRenameDesign(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: RenameDesignInput) => renameDesign(id, input),
    onSuccess: async (design) => {
      await cancelDesignRead(client, id);
      client.setQueryData(designKeys.detail(id), design);
      client.setQueryData<DesignDocumentRecord>(
        designKeys.document(id),
        (record) => record && { ...record, version: design.version },
      );
      void client.invalidateQueries({ queryKey: designKeys.lists() });
      void reReadProjects(client); // a project card shows the design's name
    },
    // A stale version (409 CONFLICT) re-reads the design too, so trying again sends the current one.
    onError: (error) => reReadWhenStateChanged(client, id, error),
  });
}

/**
 * For the autosaver's `save`. The record becomes the cached document, and its version and time the
 * cached design's. No refetch is awaited: the autosaver must not wait on one to send its next
 * version. A stale version (409 CONFLICT) is left to the conflict dialog.
 */
export function useSaveDesignDocument(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveDocumentInput) => saveDesignDocument(id, input),
    onSuccess: async (record) => {
      await cancelDesignRead(client, id);
      client.setQueryData(designKeys.document(id), record);
      client.setQueryData<Design>(
        designKeys.detail(id),
        (design) => design && { ...design, version: record.version, updatedAt: record.updatedAt },
      );
      void client.invalidateQueries({ queryKey: designKeys.lists() });
      // The project page shows the design's preview and time: stale, not awaited (autosave).
      const projectId = client.getQueryData<Design>(designKeys.detail(id))?.projectId;
      // `exact`: the library and the history nest under the detail, and every autosave would read
      // them again (and re-sign each library image).
      if (projectId) {
        void client.invalidateQueries({ queryKey: projectKeys.detail(projectId), exact: true });
      }
    },
    // The autosaver reads the design itself on a CONFLICT (status moved on, or a reload dialog).
    onError: (error) => reReadWhenStateChanged(client, id, error, { conflict: false }),
  });
}

/**
 * The idempotency key belongs to the file, not to the attempt: the caller makes one per picked
 * file, so a retry of the same variables is answered once by the server.
 */
export function useUploadAsset(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ file, name, idempotencyKey }: UploadAssetInput) =>
      uploadDesignAsset(id, file, name, idempotencyKey),
    onSuccess: () => client.invalidateQueries({ queryKey: designKeys.assets(id) }),
    onError: (error) => reReadWhenStateChanged(client, id, error),
  });
}

/**
 * Deletes a draft (`mutate({ id, version })`): DRAFT → ARCHIVED (docs 12 BR-16). Its cache goes;
 * the lists and the draft count are re-read whatever the answer, as a refusal means they are stale.
 */
export function useDeleteDesign() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version }: DeleteDesignTarget) => deleteDesign(id, { version }),
    onSuccess: (_design, { id }) => client.removeQueries({ queryKey: designKeys.detail(id) }),
    // A draft submitted in another tab answers 409 (CONFLICT, or DESIGN_NOT_DRAFT): re-read it.
    onError: (error, { id }) => reReadWhenStateChanged(client, id, error),
    // A project's count, strip and gates change with its designs, whatever the answer.
    onSettled: () => Promise.all([reReadDrafts(client), reReadProjects(client)]),
  });
}
