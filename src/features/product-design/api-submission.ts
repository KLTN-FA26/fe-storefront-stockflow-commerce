import { z } from "zod";

import { api } from "@/lib/api/client";

import { designFromAnswer } from "./api-designs";
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
 * POST /designs/{id}/technical-review-requests `{ version }` — DRAFT → PENDING_REVIEW. The BE runs
 * the preflight itself on the saved layout and writes a failure into the design's history
 * (422 `DESIGN_PREFLIGHT_FAILED`: the studio must not record it again); 409 `DESIGN_FILES_OUTDATED`
 * names the roles to draw again. No quote request: that is another part.
 */
export async function requestReview(id: string, version: number): Promise<Design> {
  const { data } = await api.post<unknown>(designPath(id, "/technical-review-requests"), {
    version,
  });
  return designFromAnswer(data);
}

/**
 * Sends a design the BE's way: its three files (each `POST …/artifacts`), the version read after the
 * last upload moved it, then the request for review. The layout is already saved: the studio flushes
 * and verifies it before it draws (`documentChecksum` is that stored layout's).
 */
export async function submitDesign(id: string, input: SubmitDesignInput): Promise<Design> {
  await uploadDesignFiles(id, input.files, input.documentChecksum, input.runNonce);
  return requestReview(id, await readDesignVersion(id));
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
    issues: input.issues.slice(0, MAX_REPORTED_ISSUES).map((issue) => ({
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
  if (approved) {
    const { data } = await api.get<unknown>(designPath(id, "/snapshot"), withSignal(signal));
    const frozen = designSnapshotDtoSchema.parse(data).artifacts;
    if (frozen?.length) return toDesignFiles(frozen);
  }
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
