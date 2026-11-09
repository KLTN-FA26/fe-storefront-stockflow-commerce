import { z } from "zod";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";

import { documentByteSize } from "./engine/document/factory";
import { MAX_DOCUMENT_BYTES } from "./engine/document/schema";
import { sha256Hex } from "./engine/export/checksum";
import {
  createDesignInputSchema,
  designAssetDtoSchema,
  designDocumentRecordDtoSchema,
  designDtoSchema,
  designEventDtoSchema,
  designFileDtoSchema,
  designFileRoleSchema,
  designPageDtoSchema,
  downloadLinkDtoSchema,
  draftCountDtoSchema,
  printConfigDtoSchema,
  renameDesignInputSchema,
} from "./schemas";
import type {
  CreateDesignInput,
  DeleteDesignInput,
  Design,
  DesignAsset,
  DesignDocumentRecord,
  DesignEvent,
  DesignFile,
  DesignListParams,
  DesignPage,
  DownloadLink,
  DraftCount,
  PreflightFailureInput,
  PrintConfig,
  RenameDesignInput,
  SaveDocumentInput,
  SubmitDesignInput,
} from "./types";

// The design API of spec 2026-11-09 §4.2 (/api/v1/designs/**; the /v1 prefix lives in API_URL).
// Each answer is parsed here, once. Every write sends the design's `version` (docs 12 BR-11): a
// stale one answers 409 VERSION_CONFLICT, a design in another status 409 INVALID_STATE.

const withSignal = (signal?: AbortSignal) => (signal ? { signal } : {});
const designPath = (id: string, tail = "") => `/designs/${encodeURIComponent(id)}${tail}`;
const to0Based = (page: number) => Math.max(page, 1) - 1; // the wire is 0-based

/** Up to 50 MB of file on a slow line: more than the 15 s a JSON call gets. */
const UPLOAD_TIMEOUT_MS = 120_000;
/** Without it the client's JSON default would make axios serialise the FormData to JSON. */
const multipart = (headers: Record<string, string> = {}) => ({
  headers: { "Content-Type": "multipart/form-data", ...headers },
  timeout: UPLOAD_TIMEOUT_MS,
});

/** A copy of the bytes over a plain ArrayBuffer, which Blob and SubtleCrypto require. */
const ownBytes = (bytes: Uint8Array) => bytes.slice();

// ── Designs ──

/** GET /designs?status=&page=&size= — the caller's designs, newest updated first. */
export async function listDesigns(p: DesignListParams, signal?: AbortSignal): Promise<DesignPage> {
  const { data } = await api.get<unknown>("/designs", {
    params: { page: to0Based(p.page), size: p.size, ...(p.status ? { status: p.status } : {}) },
    ...withSignal(signal),
  });
  const page = designPageDtoSchema.parse(data);
  return { ...page, page: page.page + 1 };
}

/** GET /designs/draft-count — `{ drafts, limit }` (docs 12 §4.1, B37). */
export async function getDraftCount(signal?: AbortSignal): Promise<DraftCount> {
  const { data } = await api.get<unknown>("/designs/draft-count", withSignal(signal));
  return draftCountDtoSchema.parse(data);
}

/** POST /designs — a DRAFT from a variant with a print configuration. */
export async function createDesign(input: CreateDesignInput): Promise<Design> {
  const { data } = await api.post<unknown>("/designs", createDesignInputSchema.parse(input));
  return designDtoSchema.parse(data);
}

/** GET /designs/{id} */
export async function getDesign(id: string, signal?: AbortSignal): Promise<Design> {
  const { data } = await api.get<unknown>(designPath(id), withSignal(signal));
  return designDtoSchema.parse(data);
}

/** PATCH /designs/{id} — a DRAFT only; the rename moves the version on. */
export async function renameDesign(id: string, input: RenameDesignInput): Promise<Design> {
  const { name } = renameDesignInputSchema.parse(input);
  const { data } = await api.patch<unknown>(designPath(id), { name, version: input.version });
  return designDtoSchema.parse(data);
}

/** GET /designs/{id}/history — the events, oldest first (docs 12 §5.3). */
export async function getDesignHistory(id: string, signal?: AbortSignal): Promise<DesignEvent[]> {
  const { data } = await api.get<unknown>(designPath(id, "/history"), withSignal(signal));
  return z.array(designEventDtoSchema).parse(data);
}

/** DELETE /designs/{id} with `{ version }` — DRAFT → ARCHIVED, never restored (docs 12 BR-16). */
export async function deleteDesign(id: string, input: DeleteDesignInput): Promise<Design> {
  const { data } = await api.delete<unknown>(designPath(id), { data: { version: input.version } });
  return designDtoSchema.parse(data);
}

/** POST /designs/{id}/revisions — a new DRAFT from an APPROVED design's snapshot (docs 12 BR-12). */
export async function createRevision(id: string): Promise<Design> {
  const { data } = await api.post<unknown>(designPath(id, "/revisions"));
  return designDtoSchema.parse(data);
}

// ── Document and images ──

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

// ── Submitting ──

/**
 * POST /designs/{id}/submissions — multipart `version`, `preflight` (JSON), `checksums` (JSON,
 * SHA-256 hex by role, for the server to check what it received) and one file part per role.
 * DRAFT → PENDING_REVIEW; a preflight the server re-checks and fails is 422 PREFLIGHT_FAILED.
 */
export async function submitDesign(id: string, input: SubmitDesignInput): Promise<Design> {
  const { version, preflight, files } = input;
  const parts = await Promise.all(
    designFileRoleSchema.options.map(async (role) => {
      const bytes = ownBytes(files[role].bytes);
      return { role, bytes, sha256: await sha256Hex(bytes) };
    }),
  );
  const body = new FormData();
  body.append("version", String(version));
  body.append("preflight", JSON.stringify({ result: preflight.result, issues: preflight.issues }));
  body.append(
    "checksums",
    JSON.stringify(Object.fromEntries(parts.map((p) => [p.role, p.sha256]))),
  );
  for (const { role, bytes } of parts) {
    body.append(role, new Blob([bytes], { type: files[role].type }), files[role].name);
  }
  const { data } = await api.post<unknown>(designPath(id, "/submissions"), body, multipart());
  return designDtoSchema.parse(data);
}

/**
 * POST /designs/{id}/preflight-failures — records a submit the browser's preflight refused
 * (docs 12 §5.3 `PREFLIGHT_FAILED`); the design stays as it is.
 */
export async function recordPreflightFailure(
  id: string,
  input: PreflightFailureInput,
): Promise<DesignEvent> {
  const { data } = await api.post<unknown>(designPath(id, "/preflight-failures"), {
    version: input.version,
    issues: input.issues,
  });
  return designEventDtoSchema.parse(data);
}

/** GET /designs/{id}/files — the bundle of the latest submission; `[]` before one. */
export async function listDesignFiles(id: string, signal?: AbortSignal): Promise<DesignFile[]> {
  const { data } = await api.get<unknown>(designPath(id, "/files"), withSignal(signal));
  return z.array(designFileDtoSchema).parse(data);
}

// ── Catalogue ──

/** GET /catalog/products/{slug}/variants/{sku}/print-config — 404 when the variant has none. */
export async function getPrintConfig(
  productSlug: string,
  sku: string,
  signal?: AbortSignal,
): Promise<PrintConfig> {
  const path = `/catalog/products/${encodeURIComponent(productSlug)}/variants/${encodeURIComponent(sku)}/print-config`;
  const { data } = await api.get<unknown>(path, withSignal(signal));
  return printConfigDtoSchema.parse(data);
}
