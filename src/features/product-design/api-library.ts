import { z } from "zod";

import { api } from "@/lib/api/client";

import { designPath, multipart, withSignal } from "./api-request";
import {
  libraryImageSchema,
  libraryItemSchema,
  libraryTextInputSchema,
  libraryTextSchema,
  saveImageToLibraryInputSchema,
} from "./library-schemas";
import { designAssetDtoSchema } from "./schemas";
import type {
  DesignAsset,
  LibraryImage,
  LibraryItem,
  LibraryText,
  SaveImageToLibraryInput,
  SaveTextStyleInput,
} from "./types";

// The project library (spec 2026-11-12 §4); re-exported by `api.ts`.

const libraryPath = (projectId: string, tail = "") =>
  `/design-projects/${encodeURIComponent(projectId)}/library${tail}`;

/** GET /design-projects/{id}/library — images and text styles, newest first. */
export async function listProjectLibrary(
  projectId: string,
  signal?: AbortSignal,
): Promise<LibraryItem[]> {
  const { data } = await api.get<unknown>(libraryPath(projectId), withSignal(signal));
  return z.array(libraryItemSchema).parse(data);
}

/**
 * POST …/library/images — multipart `file`, checked against the default file rules (422
 * FILE_REJECTED); 422 LIBRARY_FULL at 30 images. A retry with the same key is answered once.
 */
export async function uploadLibraryImage(
  projectId: string,
  file: Blob,
  name: string,
  idempotencyKey: string,
): Promise<LibraryImage> {
  const body = new FormData();
  body.append("file", file, name);
  const config = multipart({ "Idempotency-Key": idempotencyKey });
  const { data } = await api.post<unknown>(libraryPath(projectId, "/images"), body, config);
  return libraryImageSchema.parse(data);
}

/** POST …/library/images/from-design — copies an image of a design into the library. */
export async function saveImageToLibrary(
  projectId: string,
  input: SaveImageToLibraryInput,
): Promise<LibraryImage> {
  const body = saveImageToLibraryInputSchema.parse(input);
  const { data } = await api.post<unknown>(libraryPath(projectId, "/images/from-design"), body);
  return libraryImageSchema.parse(data);
}

/** POST …/library/texts — a text and its style; 422 LIBRARY_FULL at 30 text styles. */
export async function saveTextStyle(
  projectId: string,
  input: SaveTextStyleInput,
): Promise<LibraryText> {
  const body = libraryTextInputSchema.parse(input);
  const { data } = await api.post<unknown>(libraryPath(projectId, "/texts"), body);
  return libraryTextSchema.parse(data);
}

/** DELETE …/library/{itemId} — answers the removed item; the designs that used it keep theirs (BR-18). */
export async function deleteLibraryItem(projectId: string, itemId: string): Promise<LibraryItem> {
  const { data } = await api.delete<unknown>(
    libraryPath(projectId, `/${encodeURIComponent(itemId)}`),
  );
  return libraryItemSchema.parse(data);
}

/**
 * POST /designs/{id}/assets/from-library — a copy of a library image as an image of the design;
 * 422 FILE_RULE when the design's variant refuses it, `details` naming the rule (BR-18).
 */
export async function placeFromLibrary(
  designId: string,
  libraryItemId: string,
): Promise<DesignAsset> {
  const { data } = await api.post<unknown>(designPath(designId, "/assets/from-library"), {
    libraryItemId,
  });
  return designAssetDtoSchema.parse(data);
}
