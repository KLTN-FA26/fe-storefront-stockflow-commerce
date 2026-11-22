import type {
  DesignArtifactDto,
  DesignDecisionDto,
  DesignDraftDto,
  PreflightIssueDto,
  ProjectRefDto,
} from "./design-dtos";
import { engineRuleOf, describePreflightRule } from "./preflight-messages";
import { designArtifactRoleSchema, designEventTypeSchema } from "./schemas";
import { printAreaCodeSchema } from "./engine/template/schema";
import type { Design, DesignEvent, DesignFile, ReportedPreflightIssue } from "./types";

// DTO → domain, for the designs (see `design-dtos.ts`). A domain field the BE has no source for is
// derived here from the fields it has (F-4 … F-10), never read from another endpoint except the
// project, which the API layer looks up (`api-designs.ts`, F-8).

/** A customer holds at most 50 drafts (docs 12 B37, BE `CustomerDesignRules.MAX_DRAFTS`); not served by any endpoint. */
export const DRAFT_LIMIT = 50;

/**
 * A design from its DTO and its project (null when it has none).
 *  - `product.title` ← `productName`, else the slug; `variant.label` ← `variantName`, else the SKU (F-7);
 *  - `sourceSnapshotId` ← `parentSnapshotId`, `submittedAt` ← `reviewRequestedAt` (F-4);
 *  - `approvedAt` ← `reviewedAt` once APPROVED (F-4); `customerSku` is sent on an approved design only (BE-2);
 *  - `lastReturn` ← `reviewNotes` + `reviewedAt` on a DRAFT: the BE sets the notes only when the reviewer
 *    (Production Coordinator) returns a design and clears them on approval (F-5); `updatedAt` stands in for a missing
 *    `reviewedAt`.
 */
export function toDesign(dto: DesignDraftDto, project: ProjectRefDto | null): Design {
  const updatedAt = dto.updatedAt ?? "";
  const reason = dto.reviewNotes?.trim();
  return {
    id: dto.id,
    name: dto.name,
    status: dto.status,
    product: {
      id: dto.productId ?? null,
      slug: dto.productSlug ?? null,
      title: dto.productName?.trim() || dto.productSlug || dto.sku,
    },
    variant: { sku: dto.sku, label: dto.variantName?.trim() || dto.sku },
    version: dto.version,
    projectId: dto.projectId ?? null,
    customerSku: dto.customerSku?.trim() || null,
    ...(dto.unitsPerCarton ? { unitsPerCarton: dto.unitsPerCarton } : {}),
    project: project ? { id: project.id, name: project.name, status: project.status } : null,
    sourceSnapshotId: dto.parentSnapshotId ?? null,
    lastReturn:
      dto.status === "DRAFT" && reason ? { reason, returnedAt: dto.reviewedAt ?? updatedAt } : null,
    previewUrl: dto.previewUrl ?? null,
    updatedAt,
    submittedAt: dto.reviewRequestedAt ?? null,
    approvedAt: dto.status === "APPROVED" ? (dto.reviewedAt ?? null) : null,
  };
}

/**
 * A history row from its DTO: `decision` → `type`, `notes` → `note` (F-15). A decision this build
 * does not list is `OTHER`, so the row still shows.
 */
export function toDesignEvent(dto: DesignDecisionDto): DesignEvent {
  const known = designEventTypeSchema.safeParse(dto.decision);
  return {
    type: known.success ? known.data : "OTHER",
    at: dto.at,
    version: dto.version,
    note: dto.notes ?? null,
  };
}

/**
 * The file list of a design (F-21): the BE lists every upload newest first, the screens show the
 * newest of each role, in the role order of `designArtifactRoleSchema`. A role this build does not
 * know is left out. `name` <- `originalName`, `sha256` <- `checksum`; the link is not here, it is
 * asked for when the customer asks (`getArtifactDownloadUrl`).
 */
export function toDesignFiles(artifacts: readonly DesignArtifactDto[]): DesignFile[] {
  const newest = new Map<string, DesignArtifactDto>();
  for (const artifact of artifacts)
    if (!newest.has(artifact.role)) newest.set(artifact.role, artifact);
  return designArtifactRoleSchema.options.flatMap((role) => {
    const artifact = newest.get(role);
    return artifact
      ? [
          {
            artifactId: artifact.artifactId,
            role,
            name: artifact.originalName,
            sizeBytes: artifact.sizeBytes,
            sha256: artifact.checksum,
          },
        ]
      : [];
  });
}

/**
 * The BE's findings of a refused preflight as the studio's issue list (X3, F-3): every finding
 * blocks (`level: "fail"`), `rule` is the rule id (the carton spec under the studio's name), and the
 * text is ours, one sentence per rule, never the BE's English `message`. A `surfaceCode` that is not
 * a print area of this build is left out.
 */
export function toPreflightIssues(issues: readonly PreflightIssueDto[]): ReportedPreflightIssue[] {
  return issues.map((issue) => {
    const surface = printAreaCodeSchema.safeParse(issue.surfaceCode);
    return {
      ruleId: engineRuleOf(issue.rule),
      level: "fail" as const,
      message: describePreflightRule(issue),
      ...(surface.success ? { surfaceCode: surface.data } : {}),
      ...(issue.elementId ? { elementId: issue.elementId } : {}),
    };
  });
}
