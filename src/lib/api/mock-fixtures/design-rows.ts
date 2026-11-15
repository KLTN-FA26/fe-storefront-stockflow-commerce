/**
 * What the design mock keeps and answers with (spec 2026-11-09 §4.1): the rows of its snapshot,
 * the DTOs built from them, and the ApiResponse envelope. The store is `design-store.ts` and its
 * parts `design-store-*.ts`, the seeded rows `design-seed.ts`.
 * Nullable DTO fields are sent as `null`, never left out.
 */

import type { DesignDocument, TextElement } from "@/features/product-design/engine/document/schema";
import { sha256Hex } from "@/features/product-design/engine/export/checksum";
import type { PreflightIssue } from "@/features/product-design/engine/preflight/types";

export interface MockResult {
  status: number;
  data: unknown;
}

export type DesignStatus = "DRAFT" | "PENDING_REVIEW" | "APPROVED" | "ARCHIVED";
export const DESIGN_STATUSES: readonly DesignStatus[] = [
  "DRAFT",
  "PENDING_REVIEW",
  "APPROVED",
  "ARCHIVED",
];

/** docs 12 §5.3 (spec §3.3). */
export type DesignEventType =
  | "CREATED"
  | "DERIVED_FROM_SNAPSHOT"
  | "PREFLIGHT_FAILED"
  | "SUBMITTED_FOR_REVIEW"
  | "RETURNED"
  | "APPROVED"
  | "ARCHIVED"
  | "ADDED_TO_PROJECT"
  | "REMOVED_FROM_PROJECT";

/** docs 12 §5.4 (part E spec §2). */
export type ProjectStatus = "ACTIVE" | "ARCHIVED";
export const PROJECT_STATUSES: readonly ProjectStatus[] = ["ACTIVE", "ARCHIVED"];

/**
 * A project's history (docs 12 §5.4). `ASSET_ADDED` / `ASSET_REMOVED` are the project library's
 * (the library's operations); adding a design to a project is the design's own `ADDED_TO_PROJECT`. A set sent for
 * review records `BATCH_SUBMITTED` (the round opened) or `BATCH_PREFLIGHT_FAILED` (ruling R-E10); the
 * last decision of a round records `BATCH_CLOSED`.
 */
export type ProjectEventType =
  | "PROJECT_CREATED"
  | "ASSET_ADDED"
  | "ASSET_REMOVED"
  | "PROJECT_ARCHIVED"
  | "BATCH_SUBMITTED"
  | "BATCH_PREFLIGHT_FAILED"
  | "BATCH_CLOSED";

/** The files of a submission, in the order GET /designs/{id}/files lists them. */
export const BUNDLE_ROLES = ["CUSTOMER_PREVIEW", "PRINT_READY", "TECHNICAL_SPEC"] as const;
export type BundleRole = (typeof BUNDLE_ROLES)[number];

export const BYTES_PER_MB = 1024 * 1024;
export const DRAFT_LIMIT = 50; // docs 12 §4.1, B37
export const NAME_MAX = 200; // docs 12 §3
export const REASON_MAX = 2000; // docs 12 §4.4, BR-06
export const PROJECT_NAME_MAX = 200; // ASSUMPTION (open-question B42)
export const PROJECT_DESCRIPTION_MAX = 2000; // ASSUMPTION (open-question B42)
export const PROJECT_DESIGN_LIMIT = 20; // ASSUMPTION (open-question B42): ARCHIVED designs are not counted
export const LIBRARY_LIMIT = 30; // ASSUMPTION (open-question B43) for images; A-E1 for text styles, counted apart
export const LIBRARY_TEXT_MAX = 500; // ASSUMPTION (A-E1): a saved text is a line or two, not a page
export const LIBRARY_NAME_MAX = 40; // the shortened text a text style is listed under
export const MIN_SET_SIZE = 2; // docs 12 §4.10, BR-19: a set submission has 2 DRAFT designs or more
/** ASSUMPTION (A-E4): files uploaded for a set submission that no round took are kept 24 hours. */
export const UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;

/* ── Rows ─────────────────────────────────────────────────────────────── */

export type DesignRow = {
  id: string;
  /** Creation order: breaks ties between designs updated at the same instant. */
  seq: number;
  name: string;
  status: DesignStatus;
  product: { slug: string; title: string };
  variant: { sku: string; label: string };
  version: number;
  projectId: string | null;
  sourceSnapshotId: string | null;
  lastReturn: { reason: string; returnedAt: string } | null;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  approvedAt: string | null;
  approval: { snapshotId: string; skuCode: string; bundleChecksum: string } | null;
  /**
   * Clones only: the `Idempotency-Key` it was made with, its source and why it is in no project.
   * The same key on the same source answers this design again (never leaves the store).
   */
  clone?: { key: string; sourceId: string; notInProject: string | null };
};

export type ProjectRow = {
  id: string;
  /** Creation order: breaks ties between projects updated at the same instant. */
  seq: number;
  name: string;
  description: string | null;
  status: ProjectStatus;
  /** BR-11 token of the project: moves on a rename / description change and on closing. */
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type ProjectEventRow = {
  projectId: string;
  type: ProjectEventType;
  at: string;
  version: number;
  note: string | null;
};

/** The fields of a text element that make its look: what a saved text style holds (A-E1). */
export type TextStyle = Pick<
  TextElement,
  | "fontCode"
  | "sizePt"
  | "color"
  | "bold"
  | "italic"
  | "align"
  | "outline"
  | "letterSpacingEm"
  | "lineHeight"
>;

type LibraryBase = { id: string; projectId: string; name: string; createdAt: string };
export type LibraryImageRow = LibraryBase & {
  kind: "IMAGE";
  originalName: string;
  contentType: string;
  widthPx: number;
  heightPx: number;
  sizeBytes: number;
  checksum: string;
  storedAt: string;
  /** The `Idempotency-Key` it was uploaded with: the same key and file answer it again. */
  uploadKey: string | null;
  /** Copied from a seeded image: a static link instead of a blob under `libraryKey(id)`. */
  url?: string;
};
export type LibraryTextRow = LibraryBase & { kind: "TEXT"; text: string; style: TextStyle };
/** An item of a project's library (docs 12 §4.9.29, BR-18): an image or a saved text style. */
export type LibraryRow = LibraryImageRow | LibraryTextRow;

export type DocumentRow = {
  designId: string;
  document: DesignDocument;
  checksum: string;
  updatedAt: string;
};

export type AssetRow = {
  designId: string;
  assetId: string;
  originalName: string;
  contentType: string;
  widthPx: number;
  heightPx: number;
  sizeBytes: number;
  checksum: string;
  storedAt: string;
  /** The `Idempotency-Key` it was uploaded with: the same key and file answer it again. */
  uploadKey: string | null;
  /** Seeded rows only: a static link instead of a blob under `asset/{assetId}`. */
  url?: string;
};

export type EventRow = {
  designId: string;
  type: DesignEventType;
  at: string;
  version: number;
  note: string | null;
};

/** One file of the latest submission; its bytes are the blob under `fileBlobKey(row)`. */
export type FileRow = {
  designId: string;
  role: BundleRole;
  name: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  storedAt: string;
  /**
   * The blob's key: `file/{designId}/v{version}/{role}` after a single submission,
   * `upload/{token}/{role}` (`uploadFileKey`) after a review round took the upload; seeded rows
   * have none.
   */
  key?: string;
  /** Seeded rows only: a static link instead of a blob. */
  url?: string;
};

/**
 * A project's review round (docs 12 §4.10, BR-19, BR-20): the designs sent together. It closes when
 * each has a decision (`closedAt`, set by the reviewer simulation).
 */
export type ReviewRoundRow = {
  id: string;
  projectId: string;
  designIds: string[];
  openedAt: string;
  closedAt: string | null;
};

/**
 * The files of one design uploaded for a set submission (spec 2026-11-12 §8), kept until a round
 * takes them (they then are the design's latest submission) or for 24 hours (A-E4).
 */
export type SubmissionUploadRow = {
  /** What the round names the upload by. */
  token: string;
  designId: string;
  /** The `Idempotency-Key` it was sent with: the same key and files answer the same token. */
  key: string;
  /** The design's version when the files were uploaded: they were made from that document. */
  version: number;
  /** One per role, `key` = `uploadFileKey(token, role)`; `designId` is the upload's. */
  files: FileRow[];
  uploadedAt: string;
  /** The round that took it; null while none has. */
  roundId: string | null;
};

/** Everything the store keeps, saved whole as `DesignMockSnapshot.rows` after every write. */
export type DesignMockState = {
  designs: DesignRow[];
  documents: Record<string, DocumentRow>;
  assets: AssetRow[];
  history: EventRow[];
  files: FileRow[];
  projects: ProjectRow[];
  projectEvents: ProjectEventRow[];
  library: LibraryRow[];
  reviewRounds: ReviewRoundRow[];
  submissionUploads: SubmissionUploadRow[];
  /** Designs whose next approval fails (the reviewer simulation, Q5); each failure clears its entry. */
  failNextApproval: string[];
  seq: { design: number; project: number };
};

/** The mock customer's number (profile `USER-CUS-0010` in `mock-routes.ts`), for SKU codes. */
const MOCK_CUSTOMER_NO = "0010";

/**
 * The customer SKU an approval creates (spec §6.5): `{productCode}-KH{customerNo}-{seq}`, the
 * variant's SKU standing in for the product code (mock only).
 */
export const customerSkuCode = (sku: string, seq: number) =>
  `${sku.toUpperCase().replace(/[^A-Z0-9-]/g, "-")}-KH${MOCK_CUSTOMER_NO}-${String(seq).padStart(3, "0")}`;

export const assetKey = (assetId: string) => `asset/${assetId}`;
/** The blob of a library image: its own bytes, apart from every design's copy (BR-18). */
export const libraryKey = (itemId: string) => `library/${itemId}`;
/**
 * A submitted file's blob: under the version the submission gives the design, so a resubmission
 * never writes over the bytes the rows still list; without one, the seed's `file/{designId}/{role}`.
 */
export const fileKey = (designId: string, role: BundleRole, version?: number) =>
  version === undefined ? `file/${designId}/${role}` : `file/${designId}/v${version}/${role}`;
export const fileBlobKey = (file: FileRow) => file.key ?? fileKey(file.designId, file.role);
/** A file uploaded for a set submission: a round that takes it lists it under this very key. */
export const uploadFileKey = (token: string, role: BundleRole) => `upload/${token}/${role}`;

/**
 * The approval's bundle checksum: SHA-256 of the submitted files (`ROLE:sha256` lines in role
 * order) and of the document they were rendered from, so the frozen content is covered too.
 */
export function bundleChecksum(
  files: ReadonlyArray<Pick<FileRow, "role" | "sha256">>,
  documentChecksum: string,
): Promise<string> {
  const lines = [...files]
    .sort((a, b) => BUNDLE_ROLES.indexOf(a.role) - BUNDLE_ROLES.indexOf(b.role))
    .map((file) => `${file.role}:${file.sha256}\n`);
  lines.push(`DESIGN_DOCUMENT:${documentChecksum}\n`);
  return sha256Hex(new TextEncoder().encode(lines.join("")));
}

/** The APPROVED event's note: the snapshot, the customer SKU and the bundle checksum. */
export const approvalNote = (approval: NonNullable<DesignRow["approval"]>) =>
  `SKU ${approval.skuCode} · snapshot ${approval.snapshotId} · checksum ${approval.bundleChecksum}`;

/** The issues of a failed preflight, as one history note. */
export const issuesNote = (issues: readonly PreflightIssue[]) =>
  issues.map((issue) => issue.message).join("; ");

export * from "./design-dtos";

/* ── Envelope ─────────────────────────────────────────────────────────── */

export type FieldError = { field: string; message: string };

export const ok = (data: unknown, status = 200): MockResult => ({
  status,
  data: { success: true, data, timestamp: new Date().toISOString() },
});

/** An ApiResponse failure; `details` is what `ApiError.details` carries to the screens. */
export function fail(
  status: number,
  errorCode: string,
  message: string,
  extra: { fieldErrors?: FieldError[]; details?: Record<string, unknown> } = {},
): MockResult {
  return {
    status,
    data: {
      success: false,
      errorCode,
      message,
      ...extra,
      correlationId: `mock-${Date.now()}`,
      timestamp: new Date().toISOString(),
    },
  };
}

/** The answer with its envelope's `timestamp` read from the store's clock instead of the system's. */
export const stampedAt = (result: MockResult, at: string): MockResult => ({
  status: result.status,
  data: { ...asRecord(result.data), timestamp: at },
});

export const notFound = () => fail(404, "NOT_FOUND", "Design not found");
export const projectNotFound = () => fail(404, "NOT_FOUND", "Project not found");
export const libraryItemNotFound = () => fail(404, "NOT_FOUND", "Library item not found");
export const invalidState = () =>
  fail(409, "INVALID_STATE", "The design is not in a state that allows this");
/** A closed project takes no change: 409 on a write to it, 422 on a design or item offered to it. */
export const projectArchived = (status: 409 | 422 = 409) =>
  fail(status, "PROJECT_ARCHIVED", "The project is closed");
export const versionConflict = () =>
  fail(409, "VERSION_CONFLICT", "The design changed; reload it before continuing");
export const draftLimit = () =>
  fail(409, "DRAFT_LIMIT", `A customer has at most ${DRAFT_LIMIT} DRAFT designs`);
export const invalid = (field: string, message: string) =>
  fail(422, "VALIDATION_FAILED", "Dữ liệu không hợp lệ", { fieldErrors: [{ field, message }] });
export const fileRejected = (message: string) => fail(422, "FILE_REJECTED", message);
/** 422 PREFLIGHT_FAILED: the issues ride in `details.issues`, in the engine's `PreflightIssue` shape. */
export const preflightFailed = (issues: readonly PreflightIssue[]) =>
  fail(422, "PREFLIGHT_FAILED", "The design did not pass preflight", {
    details: { issues: [...issues] },
  });

/* ── Input ────────────────────────────────────────────────────────────── */

export const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export const isVersion = (value: unknown): value is number =>
  Number.isInteger(value) && Number(value) >= 0;

/** An issue as the engine writes it, as far as the store reads one (its message, for the note). */
export const isIssue = (value: unknown): value is PreflightIssue =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { message?: unknown }).message === "string";

/** A text trimmed to 1..max characters, or the 422 that refuses it. */
export function boundedText(
  field: string,
  value: unknown,
  max: number,
): { text: string } | { refused: MockResult } {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return { refused: invalid(field, `${field} must not be blank`) };
  if (text.length > max)
    return { refused: invalid(field, `${field} is at most ${max} characters`) };
  return { text };
}
