/**
 * What the design mock keeps and answers with (spec 2026-11-09 §4.1): the rows of its snapshot,
 * the DTOs built from them, and the ApiResponse envelope. The store is `design-store.ts` and its
 * parts `design-store-*.ts`, the seeded rows `design-seed.ts`.
 * Nullable DTO fields are sent as `null`, never left out.
 */

import type { DesignDocument } from "@/features/product-design/engine/document/schema";
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
  | "ARCHIVED";

/** The files of a submission, in the order GET /designs/{id}/files lists them. */
export const BUNDLE_ROLES = ["CUSTOMER_PREVIEW", "PRINT_READY", "TECHNICAL_SPEC"] as const;
export type BundleRole = (typeof BUNDLE_ROLES)[number];

export const DRAFT_LIMIT = 50; // docs 12 §4.1, B37
export const NAME_MAX = 200; // docs 12 §3
export const REASON_MAX = 2000; // docs 12 §4.4, BR-06

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
};

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
  /** The blob's key, `file/{designId}/v{version}/{role}`; seeded rows have none. */
  key?: string;
  /** Seeded rows only: a static link instead of a blob. */
  url?: string;
};

/** Everything the store keeps, saved whole as `DesignMockSnapshot.rows` after every write. */
export type DesignMockState = {
  designs: DesignRow[];
  documents: Record<string, DocumentRow>;
  assets: AssetRow[];
  history: EventRow[];
  files: FileRow[];
  seq: { design: number };
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
/**
 * A submitted file's blob: under the version the submission gives the design, so a resubmission
 * never writes over the bytes the rows still list; without one, the seed's `file/{designId}/{role}`.
 */
export const fileKey = (designId: string, role: BundleRole, version?: number) =>
  version === undefined ? `file/${designId}/${role}` : `file/${designId}/v${version}/${role}`;
export const fileBlobKey = (file: FileRow) => file.key ?? fileKey(file.designId, file.role);

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

/* ── DTOs ─────────────────────────────────────────────────────────────── */

export type DesignDto = Omit<DesignRow, "seq"> & { previewUrl: string | null };
export type DesignEventDto = Omit<EventRow, "designId">;
export type DesignAssetDto = Omit<AssetRow, "uploadKey" | "url">;
export type DesignFileDto = Pick<FileRow, "role" | "name" | "sizeBytes" | "sha256"> & {
  url: string;
};
export type DesignDocumentRecordDto = {
  designId: string;
  version: number;
  document: DesignDocument;
  checksum: string;
  updatedAt: string;
};

export const toDesignDto = (
  { seq: _seq, ...row }: DesignRow,
  previewUrl: string | null,
): DesignDto => structuredClone({ ...row, previewUrl });

export const toEventDto = ({ designId: _designId, ...event }: EventRow): DesignEventDto => ({
  ...event,
});

export const toAssetDto = ({ uploadKey: _key, url: _url, ...asset }: AssetRow): DesignAssetDto => ({
  ...asset,
});

/** The APPROVED event's note: the snapshot, the customer SKU and the bundle checksum. */
export const approvalNote = (approval: NonNullable<DesignRow["approval"]>) =>
  `SKU ${approval.skuCode} · snapshot ${approval.snapshotId} · checksum ${approval.bundleChecksum}`;

/** The issues of a failed preflight, as one history note. */
export const issuesNote = (issues: readonly PreflightIssue[]) =>
  issues.map((issue) => issue.message).join("; ");

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
export const invalidState = () =>
  fail(409, "INVALID_STATE", "The design is not in a state that allows this");
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
