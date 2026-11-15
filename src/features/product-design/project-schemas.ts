import { z } from "zod";

import { pageResponseSchema } from "@/lib/api/page-response";
import { beId } from "@/lib/validation/primitives";

import { designFileRoleSchema, preflightIssueSchema, projectStatusSchema } from "./schemas";

// The project API of spec 2026-11-12 §3–§4 (the mock serves it now, the BE later). Same rules as
// `schemas.ts`: nullable wire fields are sent as `null`, never left out.

const instant = z.string().min(1);

/** ASSUMPTION (open-question B42): a project's name has 1–200 characters, its description up to 2,000. */
export const PROJECT_NAME_MAX = 200;
export const PROJECT_DESCRIPTION_MAX = 2000;
/** ASSUMPTION (open-question B42): at most 20 designs per project, ARCHIVED ones not counted. */
export const PROJECT_DESIGN_LIMIT = 20;
/** The strip of previews on a project card. */
export const PROJECT_PREVIEW_MAX = 4;
/** docs 12 §4.10, BR-19: a set sent for review is at least 2 DRAFT designs. */
export const MIN_SET_SIZE = 2;

/** GET /design-projects/{id} and every write that answers the project. */
export const designProjectSchema = z.object({
  id: beId(),
  name: z.string().min(1).max(PROJECT_NAME_MAX),
  description: z.string().max(PROJECT_DESCRIPTION_MAX).nullable(),
  status: projectStatusSchema,
  /** The optimistic-lock token a write echoes back (docs 12 BR-11). */
  version: z.number().int().nonnegative(),
  /** Designs that count against the limit (not ARCHIVED). */
  designCount: z.number().int().nonnegative(),
  previewUrls: z.array(z.string().min(1)).max(PROJECT_PREVIEW_MAX),
  /** The review round under way, if any (docs 12 BR-19, BR-20). */
  openRound: z.object({ id: beId(), designIds: z.array(beId()), openedAt: instant }).nullable(),
  createdAt: instant,
  updatedAt: instant,
});

/** GET /design-projects — `page` is 0-based here; the API layer shifts it. */
export const projectPageDtoSchema = pageResponseSchema(designProjectSchema);

/**
 * docs 12 §5.4: what a project's history records. A set sent for review records the round opened
 * (`BATCH_SUBMITTED`) or a failed check of the set (`BATCH_PREFLIGHT_FAILED`; ruling R-E10).
 */
export const projectEventTypeSchema = z.enum([
  "PROJECT_CREATED",
  "ASSET_ADDED",
  "ASSET_REMOVED",
  "PROJECT_ARCHIVED",
  "BATCH_SUBMITTED",
  "BATCH_PREFLIGHT_FAILED",
  "BATCH_CLOSED",
]);

/** GET /design-projects/{id}/history rows, oldest first. */
export const projectEventDtoSchema = z.object({
  type: projectEventTypeSchema,
  at: instant,
  version: z.number().int().nonnegative(),
  note: z.string().nullable(),
});

// ── Inputs: what the server refuses is refused before it is sent ──

const projectName = z
  .string()
  .trim()
  .min(1, "Hãy đặt tên cho dự án")
  .max(PROJECT_NAME_MAX, "Tên tối đa 200 ký tự");
const projectDescription = z
  .string()
  .max(PROJECT_DESCRIPTION_MAX, "Mô tả tối đa 2000 ký tự")
  .nullable();

/** POST /design-projects: a name, and a description that may be left empty. */
export const projectCreateInputSchema = z.object({
  name: projectName,
  description: projectDescription.optional(),
});

/** PATCH /design-projects/{id}: a name and/or a description (the version travels beside it). */
export const projectUpdateInputSchema = z
  .object({ name: projectName.optional(), description: projectDescription.optional() })
  .refine((input) => input.name !== undefined || input.description !== undefined, {
    message: "Hãy đổi tên hoặc mô tả",
  });

// ── Sending a set for review (docs 12 §4.10, BR-19; spec 2026-11-12 §8) ──

/** POST /designs/{id}/submission-uploads: what a round names the uploaded files by. */
export const submissionUploadDtoSchema = z.object({ uploadToken: z.string().min(1) });

/** POST /design-projects/{id}/review-rounds answers the round it opened. */
export const reviewRoundSchema = z.object({
  id: beId(),
  projectId: beId(),
  designIds: z.array(beId()).min(MIN_SET_SIZE),
  openedAt: instant,
  /** Set once every design of it has a decision (BR-20). */
  closedAt: instant.nullable(),
});

const sha256Hex = z.string().regex(/^[0-9a-f]{64}$/);

/**
 * One design of the set: the version its files were made from, the upload holding them, their
 * SHA-256 by role, and its preflight. BR-19: only a passing design is sent; one Fail sends none.
 */
export const reviewRoundItemSchema = z.object({
  designId: beId(),
  version: z.number().int().nonnegative(),
  uploadToken: z.string().min(1),
  preflight: z.object({ result: z.literal("Pass"), issues: z.array(preflightIssueSchema) }),
  checksums: z.record(designFileRoleSchema, sha256Hex),
});

/** BR-19: 2 DRAFT designs or more, each once. */
export const openReviewRoundInputSchema = z.object({
  items: z
    .array(reviewRoundItemSchema)
    .min(MIN_SET_SIZE, `Cần ít nhất ${MIN_SET_SIZE} bản nháp để gửi duyệt cả bộ`)
    .refine((items) => new Set(items.map((item) => item.designId)).size === items.length, {
      message: "Mỗi bản chỉ gửi một lần",
    }),
});

/**
 * POST /design-projects/{id}/preflight-failures: the page's check of a set found a Fail (docs 12
 * §5.4 BATCH_PREFLIGHT_FAILED), with what failed on each design.
 */
export const setPreflightFailureInputSchema = z.object({
  items: z
    .array(z.object({ designId: beId(), issues: z.array(preflightIssueSchema).min(1) }))
    .min(1),
});
