import { z } from "zod";

import { pageResponseSchema } from "@/lib/api/page-response";
import { beId } from "@/lib/validation/primitives";

import { designDraftDtoSchema, preflightIssueDtoSchema } from "./design-dtos";
import { projectStatusSchema } from "./schemas";

// What the BE's design-project API sends (`origin/develop` 85e6036a, `DesignProjectController`,
// `design/internal/controller/dto/`), exactly: every null is omitted, so what may be left out is
// `.nullish()`; an enum the BE may extend is a plain string. Parsed once, in the API layer
// (`api-projects.ts`, `api-library.ts`); `project-mappers.ts` builds the domain types.

const instant = z.string().min(1);

/** `DesignProjectSummaryResponse`: a row of the project list. No previews, no round, no `updatedAt`. */
export const projectSummaryDtoSchema = z.object({
  id: beId(),
  name: z.string().min(1),
  description: z.string().nullish(),
  status: projectStatusSchema,
  version: z.number().int().nonnegative(),
  designCount: z.number().int().nonnegative(),
  createdAt: instant,
  archivedAt: instant.nullish(),
});
export type ProjectSummaryDto = z.infer<typeof projectSummaryDtoSchema>;
export const projectSummaryPageDtoSchema = pageResponseSchema(projectSummaryDtoSchema);

/** `DesignProjectResponse`: the project and its designs (archived ones aside), with their previews. */
export const projectDtoSchema = z.object({
  id: beId(),
  name: z.string().min(1),
  description: z.string().nullish(),
  status: projectStatusSchema,
  version: z.number().int().nonnegative(),
  createdAt: instant,
  archivedAt: instant.nullish(),
  designs: z.array(designDraftDtoSchema),
  assetCount: z.number().int().nonnegative().nullish(),
});
export type ProjectDto = z.infer<typeof projectDtoSchema>;

/** `DesignProjectEventResponse`: `event` is a string, the BE adds events (`TEXT_ADDED`, ...). */
export const projectEventDtoSchema = z.object({
  event: z.string().min(1),
  notes: z.string().nullish(),
  createdAt: instant,
});
export type ProjectEventDto = z.infer<typeof projectEventDtoSchema>;
export const projectEventPageDtoSchema = pageResponseSchema(projectEventDtoSchema);

/** `DesignProjectAssetResponse`: a file of the library. */
export const projectAssetDtoSchema = z.object({
  assetId: beId(),
  originalName: z.string(),
  contentType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  checksum: z.string().min(1),
  widthPx: z.number().int().positive(),
  heightPx: z.number().int().positive(),
  storedAt: instant,
});
export type ProjectAssetDto = z.infer<typeof projectAssetDtoSchema>;

/**
 * `DesignProjectTextResponse`'s style: the look fields of a text element. The colours may be
 * `#rgb`, `#rrggbb` or `#rrggbbaa`; `outline` is left out when there is none; `bold`, `italic` and
 * the spacing may be left out (none).
 */
export const projectTextStyleDtoSchema = z.object({
  fontCode: z.string().min(1),
  sizePt: z.number().positive(),
  color: z.string().min(1),
  bold: z.boolean().nullish(),
  italic: z.boolean().nullish(),
  align: z.enum(["left", "center", "right"]),
  letterSpacingEm: z.number().nullish(),
  lineHeight: z.number().positive(),
  outline: z.object({ color: z.string().min(1), widthMm: z.number().positive() }).nullish(),
});

/** `DesignProjectTextResponse`: a text and its style in the library. */
export const projectTextDtoSchema = z.object({
  id: beId(),
  text: z.string().min(1),
  style: projectTextStyleDtoSchema,
  createdAt: instant,
});
export type ProjectTextDto = z.infer<typeof projectTextDtoSchema>;

/** `DesignBatchSubmittedResponse`: the round a batch waits in (not readable by a customer) and the project now. */
export const batchSubmittedDtoSchema = z.object({ roundId: beId(), project: projectDtoSchema });

/**
 * `details` of `422 DESIGN_BATCH_PREFLIGHT_FAILED`: per design, its findings, or the roles whose
 * files are outdated (and need drawing again).
 */
export const batchFailureDetailsSchema = z.object({
  designs: z.array(
    z.object({
      designId: z.string().min(1),
      issues: z.array(preflightIssueDtoSchema).nullish(),
      roles: z.array(z.string()).nullish(),
    }),
  ),
});

/**
 * `details` of a round refused with 404, 409 `DESIGN_NOT_DRAFT` or 409 `CONFLICT`
 * (`DesignBatchSubmissionService.submit`, S-1…S-6): `designs` names every refused design with its
 * own code (the answer's code is the most severe: NOT_FOUND, then DESIGN_NOT_DRAFT, then CONFLICT);
 * `designIds` lists those of the answer's code (all an older BE sent).
 */
export const batchDesignIdsDetailsSchema = z.object({
  designIds: z.array(z.string().min(1)).optional(),
  /** Every design the batch refused, each with its own code (S-1; codes across the batch). */
  designs: z
    .array(z.object({ designId: z.string().min(1), errorCode: z.string().min(1) }))
    .optional(),
});

/** `DesignCloneResponse`: the new draft, and why it is in no project when its source had one. */
export const cloneDtoSchema = z.object({
  design: designDraftDtoSchema,
  notInProject: z.string().nullish(),
});
