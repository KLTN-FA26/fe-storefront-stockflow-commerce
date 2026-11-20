import { z } from "zod";

import { api } from "@/lib/api/client";

import { designFromAnswer } from "./api-designs";
import { quoteRequestBody } from "./api-quote-requests";
import { designPath, multipart, withSignal } from "./api-request";
import {
  designArtifactDtoSchema,
  designDecisionDtoSchema,
  designDraftDtoSchema,
  designSnapshotDtoSchema,
  type DesignArtifactDto,
} from "./design-dtos";
import { toDesignEvent, toDesignFiles } from "./design-mappers";
import { beRuleOf } from "./preflight-messages";
import { designFileRoleSchema, downloadLinkDtoSchema } from "./schemas";
import type {
  Design,
  DesignEvent,
  DesignFile,
  DesignFileRole,
  DownloadLink,
  PreflightFailureInput,
  QuoteRequestInput,
  SubmissionFile,
  SubmissionFiles,
  SubmitDesignInput,
} from "./types";
import { artifactUploadKey } from "./upload-key";

// Sending a design for review and the files it was sent with, against the BE's flow (F-19, F-21);
// re-exported by `api.ts`. The variant's print configuration is in `api-print-config.ts`.

/** The BE takes 1 to 50 findings of the studio's own preflight. */
const MAX_REPORTED_ISSUES = 50;

const isOverArrayBuffer = (bytes: Uint8Array): bytes is Uint8Array<ArrayBuffer> =>
  bytes.buffer instanceof ArrayBuffer;

/**
 * `bytes` over a plain ArrayBuffer, which Blob and SubtleCrypto take: the very same array when it
 * already is one (a 50 MB print file is not copied), a copy only of a view over shared memory.
 */
export const plainBytes = (bytes: Uint8Array): Uint8Array<ArrayBuffer> =>
  isOverArrayBuffer(bytes) ? bytes : bytes.slice();

/**
 * One of the three files of a design: `POST /designs/{id}/artifacts?role=&documentChecksum=`
 * (multipart `file`). `documentChecksum` is the SHA-256 of the saved layout it was drawn from, which
 * the BE checks when the design is sent. The `Idempotency-Key` covers the run's nonce, the design,
 * the role, the layout and the file (`artifactUploadKey`), so a retry inside the run stores nothing
 * twice, while a new run or a redraw (another `runNonce`) is a new upload even for identical bytes.
 * Every upload moves the design's version on. A file that is not what the BE takes is a 415 or 413
 * with a message only.
 */
export async function uploadDesignFile(
  id: string,
  role: DesignFileRole,
  file: SubmissionFile,
  documentChecksum: string,
  runNonce: string,
): Promise<DesignArtifactDto> {
  const bytes = plainBytes(file.bytes);
  const body = new FormData();
  body.append("file", new Blob([bytes], { type: file.type }), file.name);
  const key = await artifactUploadKey({
    runNonce,
    designId: id,
    role,
    documentChecksum,
    bytes,
    name: file.name,
    contentType: file.type,
  });
  const config = { ...multipart({ "Idempotency-Key": key }), params: { role, documentChecksum } };
  const { data } = await api.post<unknown>(designPath(id, "/artifacts"), body, config);
  return designArtifactDtoSchema.parse(data);
}

/** The files of `roles` (all three by default), one request each and one after the other. */
export async function uploadDesignFiles(
  id: string,
  files: SubmissionFiles,
  documentChecksum: string,
  runNonce: string,
  roles: readonly DesignFileRole[] = designFileRoleSchema.options,
): Promise<void> {
  for (const role of roles) {
    await uploadDesignFile(id, role, files[role], documentChecksum, runNonce);
  }
}

/** The design's version as it is now: each upload moved it, and the BE's answer does not say. */
export async function readDesignVersion(id: string, signal?: AbortSignal): Promise<number> {
  const { data } = await api.get<unknown>(designPath(id), withSignal(signal));
  return designDraftDtoSchema.parse(data).version;
}

/**
 * POST /designs/{id}/technical-review-requests `{ version, quoteRequest? }` — DRAFT → PENDING_REVIEW.
 * The BE runs the preflight itself on the saved layout and writes a failure into the design's
 * history (422 `DESIGN_PREFLIGHT_FAILED`: the studio must not record it again); 409
 * `DESIGN_FILES_OUTDATED` names the roles to draw again. With `quoteRequest` it is "Gửi duyệt và
 * yêu cầu báo giá" (A-2, docs 12 §4.8.24): the request is checked before the preflight (400
 * `VALIDATION_FAILED` on `quoteRequest.cartons` / `quoteRequest.desiredDeliveryDate` refuses the
 * whole submission) and opened only when the design is sent. The answer does not carry it: read it
 * with `listDesignQuoteRequests`.
 */
export async function requestReview(
  id: string,
  version: number,
  quoteRequest?: QuoteRequestInput,
): Promise<Design> {
  const { data } = await api.post<unknown>(designPath(id, "/technical-review-requests"), {
    version,
    ...(quoteRequest ? { quoteRequest: quoteRequestBody(quoteRequest) } : {}),
  });
  return designFromAnswer(data);
}

/**
 * Sends a design the BE's way: its three files (each `POST …/artifacts`), the version read after the
 * last upload moved it, then the request for review (with the quote request, when one is asked).
 * The layout is already saved: the studio flushes
 * and verifies it before it draws (`documentChecksum` is that stored layout's).
 */
export async function submitDesign(id: string, input: SubmitDesignInput): Promise<Design> {
  await uploadDesignFiles(id, input.files, input.documentChecksum, input.runNonce);
  return requestReview(id, await readDesignVersion(id), input.quoteRequest);
}

/**
 * POST /designs/{id}/preflight-failures — records a submit the browser's own preflight refused
 * (docs 12 §5.3 `PREFLIGHT_FAILED`); the design stays as it is. The BE keeps only each finding's
 * `rule` and where it is (a `message` would be ignored, so none is sent), 1 to 50 of them. Not for
 * a refusal of the BE's own preflight: it records those itself.
 */
export async function recordPreflightFailure(
  id: string,
  input: PreflightFailureInput,
): Promise<DesignEvent> {
  const { data } = await api.post<unknown>(designPath(id, "/preflight-failures"), {
    version: input.version,
    // Only the failing checks are findings of a refusal: a note the studio shows is not one, and
    // sixty of them must not push the real failure out of the first 50 the BE takes (SD-7).
    issues: input.issues
      .filter((issue) => issue.level === "fail")
      .slice(0, MAX_REPORTED_ISSUES)
      .map((issue) => ({
        rule: beRuleOf(issue.ruleId),
        ...(issue.surfaceCode ? { surfaceCode: issue.surfaceCode } : {}),
        ...(issue.elementId ? { elementId: issue.elementId } : {}),
      })),
  });
  return toDesignEvent(designDecisionDtoSchema.parse(data));
}

/**
 * A design's files (F-21): `GET /designs/{id}/artifacts` lists every upload, newest first; the screens
 * get the newest of each role. An approved design's are the snapshot's frozen files, the stamped
 * print file and the production instruction among them (an old snapshot without files falls back
 * to the list). A link is not read here: `getArtifactDownloadUrl`, when the customer asks.
 */
export async function listDesignFiles(
  id: string,
  signal?: AbortSignal,
  approved = false,
): Promise<DesignFile[]> {
  if (approved) return filesOfSnapshot(id, await getDesignSnapshot(id, signal), signal);
  return listUploadedFiles(id, signal);
}

/** An approved design's frozen bundle: its files and the customer's own SKU (`null` if none came). */
export type DesignSnapshot = { customerSku: string | null; files: DesignFile[] };

/**
 * GET /designs/{id}/snapshot: what approval froze, which never changes afterwards (the SKU is
 * issued during the approval). Only the owner reads it, and only once the design is APPROVED
 * (404 before). `customerSku` is left out by the BE when null.
 */
export async function getDesignSnapshot(id: string, signal?: AbortSignal): Promise<DesignSnapshot> {
  const { data } = await api.get<unknown>(designPath(id, "/snapshot"), withSignal(signal));
  const snapshot = designSnapshotDtoSchema.parse(data);
  return {
    customerSku: snapshot.customerSku?.trim() || null,
    files: snapshot.artifacts?.length ? toDesignFiles(snapshot.artifacts) : [],
  };
}

/** The files of an approved design: the snapshot's, or (an old snapshot without any) the uploads'. */
export async function filesOfSnapshot(
  id: string,
  snapshot: DesignSnapshot,
  signal?: AbortSignal,
): Promise<DesignFile[]> {
  return snapshot.files.length > 0 ? snapshot.files : listUploadedFiles(id, signal);
}

async function listUploadedFiles(id: string, signal?: AbortSignal): Promise<DesignFile[]> {
  const { data } = await api.get<unknown>(designPath(id, "/artifacts"), withSignal(signal));
  return toDesignFiles(z.array(designArtifactDtoSchema).parse(data));
}

/** GET …/artifacts/{artifactId}/download-url — a link valid 10 minutes that saves the file (attachment). */
export async function getArtifactDownloadUrl(
  id: string,
  artifactId: string,
  signal?: AbortSignal,
): Promise<DownloadLink> {
  const path = designPath(id, `/artifacts/${encodeURIComponent(artifactId)}/download-url`);
  const { data } = await api.get<unknown>(path, withSignal(signal));
  return downloadLinkDtoSchema.parse(data);
}
