import type { z } from "zod";

import type {
  artifactRoleSchema,
  changeReasonInputSchema,
  createDesignInputSchema,
  customizationDtoSchema,
  designArtifactDtoSchema,
  designAssetDtoSchema,
  designDecisionDtoSchema,
  designDecisionPageDtoSchema,
  designDocumentRecordDtoSchema,
  designDraftDtoSchema,
  designPageDtoSchema,
  designSnapshotDtoSchema,
  designStatusSchema,
  downloadLinkDtoSchema,
} from "./schemas";

export type DesignStatus = z.infer<typeof designStatusSchema>;
export type ArtifactRole = z.infer<typeof artifactRoleSchema>;
export type DesignDraft = z.infer<typeof designDraftDtoSchema>;
/** A page of drafts; `page` is 1-based here (the API layer shifts the BE's 0-based page). */
export type DesignPage = z.infer<typeof designPageDtoSchema>;
export type DesignDecision = z.infer<typeof designDecisionDtoSchema>;
export type DesignDecisionPage = z.infer<typeof designDecisionPageDtoSchema>;
export type DesignSnapshot = z.infer<typeof designSnapshotDtoSchema>;
export type DesignArtifact = z.infer<typeof designArtifactDtoSchema>;
export type DownloadLink = z.infer<typeof downloadLinkDtoSchema>;
export type DesignDocumentRecord = z.infer<typeof designDocumentRecordDtoSchema>;
export type DesignAsset = z.infer<typeof designAssetDtoSchema>;
export type Customization = z.infer<typeof customizationDtoSchema>;
export type CreateDesignInput = z.infer<typeof createDesignInputSchema>;
export type ChangeReasonInput = z.infer<typeof changeReasonInputSchema>;

/** 1-based page, as the screens and the URL hold it. */
export type DesignListParams = {
  page: number;
  size: number;
  status?: DesignStatus | undefined;
};
