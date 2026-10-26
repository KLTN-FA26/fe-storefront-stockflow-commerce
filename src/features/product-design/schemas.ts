import { z } from "zod";

import { pageResponseSchema } from "@/lib/api/page-response";
import { beId } from "@/lib/validation/primitives";

import { designDocumentSchema } from "./engine/document/schema";
import { customizationTemplateSchema } from "./engine/template/schema";

// DTOs mirror BE `origin/develop` (design module: DesignWorkflowController, DesignController) plus
// the endpoints proposed in spec §7.2 (P1–P6), which the real BE does not serve yet.
// Jackson runs with `default-property-inclusion: non_null`: a nullable field is absent from the
// JSON, not null, so every nullable field is `.nullish()`. Ids are beId() (any 8-4-4-4-12 hex).
// Engine schemas are imported from their own modules, never `engine/index.ts` (pulls three.js).

/** `REJECTED` is declared by the BE but never set. */
export const designStatusSchema = z.enum(["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"]);

export const artifactRoleSchema = z.enum([
  "CUSTOMER_PREVIEW",
  "TECHNICAL_SPEC",
  "PRINT_READY",
  "PRODUCTION_INSTRUCTION",
]);

// A `java.time.Instant`: ISO-8601 with any sub-second precision. Kept as text; display formats it.
const instant = z.string().min(1);
const checksum = z.string().min(1);
const sizeBytes = z.number().int().nonnegative();

/**
 * GET /designs/{id} and every workflow write (DesignDraftResponse). `version` is the optimistic-lock
 * token each write must echo back. The six fields after `version` are P6 (spec §7.2): absent on the
 * real BE.
 */
export const designDraftDtoSchema = z.object({
  id: beId(),
  customerId: beId(),
  productId: beId(),
  ownerUserId: beId(),
  assignedUserId: beId().nullish(),
  reviewerUserId: beId().nullish(),
  name: z.string(),
  // A draft the customer starts (P1) has no specification text until the first review request.
  spec: z.string().nullish(),
  status: designStatusSchema,
  currentArtifactId: beId().nullish(),
  technicalReviewPassed: z.boolean(),
  reviewNotes: z.string().nullish(),
  version: z.number().int().nonnegative(),
  parentSnapshotId: beId().nullish(),
  // P6
  productSlug: z.string().min(1).nullish(),
  sku: z.string().min(1).nullish(),
  templateCode: z.string().min(1).nullish(),
  reviewRequestedAt: instant.nullish(),
  reviewedAt: instant.nullish(),
  updatedAt: instant.nullish(),
  previewArtifactId: beId().nullish(),
});
export const designPageDtoSchema = pageResponseSchema(designDraftDtoSchema);

/** GET /designs/{id}/history rows (DesignDecisionResponse). */
export const designDecisionDtoSchema = z.object({
  actorId: beId().nullish(),
  artifactId: beId().nullish(),
  decision: z.string().min(1),
  notes: z.string().nullish(),
  version: z.number().int().nonnegative(),
  at: instant,
});
export const designDecisionPageDtoSchema = pageResponseSchema(designDecisionDtoSchema);

/** GET /designs/{id}/snapshot and the answer to a confirmation (DesignSnapshotResponse). */
export const designSnapshotDtoSchema = z.object({
  id: beId(),
  draftId: beId(),
  artifactId: beId().nullish(),
  checksum: checksum.nullish(),
  spec: z.string().nullish(),
  confirmedBy: beId().nullish(),
  confirmedAt: instant.nullish(),
  artifacts: z.array(
    z.object({
      artifactId: beId(),
      role: artifactRoleSchema,
      originalName: z.string(),
      contentType: z.string().min(1),
      sizeBytes,
      checksum,
    }),
  ),
});

/** /designs/{id}/artifacts (DesignArtifactResponse). */
export const designArtifactDtoSchema = z.object({
  artifactId: beId(),
  designId: beId(),
  role: artifactRoleSchema,
  originalName: z.string(),
  contentType: z.string().min(1),
  sizeBytes,
  storedAt: instant,
  checksum,
});

/** A short-lived presigned link (ArtifactDownloadResponse; P4 uses the same shape). */
export const downloadLinkDtoSchema = z.object({ url: z.string().min(1), expiresAt: instant });

/** P3: GET/PUT /designs/{id}/document. The document is the engine's schema, parsed in full. */
export const designDocumentRecordDtoSchema = z.object({
  designId: beId(),
  version: z.number().int().nonnegative(),
  document: designDocumentSchema,
  checksum,
  updatedAt: instant,
});

/** P4: a customer image stored for the design. */
export const designAssetDtoSchema = z.object({
  assetId: beId(),
  designId: beId(),
  originalName: z.string(),
  contentType: z.string().min(1),
  widthPx: z.number().int().positive(),
  heightPx: z.number().int().positive(),
  sizeBytes,
  checksum,
  storedAt: instant,
});

// ── P2: customization ──

const MIME_BY_FORMAT: Record<string, string> = {
  PNG: "image/png",
  JPG: "image/jpeg",
  JPEG: "image/jpeg",
  WEBP: "image/webp",
};

/** `product.customization_templates.allowed_file_formats` holds short names; the engine wants MIME. */
const toMime = (format: string) => {
  const trimmed = format.trim();
  return MIME_BY_FORMAT[trimmed.toUpperCase()] ?? trimmed.toLowerCase();
};

/**
 * Reads a BE template row the way the engine's schema expects it (ASSUMPTION: P2 is not shipped,
 * so this is the proposed spelling): formats as lowercase MIME types, each once; an empty font list
 * or an absent nullable field as `null` (= no restriction); the BE drops nulls (non_null).
 */
function normalizeTemplate(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) return raw;
  const row = raw as Record<string, unknown>;
  const { allowedFileFormats, allowedFontCodes, maxColors } = row;
  return {
    ...row,
    allowedFileFormats: Array.isArray(allowedFileFormats)
      ? [...new Set(allowedFileFormats.map((f) => (typeof f === "string" ? toMime(f) : f)))]
      : allowedFileFormats,
    allowedFontCodes:
      allowedFontCodes === undefined ||
      (Array.isArray(allowedFontCodes) && !allowedFontCodes.length)
        ? null
        : allowedFontCodes,
    maxColors: maxColors ?? null,
  };
}

/** GET /catalog/products/{slug}/customization. */
export const customizationDtoSchema = z.object({
  productId: beId(),
  kind: z.enum(["STANDARD", "CUSTOMIZABLE"]),
  templates: z.array(z.preprocess(normalizeTemplate, customizationTemplateSchema)),
});

// ── Inputs: what the BE refuses is refused before it is sent ──

/** P1: POST /designs/mine. The name is `@Size(max = 200)` on the BE's own create request. */
export const createDesignInputSchema = z.object({
  productId: beId(),
  sku: z.string().min(1),
  templateCode: z.string().min(1),
  name: z.string().trim().min(1, "Hãy đặt tên cho thiết kế").max(200, "Tên tối đa 200 ký tự"),
});

/** `ChangeRequest.reason`: `@NotBlank @Size(max = 2000)` on both change requests and withdrawals. */
export const changeReasonInputSchema = z.object({
  reason: z.string().trim().min(1, "Hãy nhập lý do").max(2000, "Lý do tối đa 2000 ký tự"),
});
