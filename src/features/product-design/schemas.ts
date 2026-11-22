import { z } from "zod";

import { pageResponseSchema } from "@/lib/api/page-response";
import { beId } from "@/lib/validation/primitives";

import { designDocumentSchema } from "./engine/document/schema";
import type { PreflightRuleId } from "./engine/preflight/types";
import { printAreaCodeSchema } from "./engine/template/schema";

// The DOMAIN schemas the screens read (a `Design`, its page, its history events) and the INPUT schemas
// of forms and writes. What the BE sends is described by the `*Dto` schemas of `design-dtos.ts` and
// turned into these by `design-mappers.ts` (projects: `project-dtos.ts`, `project-mappers.ts`). Engine
// schemas come from their own modules, never `engine/index.ts` (it pulls three.js).

/** docs 12 §4 (spec §3.1). */
export const designStatusSchema = z.enum(["DRAFT", "PENDING_REVIEW", "APPROVED", "ARCHIVED"]);

// An instant as ISO-8601 text, any sub-second precision; display formats it.
const instant = z.string().min(1);
const checksum = z.string().min(1);
const sizeBytes = z.number().int().nonnegative();
const version = z.number().int().nonnegative();
const code = z.string().min(1);

/** docs 12 §3: a design's name has 1–200 characters, a review's return reason 1–2,000. */
const NAME_MAX = 200;
const REASON_MAX = 2000;

/** docs 12 §5.4 (spec 2026-11-12 §3): a project is open, or closed for good. */
export const projectStatusSchema = z.enum(["ACTIVE", "ARCHIVED"]);

/**
 * A design as the screens hold it. `createdAt` and `approval` are not here: the BE has no creation
 * time and no screen shows either (F-9, F-6).
 */
export const designSchema = z.object({
  id: beId(),
  name: z.string().min(1).max(NAME_MAX),
  status: designStatusSchema,
  /** The slug is null once the product is gone (BE leaves `productSlug` out): no link, no catalogue read. */
  product: z.object({
    /**
     * The product's id, as the BE always sends it. No screen reads it now: "Chat với Sale" is about the design itself
     * (`DESIGN` context, PO 2026-11-22 Q7), not its product.
     */
    id: beId().nullish(),
    slug: code.nullable(),
    title: z.string().min(1),
  }),
  variant: z.object({ sku: code, label: z.string().min(1) }),
  /** The optimistic-lock token every write echoes back (docs 12 BR-11). */
  version,
  projectId: beId().nullable(),
  /** The customer's own SKU, once the design is APPROVED (BE-2): `null` before. */
  customerSku: z.string().min(1).nullable().default(null),
  /** The project's name and status, for the studio header and the card label (part E). */
  project: z
    .object({ id: beId(), name: z.string().min(1), status: projectStatusSchema })
    .nullable(),
  sourceSnapshotId: beId().nullable(),
  lastReturn: z
    .object({ reason: z.string().min(1).max(REASON_MAX), returnedAt: instant })
    .nullable(),
  /** The latest CUSTOMER_PREVIEW, for cards. */
  previewUrl: z.string().min(1).nullable(),
  updatedAt: instant,
  submittedAt: instant.nullable(),
  approvedAt: instant.nullable(),
});

/** A page of designs; `page` is 0-based until the API layer shifts it. */
export const designPageSchema = pageResponseSchema(designSchema);

/** The customer's drafts against the limit (docs 12 §4.1, B37): counted from the list, see `design-mappers.ts`. */
export const draftCountSchema = z.object({
  drafts: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
});

/**
 * docs 12 §5.3 (spec §3.3), plus what the BE records beyond it: `QUOTE_REQUESTED`, and `OTHER` for a
 * decision this build does not know (the BE's staff-workflow words, or a newer one): the history
 * lists it neutrally instead of failing whole.
 */
export const designEventTypeSchema = z.enum([
  "CREATED",
  "DERIVED_FROM_SNAPSHOT",
  "PREFLIGHT_FAILED",
  "SUBMITTED_FOR_REVIEW",
  "RETURNED",
  "APPROVED",
  "ARCHIVED",
  "ADDED_TO_PROJECT", // part E: the note is the project's name
  "REMOVED_FROM_PROJECT",
  "QUOTE_REQUESTED",
  "OTHER",
]);

/** One row of a design's history as the screens read it, oldest first. */
export const designEventSchema = z.object({
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

/** Every role a design's file can have, in the order the file list shows them (the last is made at approval). */
export const designArtifactRoleSchema = z.enum([
  "CUSTOMER_PREVIEW",
  "PRINT_READY",
  "TECHNICAL_SPEC",
  "PRODUCTION_INSTRUCTION",
]);

/** A file of a design as the file list shows it: the newest of its role; its link is asked for on a click. */
export const designFileSchema = z.object({
  artifactId: beId(),
  role: designArtifactRoleSchema,
  name: z.string().min(1),
  sizeBytes,
  sha256: checksum,
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

/** The engine's `PreflightIssue`: a rule the engine knows, its level and message, where it is. */
export const preflightIssueSchema = z.object({
  ruleId: z.enum(PREFLIGHT_RULE_IDS),
  level: z.enum(["fail", "note"]),
  message: z.string(),
  surfaceCode: printAreaCodeSchema.exactOptional(),
  elementId: z.string().exactOptional(),
});

/** A rule id of the engine, or one the server checks that this engine does not know (yet). */
export type ReportedRuleId = PreflightRuleId | (string & {});
const reportedRuleId: z.ZodType<ReportedRuleId> = z.string().min(1);

/**
 * An issue of `422 DESIGN_PREFLIGHT_FAILED`, in `details.issues`: the engine's shape, but any non-empty
 * `ruleId` is read, so a rule the server added still shows its message instead of losing them all.
 */
export const reportedPreflightIssueSchema = preflightIssueSchema.extend({
  ruleId: reportedRuleId,
});

// ── Inputs: what the server refuses is refused before it is sent ──

/** docs 12 §3: a name of 1–200 characters, set by the customer. */
const designName = z
  .string()
  .trim()
  .min(1, "Hãy đặt tên cho thiết kế")
  .max(NAME_MAX, "Tên tối đa 200 ký tự");

/** POST /designs: a design starts from a variant (docs 12 §4.1, BR-01, BR-02). */
export const createDesignInputSchema = z.object({
  productSlug: z.string().trim().min(1),
  sku: z.string().trim().min(1),
  name: designName,
  /** Part E: the design starts inside this project (the same checks as adding one). */
  projectId: beId().optional(),
  /** Sent as `Idempotency-Key`: a reload of the launcher replays this create, not a second draft. */
  idempotencyKey: z.string().trim().min(1).optional(),
});

/**
 * POST /designs/{id}/clones: the design's document re-fitted to the other variant's print areas
 * (`retargetDocument`). The server makes the draft, copies the images the document uses and points
 * the copy at them (spec 2026-11-12 §4, §7).
 */
export const cloneDesignInputSchema = z.object({
  variantSku: z.string().trim().min(1),
  document: designDocumentSchema,
});

/** Why a clone did not join the project of its source (ASSUMPTION A-E3); the other cases join, or have none. */
export const notInProjectReasonSchema = z.enum(["PROJECT_ARCHIVED", "PROJECT_FULL"]);

/** The answer of a clone: the new draft, and why it is in no project when its source had one. */
export const cloneResultSchema = z.object({
  design: designSchema,
  notInProject: notInProjectReasonSchema.nullable(),
});

/** PATCH /designs/{id}: the name field (the version travels beside it). */
export const renameDesignInputSchema = z.object({ name: designName });

/** docs 12 BR-06: a return needs a reason of 1–2,000 characters. */
export const returnReasonInputSchema = z.object({
  reason: z.string().trim().min(1, "Hãy nhập lý do").max(REASON_MAX, "Lý do tối đa 2000 ký tự"),
});

// The print configuration's domain schema lives in its own file; re-exported with the other domain schemas.
export { printConfigSchema } from "./print-config-schemas";
