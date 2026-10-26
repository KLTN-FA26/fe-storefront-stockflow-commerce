/**
 * What the mock design backend stores and answers with: the row types, the ApiResponse envelope,
 * and the canonical-JSON / SHA-256 helpers its parts share (`designs.ts` the store, `design-seed.ts`
 * the seeded rows, `design-uploads.ts` assets and artifacts). `src/lib` never imports `src/features`.
 */

export interface MockResult {
  status: number;
  data: unknown;
}

export type MockDesignStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
export type MockArtifactRole =
  "CUSTOMER_PREVIEW" | "TECHNICAL_SPEC" | "PRINT_READY" | "PRODUCTION_INSTRUCTION";

/** The design document is opaque to the store: the feature owns its schema. */
export interface MockDesignDocument {
  schemaVersion: 1;
  templateCode: string;
  sku: string;
  surfaces: Record<string, { background: Record<string, unknown>; elements: unknown[] }>;
}

/* ── Envelope ─────────────────────────────────────────────────────────── */

export type FieldError = { field: string; message: string; code?: string };

export const ok = (data?: unknown, status = 200): MockResult => ({
  status,
  data: {
    success: true,
    ...(data === undefined ? {} : { data }),
    timestamp: new Date().toISOString(),
  },
});

export const fail = (
  status: number,
  errorCode: string,
  message: string,
  fieldErrors?: FieldError[],
): MockResult => ({
  status,
  data: {
    success: false,
    errorCode,
    message,
    ...(fieldErrors ? { fieldErrors } : {}),
    correlationId: `mock-${Date.now()}`,
    timestamp: new Date().toISOString(),
  },
});

export const invalid = (errors: FieldError[]) =>
  fail(400, "VALIDATION_FAILED", "Dữ liệu không hợp lệ", errors);
export const notFound = () => fail(404, "NOT_FOUND", "Resource not found");
export const conflict = (message: string) => fail(409, "CONFLICT", message);
export const forbidden = () => fail(403, "FORBIDDEN", "Not authorised");

/** NON_NULL: a field that is `undefined` is left out. */
export const present = (fields: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));

/* ── Rows ─────────────────────────────────────────────────────────────── */

export interface StoredFile {
  originalName: string;
  contentType: string;
  sizeBytes: number;
  checksum: string;
  storedAt: string;
  /** The uploaded bytes; a seeded file has a `url` instead. */
  blob?: Blob;
  url?: string;
  /** `userId[:role]:Idempotency-Key`. */
  uploadKey?: string;
}
export interface ArtifactRow extends StoredFile {
  artifactId: string;
  role: MockArtifactRole;
}
export interface AssetRow extends StoredFile {
  assetId: string;
  widthPx: number;
  heightPx: number;
}
export interface DecisionRow {
  actorId: string | undefined;
  artifactId: string | undefined;
  decision: string;
  notes: string | undefined;
  version: number;
  at: string;
}
export interface SnapshotRow {
  id: string;
  artifactId: string;
  checksum: string;
  spec: string | undefined;
  confirmedBy: string;
  confirmedAt: string;
  artifacts: Array<{
    artifactId: string;
    role: MockArtifactRole;
    originalName: string;
    contentType: string;
    sizeBytes: number;
    checksum: string;
  }>;
  /** Frozen with the snapshot (spec §7.2 P3). */
  document: MockDesignDocument;
  documentChecksum: string;
}
export interface DraftRow {
  id: string;
  customerId: string;
  productId: string;
  productSlug: string | undefined;
  sku: string;
  templateCode: string;
  ownerUserId: string;
  assignedUserId: string | undefined;
  reviewerUserId: string | undefined;
  name: string;
  spec: string | undefined;
  status: MockDesignStatus;
  currentArtifactId: string | undefined;
  currentArtifacts: Partial<Record<MockArtifactRole, string>>;
  technicalReviewPassed: boolean;
  reviewNotes: string | undefined;
  version: number;
  parentSnapshotId: string | undefined;
  reviewRequestedAt: string | undefined;
  reviewedAt: string | undefined;
  updatedAt: string;
  createdAt: string;
  seq: number;
  /** Every draft has one from the start: the empty document, or the confirmed one it was forked from. */
  document: { document: MockDesignDocument; checksum: string; updatedAt: string };
  artifacts: ArtifactRow[];
  assets: AssetRow[];
  decisions: DecisionRow[];
  snapshot: SnapshotRow | undefined;
}

type RowInit = Pick<
  DraftRow,
  | "id"
  | "customerId"
  | "productId"
  | "sku"
  | "templateCode"
  | "ownerUserId"
  | "name"
  | "updatedAt"
  | "createdAt"
  | "document"
> &
  Partial<DraftRow>;

export function newRow(init: RowInit): DraftRow {
  return {
    productSlug: undefined,
    assignedUserId: undefined,
    reviewerUserId: undefined,
    spec: undefined,
    status: "DRAFT",
    currentArtifactId: undefined,
    currentArtifacts: {},
    technicalReviewPassed: false,
    reviewNotes: undefined,
    version: 0,
    parentSnapshotId: undefined,
    reviewRequestedAt: undefined,
    reviewedAt: undefined,
    seq: 0,
    artifacts: [],
    assets: [],
    decisions: [],
    snapshot: undefined,
    ...init,
  };
}

/* ── Hashing and review ───────────────────────────────────────────────── */

/** `JSON.stringify` with every object's keys sorted: equal documents share it (as the engine's). */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const members = Object.entries(value)
      .filter(([, member]) => member !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, member]) => `${JSON.stringify(key)}:${canonicalJson(member)}`);
    return `{${members.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** A change to the draft: the optimistic-lock token moves and the modification time with it. */
export const touch = (row: DraftRow, at: string) => {
  row.version += 1;
  row.updatedAt = at;
};

/** BE `DesignDraftJpaEntity#revise`: whatever was reviewed is no longer what is there. */
export const voidReview = (row: DraftRow) => {
  row.technicalReviewPassed = false;
  row.reviewNotes = undefined;
  row.reviewedAt = undefined;
  row.reviewRequestedAt = undefined;
};
