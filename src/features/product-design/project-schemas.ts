import { z } from "zod";

import { pageResponseSchema } from "@/lib/api/page-response";
import { beId } from "@/lib/validation/primitives";

import { designSchema, preflightIssueSchema, projectStatusSchema } from "./schemas";

// The DOMAIN schemas of projects the screens read, and the INPUT schemas of their forms and writes.
// What the BE sends is described by `project-dtos.ts` and turned into these by
// `project-mappers.ts` (the same pattern as `design-dtos.ts` / `design-mappers.ts`).

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

/** A project of the list: what the BE's summary has (F-26, F-28: no previews, no round, no `updatedAt`). */
export const projectSummarySchema = z.object({
  id: beId(),
  name: z.string().min(1).max(PROJECT_NAME_MAX),
  description: z.string().max(PROJECT_DESCRIPTION_MAX).nullable(),
  status: projectStatusSchema,
  /** The optimistic-lock token a write echoes back (docs 12 BR-11). */
  version: z.number().int().nonnegative(),
  /** Designs that count against the limit (not ARCHIVED). */
  designCount: z.number().int().nonnegative(),
  createdAt: instant,
  archivedAt: instant.nullable(),
});

/**
 * A project with its designs (the BE's detail), and what the page derives from them: the strip of
 * previews (F-26) and the whole-set review under way (F-27: the designs `PENDING_REVIEW`; a customer
 * cannot read the round itself).
 */
export const designProjectSchema = projectSummarySchema.extend({
  previewUrls: z.array(z.string().min(1)).max(PROJECT_PREVIEW_MAX),
  openRound: z.object({ designIds: z.array(beId()), openedAt: instant }).nullable(),
  /** Not ARCHIVED, newest updated first (F-30). Each knows this project as its `project`. */
  designs: z.array(designSchema),
});

/** GET /design-projects — `page` is 0-based until the API layer shifts it. */
export const projectPageSchema = pageResponseSchema(projectSummarySchema);

/**
 * docs 12 §5.4: what a project's history records, plus what the BE records beyond it. An event this
 * build does not know is `OTHER`: the list shows it neutrally instead of failing whole.
 */
export const projectEventTypeSchema = z.enum([
  "PROJECT_CREATED",
  "ASSET_ADDED",
  "ASSET_REMOVED",
  "TEXT_ADDED",
  "TEXT_REMOVED",
  "PROJECT_ARCHIVED",
  "BATCH_SUBMITTED",
  "BATCH_PREFLIGHT_FAILED",
  "BATCH_CLOSED",
  "PROJECT_QUOTE_REQUESTED",
  "OTHER",
]);

/** One row of a project's history as the screens read it, oldest first (the BE has no `version`). */
export const projectEventSchema = z.object({
  type: projectEventTypeSchema,
  at: instant,
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

/**
 * PUT /design-projects/{id}: the BE takes the whole of it, so the name is always sent (F-29: the
 * caller gives the current one when only the description changes); the version travels beside it.
 */
export const projectUpdateInputSchema = z.object({
  name: projectName,
  description: projectDescription.optional(),
});

// ── Sending a set for review (docs 12 §4.10, BR-19) ──

/** POST /design-projects/{id}/review-rounds: 2 to 20 DRAFT designs, each once, at the version their files were sent at. */
export const openReviewRoundInputSchema = z.object({
  designs: z
    .array(z.object({ id: beId(), version: z.number().int().nonnegative() }))
    .min(MIN_SET_SIZE, `Cần ít nhất ${MIN_SET_SIZE} bản nháp để gửi duyệt cả bộ`)
    .max(PROJECT_DESIGN_LIMIT)
    .refine((designs) => new Set(designs.map((d) => d.id)).size === designs.length, {
      message: "Mỗi bản chỉ gửi một lần",
    }),
});

/**
 * POST /design-projects/{id}/preflight-failures: the page's check of a set found a Fail (docs 12
 * §5.4 BATCH_PREFLIGHT_FAILED), with what failed on each design (1 to 20 designs, 1 to 50 issues).
 */
export const setPreflightFailureInputSchema = z.object({
  items: z
    .array(z.object({ designId: beId(), issues: z.array(preflightIssueSchema).min(1) }))
    .min(1),
});
