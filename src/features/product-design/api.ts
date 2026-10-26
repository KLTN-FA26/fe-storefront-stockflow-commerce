import { z } from "zod";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";

import { documentByteSize } from "./engine/document/factory";
import { MAX_DOCUMENT_BYTES, type DesignDocument } from "./engine/document/schema";
import {
  artifactRoleSchema,
  changeReasonInputSchema,
  createDesignInputSchema,
  customizationDtoSchema,
  designArtifactDtoSchema,
  designAssetDtoSchema,
  designDecisionPageDtoSchema,
  designDocumentRecordDtoSchema,
  designDraftDtoSchema,
  designPageDtoSchema,
  designSnapshotDtoSchema,
  downloadLinkDtoSchema,
} from "./schemas";
import type {
  ArtifactRole,
  CreateDesignInput,
  Customization,
  DesignArtifact,
  DesignAsset,
  DesignDecisionPage,
  DesignDocumentRecord,
  DesignDraft,
  DesignListParams,
  DesignPage,
  DesignSnapshot,
  DownloadLink,
} from "./types";

// BE design controllers: /api/v1/designs/** — the /v1 prefix lives in API_URL. Writes echo the
// draft's `version` (optimistic lock → 409). Endpoints marked P1–P5 are proposed (spec §7.2): the
// real BE does not serve them yet, so a 405 there reads as "not shipped" (see `whenShipped`).

const withSignal = (signal?: AbortSignal) => (signal ? { signal } : {});
const designPath = (id: string, tail = "") => `/designs/${encodeURIComponent(id)}${tail}`;
const to0Based = (page: number) => Math.max(page, 1) - 1; // the BE is 0-based

/** Up to 50 MB of file on a slow line: more than the 15 s a JSON call gets. */
const UPLOAD_TIMEOUT_MS = 120_000;

/**
 * Runs a call to a proposed endpoint. A 405 (e.g. POST /designs/mine meets `GET /designs/{id}`) or,
 * with `missing404`, a 404 `NOT_FOUND` (no such route) becomes `DESIGN_API_UNAVAILABLE`. A 404
 * `PRODUCT_NOT_FOUND` is P1's own answer once shipped, so it passes through.
 */
async function whenShipped<T>(request: Promise<T>, { missing404 = false } = {}): Promise<T> {
  try {
    return await request;
  } catch (error) {
    if (error instanceof ApiError) {
      const noRoute =
        error.status === 405 ||
        (missing404 && error.status === 404 && error.code !== "PRODUCT_NOT_FOUND");
      if (noRoute) {
        throw new ApiError(
          404,
          "DESIGN_API_UNAVAILABLE",
          "The design API is not available on this backend",
          undefined,
          error.correlationId,
        );
      }
    }
    throw error;
  }
}

function multipart(file: Blob, name: string, idempotencyKey: string) {
  const body = new FormData();
  body.append("file", file, name);
  // The client's JSON default would make axios serialise the FormData to JSON.
  const headers = { "Content-Type": "multipart/form-data", "Idempotency-Key": idempotencyKey };
  return { body, headers, timeout: UPLOAD_TIMEOUT_MS };
}

// ── Reads ──

/** GET /designs — drafts the caller owns, is assigned to or reviews. `status` is P6 (BE ignores it). */
export async function listDesigns(p: DesignListParams, signal?: AbortSignal): Promise<DesignPage> {
  const { data } = await api.get<unknown>("/designs", {
    params: { page: to0Based(p.page), size: p.size, ...(p.status ? { status: p.status } : {}) },
    ...withSignal(signal),
  });
  const page = designPageDtoSchema.parse(data);
  return { ...page, page: page.page + 1 };
}

/** GET /designs/{id} */
export async function getDesign(id: string, signal?: AbortSignal): Promise<DesignDraft> {
  const { data } = await api.get<unknown>(designPath(id), withSignal(signal));
  return designDraftDtoSchema.parse(data);
}

/** GET /designs/{id}/history — the decision log. */
export async function getDesignHistory(
  id: string,
  p: { page: number; size: number },
  signal?: AbortSignal,
): Promise<DesignDecisionPage> {
  const { data } = await api.get<unknown>(designPath(id, "/history"), {
    params: { page: to0Based(p.page), size: p.size },
    ...withSignal(signal),
  });
  const page = designDecisionPageDtoSchema.parse(data);
  return { ...page, page: page.page + 1 };
}

/** GET /designs/{id}/snapshot — the immutable confirmed snapshot. */
export async function getDesignSnapshot(id: string, signal?: AbortSignal): Promise<DesignSnapshot> {
  const { data } = await api.get<unknown>(designPath(id, "/snapshot"), withSignal(signal));
  return designSnapshotDtoSchema.parse(data);
}

/** P2 GET /catalog/products/{slug}/customization */
export async function getCustomization(slug: string, signal?: AbortSignal): Promise<Customization> {
  const { data } = await whenShipped(
    api.get<unknown>(
      `/catalog/products/${encodeURIComponent(slug)}/customization`,
      withSignal(signal),
    ),
  );
  return customizationDtoSchema.parse(data);
}

// ── Create, document, assets ──

/** P1 POST /designs/mine — a customer starts a design (the BE's POST /designs is staff-only). */
export async function createDesign(input: CreateDesignInput): Promise<DesignDraft> {
  const body = createDesignInputSchema.parse(input);
  const { data } = await whenShipped(api.post<unknown>("/designs/mine", body), {
    missing404: true,
  });
  return designDraftDtoSchema.parse(data);
}

/** P3 GET /designs/{id}/document */
export async function getDesignDocument(
  id: string,
  signal?: AbortSignal,
): Promise<DesignDocumentRecord> {
  const { data } = await whenShipped(
    api.get<unknown>(designPath(id, "/document"), withSignal(signal)),
  );
  return designDocumentRecordDtoSchema.parse(data);
}

/** P3 PUT /designs/{id}/document — over `MAX_DOCUMENT_BYTES` is refused here, as the BE's 413. */
export async function saveDesignDocument(
  id: string,
  body: { version: number; document: DesignDocument },
): Promise<DesignDocumentRecord> {
  if (documentByteSize(body.document) > MAX_DOCUMENT_BYTES) {
    throw new ApiError(
      413,
      "PAYLOAD_TOO_LARGE",
      `The design document is larger than ${MAX_DOCUMENT_BYTES} bytes`,
    );
  }
  const { data } = await whenShipped(
    api.put<unknown>(designPath(id, "/document"), {
      version: body.version,
      document: body.document,
    }),
  );
  return designDocumentRecordDtoSchema.parse(data);
}

/** P4 GET /designs/{id}/assets */
export async function listDesignAssets(id: string, signal?: AbortSignal): Promise<DesignAsset[]> {
  const { data } = await whenShipped(
    api.get<unknown>(designPath(id, "/assets"), withSignal(signal)),
  );
  return z.array(designAssetDtoSchema).parse(data);
}

/** P4 POST /designs/{id}/assets — multipart `file`; a retry with the same key is answered once. */
export async function uploadDesignAsset(
  id: string,
  file: Blob,
  name: string,
  idempotencyKey: string,
): Promise<DesignAsset> {
  const { body, ...config } = multipart(file, name, idempotencyKey);
  const { data } = await whenShipped(api.post<unknown>(designPath(id, "/assets"), body, config));
  return designAssetDtoSchema.parse(data);
}

/** P4 GET /designs/{id}/assets/{assetId}/download-url */
export async function getAssetDownloadUrl(
  id: string,
  assetId: string,
  signal?: AbortSignal,
): Promise<DownloadLink> {
  const { data } = await whenShipped(
    api.get<unknown>(
      designPath(id, `/assets/${encodeURIComponent(assetId)}/download-url`),
      withSignal(signal),
    ),
  );
  return downloadLinkDtoSchema.parse(data);
}

// ── Artifacts ──

/** GET /designs/{id}/artifacts */
export async function listArtifacts(id: string, signal?: AbortSignal): Promise<DesignArtifact[]> {
  const { data } = await api.get<unknown>(designPath(id, "/artifacts"), withSignal(signal));
  return z.array(designArtifactDtoSchema).parse(data);
}

/**
 * POST /designs/{id}/artifacts?role= — png/jpeg/webp/pdf ≤ 50 MB. A new artifact becomes the
 * current one and resets the technical review.
 */
export async function uploadArtifact(
  id: string,
  role: ArtifactRole,
  file: Blob,
  name: string,
  idempotencyKey: string,
): Promise<DesignArtifact> {
  const params = { role: artifactRoleSchema.parse(role) };
  const { body, ...config } = multipart(file, name, idempotencyKey);
  const { data } = await api.post<unknown>(designPath(id, "/artifacts"), body, {
    ...config,
    params,
  });
  return designArtifactDtoSchema.parse(data);
}

/** GET /designs/{id}/artifacts/{artifactId}/download-url — presigned, `no-store`. */
export async function getArtifactDownloadUrl(
  id: string,
  artifactId: string,
  signal?: AbortSignal,
): Promise<DownloadLink> {
  const { data } = await api.get<unknown>(
    designPath(id, `/artifacts/${encodeURIComponent(artifactId)}/download-url`),
    withSignal(signal),
  );
  return downloadLinkDtoSchema.parse(data);
}

// ── Workflow ──

/** PUT /designs/{id}/specification — text ≤ 4000 characters; resets the technical review. */
export async function reviseSpecification(
  id: string,
  body: { version: number; spec: string },
): Promise<DesignDraft> {
  const { data } = await api.put<unknown>(designPath(id, "/specification"), {
    version: body.version,
    spec: body.spec,
  });
  return designDraftDtoSchema.parse(data);
}

/** P5 POST /designs/{id}/technical-review-requests — tells QC the customer is done. */
export async function requestTechnicalReview(
  id: string,
  body: { version: number },
): Promise<DesignDraft> {
  const { data } = await whenShipped(
    api.post<unknown>(designPath(id, "/technical-review-requests"), { version: body.version }),
  );
  return designDraftDtoSchema.parse(data);
}

/** POST /designs/{id}/confirmation-requests — DRAFT → SUBMITTED (needs a passed review). */
export async function submitForConfirmation(
  id: string,
  body: { version: number },
): Promise<DesignDraft> {
  const { data } = await api.post<unknown>(designPath(id, "/confirmation-requests"), {
    version: body.version,
  });
  return designDraftDtoSchema.parse(data);
}

/** POST /designs/{id}/confirmations — owner only; SUBMITTED → APPROVED with an immutable snapshot. */
export async function confirmDesign(
  id: string,
  body: { version: number; artifactId: string },
): Promise<DesignSnapshot> {
  const { data } = await api.post<unknown>(designPath(id, "/confirmations"), {
    version: body.version,
    artifactId: body.artifactId,
  });
  return designSnapshotDtoSchema.parse(data);
}

/** POST /designs/{id}/change-requests — SUBMITTED → DRAFT, with the customer's reason. */
export async function requestChanges(
  id: string,
  body: { version: number; reason: string },
): Promise<DesignDraft> {
  const { reason } = changeReasonInputSchema.parse(body);
  const { data } = await api.post<unknown>(designPath(id, "/change-requests"), {
    version: body.version,
    reason,
  });
  return designDraftDtoSchema.parse(data);
}

/** POST /designs/{id}/confirmation-withdrawals — SUBMITTED → DRAFT. */
export async function withdrawConfirmation(
  id: string,
  body: { version: number; reason: string },
): Promise<DesignDraft> {
  const { reason } = changeReasonInputSchema.parse(body);
  const { data } = await api.post<unknown>(designPath(id, "/confirmation-withdrawals"), {
    version: body.version,
    reason,
  });
  return designDraftDtoSchema.parse(data);
}

/** POST /designs/{id}/revisions — forks an APPROVED design into a new DRAFT. */
export async function forkDesign(id: string): Promise<DesignDraft> {
  const { data } = await api.post<unknown>(designPath(id, "/revisions"));
  return designDraftDtoSchema.parse(data);
}
