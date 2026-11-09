import type { z } from "zod";

import type { DesignDocument } from "./engine/document/schema";
import type { PreflightIssue, PreflightReport } from "./engine/preflight/types";
import type {
  createDesignInputSchema,
  designAssetDtoSchema,
  designDocumentRecordDtoSchema,
  designDtoSchema,
  designEventDtoSchema,
  designEventTypeSchema,
  designFileDtoSchema,
  designFileRoleSchema,
  designPageDtoSchema,
  designStatusSchema,
  downloadLinkDtoSchema,
  draftCountDtoSchema,
  printConfigDtoSchema,
  renameDesignInputSchema,
  reportedPreflightIssueSchema,
  returnReasonInputSchema,
} from "./schemas";

export type DesignStatus = z.infer<typeof designStatusSchema>;
export type Design = z.infer<typeof designDtoSchema>;
/** A page of designs; `page` is 1-based here (the API layer shifts the wire's 0-based page). */
export type DesignPage = z.infer<typeof designPageDtoSchema>;
export type DraftCount = z.infer<typeof draftCountDtoSchema>;
export type DesignEventType = z.infer<typeof designEventTypeSchema>;
export type DesignEvent = z.infer<typeof designEventDtoSchema>;
export type DesignDocumentRecord = z.infer<typeof designDocumentRecordDtoSchema>;
export type DesignAsset = z.infer<typeof designAssetDtoSchema>;
export type DownloadLink = z.infer<typeof downloadLinkDtoSchema>;
export type DesignFileRole = z.infer<typeof designFileRoleSchema>;
export type DesignFile = z.infer<typeof designFileDtoSchema>;
export type PrintConfig = z.infer<typeof printConfigDtoSchema>;
/** A failing check as the server reports it; the engine's `PreflightIssue` is one. */
export type ReportedPreflightIssue = z.infer<typeof reportedPreflightIssueSchema>;

export type CreateDesignInput = z.infer<typeof createDesignInputSchema>;
export type ReturnReasonInput = z.infer<typeof returnReasonInputSchema>;

/** Every write sends the version the customer is looking at; a stale one is refused (docs 12 BR-11). */
type Versioned = { version: number };
export type RenameDesignInput = z.infer<typeof renameDesignInputSchema> & Versioned;
export type SaveDocumentInput = Versioned & { document: DesignDocument };
export type DeleteDesignInput = Versioned;
export type PreflightFailureInput = Versioned & { issues: PreflightIssue[] };

/** One rendered file of a submission. */
export type SubmissionFile = { name: string; type: string; bytes: Uint8Array };
export type SubmissionFiles = Record<DesignFileRole, SubmissionFile>;
export type SubmitDesignInput = Versioned & { preflight: PreflightReport; files: SubmissionFiles };

/** 1-based page, as the screens and the URL hold it. */
export type DesignListParams = {
  page: number;
  size: number;
  status?: DesignStatus | undefined;
};
