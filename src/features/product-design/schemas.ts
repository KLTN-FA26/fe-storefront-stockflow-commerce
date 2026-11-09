import { z } from "zod";

import { pageResponseSchema } from "@/lib/api/page-response";
import { beId } from "@/lib/validation/primitives";

import { designDocumentSchema } from "./engine/document/schema";
import type { PreflightRuleId } from "./engine/preflight/types";
import { customizationTemplateSchema, printAreaCodeSchema } from "./engine/template/schema";

// The design API the FE defines from docs 12 (spec 2026-11-09 §4.1): the mock serves it now, the BE
// later. Nullable fields are sent as `null`, never left out, so they are `.nullable()`: a missing
// one is a contract break. Engine schemas come from their own modules, never `engine/index.ts`
// (it pulls three.js).

/** docs 12 §4 (spec §3.1). */
export const designStatusSchema = z.enum(["DRAFT", "PENDING_REVIEW", "APPROVED", "ARCHIVED"]);

// An instant as ISO-8601 text, any sub-second precision; display formats it.
const instant = z.string().min(1);
const checksum = z.string().min(1);
const sizeBytes = z.number().int().nonnegative();
const version = z.number().int().nonnegative();
const code = z.string().min(1);

/** GET /designs/{id} and every write that answers the design. */
export const designDtoSchema = z.object({
  id: beId(),
  name: z.string().min(1),
  status: designStatusSchema,
  product: z.object({ slug: code, title: z.string().min(1) }),
  variant: z.object({ sku: code, label: z.string().min(1) }),
  /** The optimistic-lock token every write echoes back (docs 12 BR-11). */
  version,
  projectId: beId().nullable(), // part E; always null in part A
  sourceSnapshotId: beId().nullable(),
  lastReturn: z.object({ reason: z.string().min(1), returnedAt: instant }).nullable(),
  /** The latest CUSTOMER_PREVIEW, for cards. */
  previewUrl: z.string().min(1).nullable(),
  createdAt: instant,
  updatedAt: instant,
  submittedAt: instant.nullable(),
  approvedAt: instant.nullable(),
  approval: z.object({ snapshotId: beId(), skuCode: code, bundleChecksum: checksum }).nullable(),
});

/** GET /designs — `page` is 0-based here; the API layer shifts it. */
export const designPageDtoSchema = pageResponseSchema(designDtoSchema);

/** GET /designs/draft-count (docs 12 §4.1, B37). */
export const draftCountDtoSchema = z.object({
  drafts: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
});

/** docs 12 §5.3 (spec §3.3). */
export const designEventTypeSchema = z.enum([
  "CREATED",
  "DERIVED_FROM_SNAPSHOT",
  "PREFLIGHT_FAILED",
  "SUBMITTED_FOR_REVIEW",
  "RETURNED",
  "APPROVED",
  "ARCHIVED",
]);

/** GET /designs/{id}/history rows, oldest first. */
export const designEventDtoSchema = z.object({
  type: designEventTypeSchema,
  at: instant,
  version,
  note: z.string().nullable(),
});

/** GET/PUT /designs/{id}/document. The document is the engine's schema, parsed in full. */
export const designDocumentRecordDtoSchema = z.object({
  designId: beId(),
  version,
  document: designDocumentSchema,
  checksum,
  updatedAt: instant,
});

/** A customer image stored for the design. */
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

/** A short-lived link to a stored image. */
export const downloadLinkDtoSchema = z.object({ url: z.string().min(1), expiresAt: instant });

/** The three files of a submission (spec §4.2). */
export const designFileRoleSchema = z.enum(["CUSTOMER_PREVIEW", "PRINT_READY", "TECHNICAL_SPEC"]);

/** GET /designs/{id}/files: the bundle of the latest submission. */
export const designFileDtoSchema = z.object({
  role: designFileRoleSchema,
  name: z.string().min(1),
  sizeBytes,
  sha256: checksum,
  url: z.string().min(1),
});

/**
 * GET /catalog/products/{slug}/variants/{sku}/print-config. File formats are lowercase MIME types,
 * as the engine's template wants them (docs open-questions B34: 300 DPI, PNG/JPG, 50 MB).
 */
export const printConfigDtoSchema = z.object({
  sku: code,
  product: z.object({ slug: code, title: z.string().min(1), status: code }),
  variantStatus: z.enum(["ACTIVE", "BLOCKED", "OBSOLETE"]),
  /** docs 12 BR-05, B25: needed before submitting. */
  hasCartonSpec: z.boolean(),
  template: customizationTemplateSchema,
  fileRules: z.object({
    minDpi: z.number().positive(),
    formats: z.array(z.string().min(1)).min(1),
    maxFileSizeMb: z.number().positive(),
  }),
});

/** Every engine rule, once: adding a rule to `PreflightRuleId` fails here until it is listed. */
const PREFLIGHT_RULE_IDS = {
  OUTSIDE_PRINT_AREA: "OUTSIDE_PRINT_AREA",
  DPI_BELOW_MIN: "DPI_BELOW_MIN",
  FONT_NOT_ALLOWED: "FONT_NOT_ALLOWED",
  ASSET_INVALID: "ASSET_INVALID",
  EMPTY_DESIGN: "EMPTY_DESIGN",
  CROSSES_SAFE_AREA: "CROSSES_SAFE_AREA",
  ON_SEAM: "ON_SEAM",
  TOO_THIN: "TOO_THIN",
  WHITE_ON_KRAFT: "WHITE_ON_KRAFT",
  TOO_MANY_COLORS: "TOO_MANY_COLORS",
  CMYK_CONVERSION: "CMYK_CONVERSION",
  VARIANT_UNAVAILABLE: "VARIANT_UNAVAILABLE",
  NO_CARTON_SPEC: "NO_CARTON_SPEC",
} as const satisfies { [K in PreflightRuleId]: K };

/** The engine's `PreflightIssue`, as `422 PREFLIGHT_FAILED` carries it in `details.issues`. */
export const preflightIssueSchema = z.object({
  ruleId: z.enum(PREFLIGHT_RULE_IDS),
  level: z.enum(["fail", "note"]),
  message: z.string(),
  surfaceCode: printAreaCodeSchema.exactOptional(),
  elementId: z.string().exactOptional(),
});

// ── Inputs: what the server refuses is refused before it is sent ──

/** docs 12 §3: a name of 1–200 characters, set by the customer. */
const designName = z
  .string()
  .trim()
  .min(1, "Hãy đặt tên cho thiết kế")
  .max(200, "Tên tối đa 200 ký tự");

/** POST /designs: a design starts from a variant (docs 12 §4.1, BR-01, BR-02). */
export const createDesignInputSchema = z.object({
  productSlug: z.string().trim().min(1),
  sku: z.string().trim().min(1),
  name: designName,
});

/** PATCH /designs/{id}: the name field (the version travels beside it). */
export const renameDesignInputSchema = z.object({ name: designName });

/** docs 12 BR-06: a return needs a reason of 1–2,000 characters. */
export const returnReasonInputSchema = z.object({
  reason: z.string().trim().min(1, "Hãy nhập lý do").max(2000, "Lý do tối đa 2000 ký tự"),
});
