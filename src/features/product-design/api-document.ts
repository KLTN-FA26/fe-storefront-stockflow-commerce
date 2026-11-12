import { z } from "zod";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";

import { designPath, multipart, withSignal } from "./api-request";
import { documentByteSize } from "./engine/document/factory";
import { MAX_DOCUMENT_BYTES } from "./engine/document/schema";
import {
  designAssetDtoSchema,
  designDocumentRecordDtoSchema,
  downloadLinkDtoSchema,
} from "./schemas";
import type { DesignAsset, DesignDocumentRecord, DownloadLink, SaveDocumentInput } from "./types";

// A design's document and the images it places (spec 2026-11-09 §4.2, §4.5); re-exported by
// `api.ts`.

/** GET /designs/{id}/document */
export async function getDesignDocument(
  id: string,
  signal?: AbortSignal,
): Promise<DesignDocumentRecord> {
  const { data } = await api.get<unknown>(designPath(id, "/document"), withSignal(signal));
  return designDocumentRecordDtoSchema.parse(data);
}

/** PUT /designs/{id}/document — a save; over `MAX_DOCUMENT_BYTES` is refused here, as the 413. */
export async function saveDesignDocument(
  id: string,
  input: SaveDocumentInput,
): Promise<DesignDocumentRecord> {
  if (documentByteSize(input.document) > MAX_DOCUMENT_BYTES) {
    throw new ApiError(
      413,
      "PAYLOAD_TOO_LARGE",
      `The design document is larger than ${MAX_DOCUMENT_BYTES} bytes`,
    );
  }
  const { data } = await api.put<unknown>(designPath(id, "/document"), {
    version: input.version,
    document: input.document,
  });
  return designDocumentRecordDtoSchema.parse(data);
}

/** GET /designs/{id}/assets */
export async function listDesignAssets(id: string, signal?: AbortSignal): Promise<DesignAsset[]> {
  const { data } = await api.get<unknown>(designPath(id, "/assets"), withSignal(signal));
  return z.array(designAssetDtoSchema).parse(data);
}

/** POST /designs/{id}/assets — multipart `file`; a retry with the same key is answered once. */
export async function uploadDesignAsset(
  id: string,
  file: Blob,
  name: string,
  idempotencyKey: string,
): Promise<DesignAsset> {
  const body = new FormData();
  body.append("file", file, name);
  const config = multipart({ "Idempotency-Key": idempotencyKey });
  const { data } = await api.post<unknown>(designPath(id, "/assets"), body, config);
  return designAssetDtoSchema.parse(data);
}

/** GET /designs/{id}/assets/{assetId}/url — a short-lived link. */
export async function getAssetDownloadUrl(
  id: string,
  assetId: string,
  signal?: AbortSignal,
): Promise<DownloadLink> {
  const path = designPath(id, `/assets/${encodeURIComponent(assetId)}/url`);
  const { data } = await api.get<unknown>(path, withSignal(signal));
  return downloadLinkDtoSchema.parse(data);
}
