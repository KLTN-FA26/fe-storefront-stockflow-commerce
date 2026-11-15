import type { z } from "zod";

import type { DesignDocument } from "./engine/document/schema";
import type { PreflightIssue, PreflightReport } from "./engine/preflight/types";
import type {
  designProjectSchema,
  openReviewRoundInputSchema,
  projectCreateInputSchema,
  projectEventDtoSchema,
  projectEventTypeSchema,
  projectPageDtoSchema,
  projectUpdateInputSchema,
  reviewRoundItemSchema,
  reviewRoundSchema,
  setPreflightFailureInputSchema,
} from "./project-schemas";
import type {
  libraryImageSchema,
  libraryItemSchema,
  libraryTextInputSchema,
  libraryTextSchema,
  saveImageToLibraryInputSchema,
  textStyleSchema,
} from "./library-schemas";
import type {
  cloneDesignInputSchema,
  cloneResultDtoSchema,
  createDesignInputSchema,
  notInProjectReasonSchema,
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
/** `model3d` is the `.glb` link, `null` when the variant has none. */
export type PrintConfig = z.infer<typeof printConfigDtoSchema>;
/** A failing check as the server reports it; the engine's `PreflightIssue` is one. */
export type ReportedPreflightIssue = z.infer<typeof reportedPreflightIssueSchema>;

export type DesignProject = z.infer<typeof designProjectSchema>;
/** A page of projects; `page` is 1-based here, like `DesignPage`. */
export type ProjectPage = z.infer<typeof projectPageDtoSchema>;
export type ProjectEventType = z.infer<typeof projectEventTypeSchema>;
export type ProjectEvent = z.infer<typeof projectEventDtoSchema>;
export type CreateProjectInput = z.infer<typeof projectCreateInputSchema>;

export type CreateDesignInput = z.infer<typeof createDesignInputSchema>;
export type CloneDesignInput = z.infer<typeof cloneDesignInputSchema>;
export type NotInProjectReason = z.infer<typeof notInProjectReasonSchema>;
export type CloneResult = z.infer<typeof cloneResultDtoSchema>;
export type ReturnReasonInput = z.infer<typeof returnReasonInputSchema>;

/** Every write sends the version the customer is looking at; a stale one is refused (docs 12 BR-11). */
type Versioned = { version: number };
export type RenameDesignInput = z.infer<typeof renameDesignInputSchema> & Versioned;
export type SaveDocumentInput = Versioned & { document: DesignDocument };
export type DeleteDesignInput = Versioned;
export type UpdateProjectInput = z.infer<typeof projectUpdateInputSchema> & Versioned;
export type ArchiveProjectInput = Versioned;

/** An item of a project's library: an image, or a saved text style. */
export type LibraryItem = z.infer<typeof libraryItemSchema>;
export type LibraryImage = z.infer<typeof libraryImageSchema>;
export type LibraryText = z.infer<typeof libraryTextSchema>;
/** The look fields of a text element (everything but its content and placement). */
export type TextStyle = z.infer<typeof textStyleSchema>;
export type SaveTextStyleInput = z.infer<typeof libraryTextInputSchema>;
export type SaveImageToLibraryInput = z.infer<typeof saveImageToLibraryInputSchema>;
export type PreflightFailureInput = Versioned & { issues: PreflightIssue[] };

/** One rendered file of a submission. */
export type SubmissionFile = { name: string; type: string; bytes: Uint8Array };
export type SubmissionFiles = Record<DesignFileRole, SubmissionFile>;
export type SubmitDesignInput = Versioned & { preflight: PreflightReport; files: SubmissionFiles };

/** A set sent for review (spec 2026-11-12 §8): each design's upload, then the round. */
export type ReviewRound = z.infer<typeof reviewRoundSchema>;
export type ReviewRoundItem = z.infer<typeof reviewRoundItemSchema>;
export type OpenReviewRoundInput = z.infer<typeof openReviewRoundInputSchema>;
export type SetPreflightFailureInput = z.infer<typeof setPreflightFailureInputSchema>;
/** One design's files uploaded for a set: the token, and the SHA-256 the round sends back. */
export type SubmissionUpload = {
  uploadToken: string;
  checksums: Record<DesignFileRole, string>;
};

export type ProjectListParams = {
  page: number;
  size: number;
  status?: DesignProject["status"] | undefined;
};

/** 1-based page, as the screens and the URL hold it. */
export type DesignListParams = {
  page: number;
  size: number;
  status?: DesignStatus | undefined;
};
