import { z } from "zod";

import { api } from "@/lib/api/client";

import { designPath, multipart, withSignal } from "./api-request";
import { sha256Hex } from "./engine/export/checksum";
import {
  designDtoSchema,
  designEventDtoSchema,
  designFileDtoSchema,
  designFileRoleSchema,
  printConfigDtoSchema,
} from "./schemas";
import type {
  Design,
  DesignEvent,
  DesignFile,
  DesignFileRole,
  PreflightFailureInput,
  PrintConfig,
  SubmissionFiles,
  SubmitDesignInput,
} from "./types";

// Sending a design for review, the files it was sent with, and the variant's print configuration
// that decides what may be sent (spec 2026-11-09 §4.2, §4.5); re-exported by `api.ts`.

const isOverArrayBuffer = (bytes: Uint8Array): bytes is Uint8Array<ArrayBuffer> =>
  bytes.buffer instanceof ArrayBuffer;

/**
 * `bytes` over a plain ArrayBuffer, which Blob and SubtleCrypto take: the very same array when it
 * already is one (a 50 MB print file is not copied), a copy only of a view over shared memory.
 */
export const plainBytes = (bytes: Uint8Array): Uint8Array<ArrayBuffer> =>
  isOverArrayBuffer(bytes) ? bytes : bytes.slice();

/**
 * POST /designs/{id}/submissions — multipart `version`, `preflight` (JSON), `checksums` (JSON,
 * SHA-256 hex by role, for the server to check what it received) and one file part per role.
 * DRAFT → PENDING_REVIEW; a preflight the server re-checks and fails is 422 PREFLIGHT_FAILED.
 */
export async function submitDesign(id: string, input: SubmitDesignInput): Promise<Design> {
  const { version, preflight, files } = input;
  const { body } = await bundleForm(files, {
    version: String(version),
    preflight: JSON.stringify({ result: preflight.result, issues: preflight.issues }),
  });
  const { data } = await api.post<unknown>(designPath(id, "/submissions"), body, multipart());
  return designDtoSchema.parse(data);
}

/**
 * A bundle as multipart: the `fields` given, `checksums` (JSON, SHA-256 hex by role, for the
 * server to check what it received) and one file part per role. Answers the checksums too.
 */
export async function bundleForm(files: SubmissionFiles, fields: Record<string, string> = {}) {
  const parts = await Promise.all(
    designFileRoleSchema.options.map(async (role) => {
      // Hashed and sent from the same bytes: the checksum covers exactly what is uploaded.
      const bytes = plainBytes(files[role].bytes);
      return { role, bytes, sha256: await sha256Hex(bytes) };
    }),
  );
  const checksums = Object.fromEntries(parts.map((p) => [p.role, p.sha256])) as Record<
    DesignFileRole,
    string
  >;
  const body = new FormData();
  for (const [name, value] of Object.entries(fields)) body.append(name, value);
  body.append("checksums", JSON.stringify(checksums));
  for (const { role, bytes } of parts) {
    body.append(role, new Blob([bytes], { type: files[role].type }), files[role].name);
  }
  return { body, checksums };
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
