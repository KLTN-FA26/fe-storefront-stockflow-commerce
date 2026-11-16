import { z } from "zod";

import { api } from "@/lib/api/client";

import { designPath, multipart, withSignal } from "./api-request";
import { libraryTextInputSchema, saveImageToLibraryInputSchema } from "./library-schemas";
import { projectAssetDtoSchema, projectTextDtoSchema, type ProjectAssetDto } from "./project-dtos";
import { toLibraryImage, toLibraryText } from "./project-mappers";
import { designAssetDtoSchema, downloadLinkDtoSchema } from "./schemas";
import type {
  DesignAsset,
  LibraryImage,
  LibraryItem,
  LibraryText,
  SaveImageToLibraryInput,
  SaveTextStyleInput,
} from "./types";

// The project library against the BE's API (F-33 … F-36); re-exported by `api.ts`. The BE keeps
// images (`…/assets`) and texts (`…/texts`) apart; the screens read one list with a `kind`.

const projectPath = (projectId: string, tail = "") =>
  `/design-projects/${encodeURIComponent(projectId)}${tail}`;

/** A library image's preview link (inline, no audit); null when it cannot be had, the tile then has none. */
async function previewLinkOf(
  projectId: string,
  assetId: string,
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    const { data } = await api.get<unknown>(
      projectPath(projectId, `/assets/${encodeURIComponent(assetId)}/download-url`),
      withSignal(signal),
    );
    return downloadLinkDtoSchema.parse(data).url;
  } catch (error) {
    if (signal?.aborted) throw error;
    return null;
  }
}

/**
 * The library, newest first: `GET …/assets` and `GET …/texts` merged (F-33), and one read of each
 * image's preview link (F-34), so a library of n images costs 2 + n reads; a link that fails
 * leaves its tile without a preview. The two lists are read together.
 */
export async function listProjectLibrary(
  projectId: string,
  signal?: AbortSignal,
): Promise<LibraryItem[]> {
  const [assets, texts] = await Promise.all([
    api.get<unknown>(projectPath(projectId, "/assets"), withSignal(signal)),
    api.get<unknown>(projectPath(projectId, "/texts"), withSignal(signal)),
  ]);
  const images = z.array(projectAssetDtoSchema).parse(assets.data);
  const links = await Promise.all(
    images.map((image) => previewLinkOf(projectId, image.assetId, signal)),
  );
  const all: LibraryItem[] = [
    ...images.map((image, i) => toLibraryImage(image, links[i] ?? null)),
    ...z.array(projectTextDtoSchema).parse(texts.data).map(toLibraryText),
  ];
  return all.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** A library file just written: its preview is read with the next listing. */
const written = (dto: ProjectAssetDto): LibraryImage => toLibraryImage(dto, null);

/**
 * POST …/assets — multipart `file` (PNG, JPEG or WebP), 30 per project; 409
 * `DESIGN_PROJECT_LIBRARY_FULL`, 415 / 413 with a message only, 429 after 120 uploads an hour. A
 * retry with the same key is answered once.
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
  const { data } = await api.post<unknown>(projectPath(projectId, "/assets"), body, config);
  return written(projectAssetDtoSchema.parse(data));
}

/** POST …/assets/from-design — copies an image of one of the project's designs into the library (201). */
export async function saveImageToLibrary(
  projectId: string,
  input: SaveImageToLibraryInput,
): Promise<LibraryImage> {
  const body = saveImageToLibraryInputSchema.parse(input);
  const { data } = await api.post<unknown>(projectPath(projectId, "/assets/from-design"), body);
  return written(projectAssetDtoSchema.parse(data));
}

/** POST …/texts — a text and its style (201); 409 `DESIGN_PROJECT_LIBRARY_FULL` at 30 texts. */
export async function saveTextStyle(
  projectId: string,
  input: SaveTextStyleInput,
): Promise<LibraryText> {
  const body = libraryTextInputSchema.parse(input);
  const { data } = await api.post<unknown>(projectPath(projectId, "/texts"), body);
  return toLibraryText(projectTextDtoSchema.parse(data));
}

/**
 * DELETE …/assets/{assetId} or …/texts/{textId} by the item's `kind` (F-36); the BE answers 204 with
 * no body, so the item itself is the answer. The designs that used it keep their copy (BR-18).
 */
export async function deleteLibraryItem(
  projectId: string,
  item: Pick<LibraryItem, "id" | "kind">,
): Promise<Pick<LibraryItem, "id" | "kind">> {
  const tail = item.kind === "TEXT" ? "texts" : "assets";
  await api.delete<unknown>(projectPath(projectId, `/${tail}/${encodeURIComponent(item.id)}`));
  return item;
}

/**
 * POST /designs/{id}/assets/library `{ assetId }` — a copy of a library image as an image of the
 * design (F-24). The library item's id is the file's `assetId`. The design's template refusing it
 * is a 415 (format) or 413 (size) with a `message` only: the screens word the reason from the
 * template (`describeFileRefusal`). A file not of the design's project is a 404.
 */
export async function placeFromLibrary(
  designId: string,
  libraryItemId: string,
): Promise<DesignAsset> {
  const { data } = await api.post<unknown>(designPath(designId, "/assets/library"), {
    assetId: libraryItemId,
  });
  return designAssetDtoSchema.parse(data);
}
