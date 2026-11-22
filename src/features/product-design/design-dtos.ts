import { z } from "zod";

import { pageResponseSchema } from "@/lib/api/page-response";
import { beId } from "@/lib/validation/primitives";

import { designStatusSchema, projectStatusSchema } from "./schemas";

// What the BE's design API sends (`origin/develop` 85e6036a, `design/internal/controller/dto/`),
// exactly: the BE omits every null field (`non_null` inclusion), so what it may leave out is
// `.nullish()` here, and an enum it may extend is a plain string. Parsed once, in the API layer
// (`api-designs.ts`); `design-mappers.ts` turns each into the domain type the screens read.

const instant = z.string().min(1);
const version = z.number().int().nonnegative();

/** `DesignDraftResponse`: a design. Fields the screens never read are not listed (zod drops them). */
export const designDraftDtoSchema = z.object({
  id: beId(),
  name: z.string(),
  status: designStatusSchema,
  /** The optimistic-lock token every write echoes back (BR-11). */
  version,
  // The BE writes `productSlug` null (omitted) once the product is gone (`DesignWorkflowService`):
  // one such design must not fail the parse of the whole page. A customer's own design always has a SKU.
  productSlug: z.string().min(1).nullish(),
  /** The product the design is drawn on: the chat context ("Chat với Sale" about its variant). */
  productId: beId().nullish(),
  sku: z.string().min(1),
  /** The product's name, kept once it is no longer published; the SKU stands in for a missing variant name. */
  productName: z.string().nullish(),
  variantName: z.string().nullish(),
  templateCode: z.string().nullish(),
  /** A signed link to the current customer preview, absent while there is none. */
  previewUrl: z.string().nullish(),
  projectId: beId().nullish(),
  /** The customer's own SKU, on an APPROVED design only (BE-2); left out otherwise. */
  customerSku: z.string().nullish(),
  customerName: z.string().nullish(),
  parentSnapshotId: beId().nullish(),
  reviewRequestedAt: instant.nullish(),
  /** The reviewer's (Production Coordinator's) last decision; `reviewNotes` is the reason when they returned it. */
  reviewedAt: instant.nullish(),
  reviewNotes: z.string().nullish(),
  updatedAt: instant.nullish(),
});
export type DesignDraftDto = z.infer<typeof designDraftDtoSchema>;

/** `PageResponse<DesignDraftResponse>`: `page` is 0-based. */
export const designDraftPageDtoSchema = pageResponseSchema(designDraftDtoSchema);

/**
 * `DesignDecisionResponse`: a row of the history, newest first. `decision` is a string, not an
 * enum: the BE adds decisions (`QUOTE_REQUESTED`) and keeps its staff-workflow rows' own words
 * (`SENT_TO_CUSTOMER`, ...), and one unknown word must not fail the whole list.
 */
export const designDecisionDtoSchema = z.object({
  decision: z.string().min(1),
  notes: z.string().nullish(),
  version,
  at: instant,
});
export type DesignDecisionDto = z.infer<typeof designDecisionDtoSchema>;

export const designDecisionPageDtoSchema = pageResponseSchema(designDecisionDtoSchema);

/**
 * `GET /design-projects/{id}`, as far as a design needs it (F-8): the name and status its card and
 * studio header show. Both the BE's `DesignProjectResponse` and a page row of its list fit.
 */
export const projectRefDtoSchema = z.object({
  id: beId(),
  name: z.string().min(1),
  status: projectStatusSchema,
});
export type ProjectRefDto = z.infer<typeof projectRefDtoSchema>;

export const projectRefPageDtoSchema = pageResponseSchema(projectRefDtoSchema);

/**
 * `DesignArtifactResponse`: one upload of a design's files, `GET /designs/{id}/artifacts` lists every
 * one, newest first. `role` is a string: the BE adds roles (`PRODUCTION_INSTRUCTION` is generated at
 * approval), and one this build does not list is left out of the file list, never a failure.
 */
export const designArtifactDtoSchema = z.object({
  artifactId: beId(),
  role: z.string().min(1),
  originalName: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  checksum: z.string().min(1),
  storedAt: instant.nullish(),
});
export type DesignArtifactDto = z.infer<typeof designArtifactDtoSchema>;

/**
 * `DesignSnapshotResponse` of an approved design, as far as the storefront reads it: the frozen
 * files (the stamped print file and the production instruction included), the bundle's checksum and
 * the customer's SKU.
 */
export const designSnapshotDtoSchema = z.object({
  id: beId(),
  checksum: z.string().nullish(),
  customerSku: z.string().nullish(),
  artifacts: z.array(designArtifactDtoSchema).nullish(),
});

/**
 * One finding of `422 DESIGN_PREFLIGHT_FAILED` (`details.issues`): `{rule, surfaceCode?, elementId?,
 * message, values?}`. No level (every finding blocks) and no rule id. `message` is the BE's English:
 * never shown (`preflight-messages.ts` words each rule).
 */
export const preflightIssueDtoSchema = z.object({
  rule: z.string().min(1),
  surfaceCode: z.string().nullish(),
  elementId: z.string().nullish(),
  message: z.string().nullish(),
  values: z.record(z.string(), z.unknown()).nullish(),
});
export type PreflightIssueDto = z.infer<typeof preflightIssueDtoSchema>;
export const preflightFailedDetailsSchema = z.object({ issues: z.array(preflightIssueDtoSchema) });

/** `details` of `409 DESIGN_FILES_OUTDATED`: the roles to render again. */
export const filesOutdatedDetailsSchema = z.object({ roles: z.array(z.string()) });
