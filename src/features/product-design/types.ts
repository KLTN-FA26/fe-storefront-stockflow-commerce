import type { z } from "zod";

import type { DesignDocument } from "./engine/document/schema";
import type { PreflightIssue } from "./engine/preflight/types";
import type {
  designProjectSchema,
  openReviewRoundInputSchema,
  projectCreateInputSchema,
  projectEventSchema,
  projectEventTypeSchema,
  projectPageSchema,
  projectSummarySchema,
  projectUpdateInputSchema,
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
  cloneResultSchema,
  createDesignInputSchema,
  notInProjectReasonSchema,
  designAssetDtoSchema,
  designDocumentRecordDtoSchema,
  designSchema,
  designEventSchema,
  designEventTypeSchema,
  designFileRoleSchema,
  designFileSchema,
  designPageSchema,
  designStatusSchema,
  downloadLinkDtoSchema,
  draftCountSchema,
  printConfigSchema,
  renameDesignInputSchema,
  reportedPreflightIssueSchema,
  returnReasonInputSchema,
} from "./schemas";

export type DesignStatus = z.infer<typeof designStatusSchema>;
export type Design = z.infer<typeof designSchema>;
/** A page of designs; `page` is 1-based here (the API layer shifts the wire's 0-based page). */
export type DesignPage = z.infer<typeof designPageSchema>;
export type DraftCount = z.infer<typeof draftCountSchema>;
export type DesignEventType = z.infer<typeof designEventTypeSchema>;
export type DesignEvent = z.infer<typeof designEventSchema>;
export type DesignDocumentRecord = z.infer<typeof designDocumentRecordDtoSchema>;
export type DesignAsset = z.infer<typeof designAssetDtoSchema>;
export type DownloadLink = z.infer<typeof downloadLinkDtoSchema>;
export type DesignFileRole = z.infer<typeof designFileRoleSchema>;
export type DesignFile = z.infer<typeof designFileSchema>;
/** `model3d` is the `.glb` link, `null` when the variant has none. */
export type PrintConfig = z.infer<typeof printConfigSchema>;
/** A failing check as the server reports it; the engine's `PreflightIssue` is one. */
export type ReportedPreflightIssue = z.infer<typeof reportedPreflightIssueSchema>;

export type DesignProject = z.infer<typeof designProjectSchema>;
/** A page of projects; `page` is 1-based here, like `DesignPage`. */
export type ProjectPage = z.infer<typeof projectPageSchema>;
/** A row of the project list: no previews or round, they are read from the detail (F-26, F-27). */
export type ProjectSummary = z.infer<typeof projectSummarySchema>;
export type ProjectEventType = z.infer<typeof projectEventTypeSchema>;
export type ProjectEvent = z.infer<typeof projectEventSchema>;
export type CreateProjectInput = z.infer<typeof projectCreateInputSchema>;

export type CreateDesignInput = z.infer<typeof createDesignInputSchema>;
export type CloneDesignInput = z.infer<typeof cloneDesignInputSchema>;
export type NotInProjectReason = z.infer<typeof notInProjectReasonSchema>;
export type CloneResult = z.infer<typeof cloneResultSchema>;
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
/**
 * What sending a design takes: its three files, and the checksum of the saved layout they were
 * drawn from (the BE binds each file to it, BR-10). The version is read when the files are in.
 */
export type SubmitDesignInput = {
  documentChecksum: string;
  files: SubmissionFiles;
  /** The run's nonce (`newRunNonce`): part of every file's idempotency key. */
  runNonce: string;
};

/**
 * A set sent for review: each design's files are uploaded as in a single submission, then one
 * round request names every `{ id, version }`. The BE answers the round's id (which a customer
 * cannot read again) and the project as it is now.
 */
export type ReviewRound = { roundId: string; project: DesignProject };
export type OpenReviewRoundInput = z.infer<typeof openReviewRoundInputSchema>;
export type SetPreflightFailureInput = z.infer<typeof setPreflightFailureInputSchema>;

export type ProjectListParams = {
  page: number;
  size: number;
  status?: DesignProject["status"] | undefined;
};

/** 1-based page, as the screens and the URL hold it. */
export type DesignListParams = {
  page: number;
  size: number;
  /** An ARCHIVED design is listed for nobody (BR-16): the BE answers 400 to that status. */
  status?: Exclude<DesignStatus, "ARCHIVED"> | undefined;
};
