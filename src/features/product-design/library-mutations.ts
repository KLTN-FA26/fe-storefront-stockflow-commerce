import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";

import {
  deleteLibraryItem,
  placeFromLibrary,
  saveImageToLibrary,
  saveTextStyle,
  uploadLibraryImage,
} from "./api";
import { hasErrorCode } from "@/lib/api/describe-error";

import { isDesignGone, isDesignStateChanged } from "./errors";
import { reReadProject } from "./project-mutations";
import { designKeys, projectKeys } from "./queries";
import type { SaveImageToLibraryInput, SaveTextStyleInput } from "./types";

// The writes on a project's library (spec 2026-11-12 §4), re-exported by `mutations.ts`. A change
// to the library re-reads the library and the project's history (`ASSET_ADDED` / `ASSET_REMOVED`);
// a refusal that says the project's state changed (`PROJECT_ARCHIVED`, `LIBRARY_FULL`) re-reads the
// whole project; any other refusal (a wrong file, a bad text) changes nothing the page shows.
// Placing an image in a design changes that design's images, never the library; and deleting a
// library item touches no design's images (docs 12 BR-18).

type UploadLibraryImageInput = { file: Blob; name: string; idempotencyKey: string };

// A library change moves the project's `updatedAt`, so the project and the lists are re-read too.
// The library and the history sit under the project's key: re-reading it covers both.
const reReadLibrary = (client: QueryClient, projectId: string) =>
  Promise.all([
    client.invalidateQueries({ queryKey: projectKeys.detail(projectId) }),
    client.invalidateQueries({ queryKey: projectKeys.lists() }),
  ]);

/** Only a refusal that says the project's state changed (closed, full) makes the page stale. */
const reReadWhenProjectChanged = (client: QueryClient, projectId: string, error: unknown) => {
  if (hasErrorCode(error, "PROJECT_ARCHIVED") || hasErrorCode(error, "LIBRARY_FULL")) {
    void reReadProject(client, projectId);
  }
};

/** Adds an image file (`mutate({ file, name, idempotencyKey })`, default file rules, 30 at most). */
export function useUploadLibraryImage(projectId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ file, name, idempotencyKey }: UploadLibraryImageInput) =>
      uploadLibraryImage(projectId, file, name, idempotencyKey),
    onSuccess: () => reReadLibrary(client, projectId),
    onError: (error) => reReadWhenProjectChanged(client, projectId, error),
  });
}

/** Copies an image of a design into the library (`mutate({ designId, assetId })`). */
export function useSaveImageToLibrary(projectId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveImageToLibraryInput) => saveImageToLibrary(projectId, input),
    onSuccess: () => reReadLibrary(client, projectId),
    onError: (error) => reReadWhenProjectChanged(client, projectId, error),
  });
}

/** Saves a text and its style (`mutate({ text, style })`, 30 at most, apart from the images). */
export function useSaveTextStyle(projectId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveTextStyleInput) => saveTextStyle(projectId, input),
    onSuccess: () => reReadLibrary(client, projectId),
    onError: (error) => reReadWhenProjectChanged(client, projectId, error),
  });
}

/** Removes an item (`mutate(itemId)`); the designs that used it keep their copies (BR-18). */
export function useDeleteLibraryItem(projectId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => deleteLibraryItem(projectId, itemId),
    onSuccess: () => reReadLibrary(client, projectId),
    onError: (error) => reReadWhenProjectChanged(client, projectId, error),
  });
}

/**
 * Copies a library image into the design (`mutate(libraryItemId)`), where it becomes one of its
 * images. A 422 FILE_RULE leaves everything as it was; a design that moved on (409), is gone
 * (404) or left the project meanwhile (422 NOT_IN_PROJECT, in another tab) is re-read, so the
 * studio follows and stops offering that library.
 */
export function usePlaceFromLibrary(designId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (libraryItemId: string) => placeFromLibrary(designId, libraryItemId),
    onSuccess: () => client.invalidateQueries({ queryKey: designKeys.assets(designId) }),
    onError: (error) => {
      if (
        isDesignStateChanged(error) ||
        isDesignGone(error) ||
        hasErrorCode(error, "NOT_IN_PROJECT")
      ) {
        void client.invalidateQueries({ queryKey: designKeys.detail(designId), exact: true });
      }
    },
  });
}
