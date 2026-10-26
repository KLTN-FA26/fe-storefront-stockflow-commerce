/**
 * In-memory design backend for USE_MOCK=true and tests: the BE design workflow plus the endpoints
 * proposed in spec §7.2 (P1–P6), which the real BE does not serve yet.
 *
 * Shapes follow `DesignDraftResponse`, `DesignDecisionResponse`, `DesignSnapshotResponse`,
 * `DesignArtifactResponse` (+ the P6 fields) and `PageResponse`; rules follow
 * `DesignWorkflowService`, `DesignArtifactService` and `DesignWorkflow` (develop):
 *  - a write echoes the draft's `version`; a stale one is 409 CONFLICT; every write that changes the
 *    draft (document, specification, artifact, review, transition) bumps it;
 *  - a design the caller neither owns, is assigned to nor reviews answers 404 NOT_FOUND;
 *  - editing (document PUT, specification, review request) needs a DRAFT; document, specification and
 *    artifact changes void the technical review (passed, notes, reviewedAt, reviewRequestedAt);
 *  - `submit` needs a passed review and a current preview; `confirm` is owner-only from SUBMITTED,
 *    freezes the document and the artifact manifest into an immutable snapshot and sets APPROVED
 *    (confirming again with the snapshot's artifact answers the snapshot); `fork` only from APPROVED;
 *  - GET /designs is zero-based, newest created first;
 *  - assets and artifacts (limits, replay, links) live in `design-uploads.ts`, the seeded designs in
 *    `design-seed.ts`, the row types and envelope in `design-model.ts`.
 * Mock-only: `completeReview` stands in for the QC reviewer; the 2 s demo timer is wired by the route
 * layer, not here. NON_NULL serialisation: absent optional fields are omitted, never sent as null.
 * Checksums are SHA-256 hex through Web Crypto, so the methods that hash or read a Blob are async.
 * Intentionally independent from mock-data.ts (legacy, non-BE shapes).
 *
 * ASSUMPTION (spec §7.2 P3): every draft always has a document, so GET /designs/{id}/document never
 * answers 404 for a design the caller may see: `create` stores the empty document of the template and
 * `fork` the document of the confirmed snapshot, with the source's images (same ids) so its image
 * elements resolve. A snapshot's checksum extends the BE's artifact manifest hash with the
 * document's checksum so the confirmed document is covered.
 */

import { seedMockCatalog } from "./catalog";
import {
  canonicalJson,
  conflict,
  fail,
  forbidden,
  invalid,
  newRow,
  notFound,
  ok,
  present,
  sha256Hex,
  touch,
  voidReview,
  type DecisionRow,
  type DraftRow,
  type FieldError,
  type MockDesignDocument,
  type MockDesignStatus,
  type MockResult,
  type SnapshotRow,
} from "./design-model";
import {
  MOCK_DESIGN_PRODUCT_SLUGS,
  MOCK_DESIGN_TEMPLATES,
  type MockDesignTemplate,
} from "./design-templates";
import { MOCK_QC_USER_ID, seedRows } from "./design-seed";
import { createUploads } from "./design-uploads";

export { MOCK_DESIGN_IDS, MOCK_SEED_CHECKSUMS } from "./design-seed";
export type {
  MockArtifactRole,
  MockDesignDocument,
  MockDesignStatus,
  MockResult,
} from "./design-model";

export interface MockCatalogKind {
  productId: string;
  kind: "STANDARD" | "CUSTOMIZABLE";
  skus: string[];
}

export interface MockDesignDeps {
  /** Identity user of the caller: owner of the designs it creates. */
  userId: string;
  customerId: string;
  /** Epoch milliseconds; defaults to `Date.now`. */
  now?: () => number;
  newId?: () => string;
  /** Natural pixel size of an uploaded image; defaults to the browser's `createImageBitmap`. */
  readImageSize?: (blob: Blob) => Promise<{ width: number; height: number }>;
  /** Link for a stored file; defaults to `URL.createObjectURL`. */
  toUrl?: (blob: Blob) => string;
  /** The catalogue's answer for a product slug; defaults to the seeded mock catalogue. */
  catalogKindOf?: (slug: string) => MockCatalogKind | undefined;
}

const MAX_DOCUMENT_BYTES = 1_000_000; // spec §4.2, P3
const STATUSES: readonly MockDesignStatus[] = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"];
const NAME_MAX = 200;
const SPEC_MAX = 4000;
const REASON_MAX = 2000;
const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 20;

/* ── Serialisation ────────────────────────────────────────────────────── */

/** DesignDraftResponse with the P6 fields. */
const toDraft = (row: DraftRow) =>
  present({
    id: row.id,
    customerId: row.customerId,
    productId: row.productId,
    ownerUserId: row.ownerUserId,
    assignedUserId: row.assignedUserId,
    reviewerUserId: row.reviewerUserId,
    name: row.name,
    spec: row.spec,
    status: row.status,
    currentArtifactId: row.currentArtifactId,
    technicalReviewPassed: row.technicalReviewPassed,
    reviewNotes: row.reviewNotes,
    version: row.version,
    parentSnapshotId: row.parentSnapshotId,
    productSlug: row.productSlug,
    sku: row.sku,
    templateCode: row.templateCode,
    reviewRequestedAt: row.reviewRequestedAt,
    reviewedAt: row.reviewedAt,
    updatedAt: row.updatedAt,
    previewArtifactId: row.currentArtifactId,
  });

const toDecision = (d: DecisionRow) =>
  present({
    actorId: d.actorId,
    artifactId: d.artifactId,
    decision: d.decision,
    notes: d.notes,
    version: d.version,
    at: d.at,
  });

const toSnapshot = (row: DraftRow, s: SnapshotRow) =>
  structuredClone(
    present({
      id: s.id,
      draftId: row.id,
      artifactId: s.artifactId,
      checksum: s.checksum,
      spec: s.spec,
      confirmedBy: s.confirmedBy,
      confirmedAt: s.confirmedAt,
      artifacts: s.artifacts,
    }),
  );

/** A template as the BE sends it: null fields are left out. */
const toTemplate = ({ maxColors, allowedFontCodes, ...template }: MockDesignTemplate) =>
  structuredClone({
    ...template,
    ...(maxColors === null ? {} : { maxColors }),
    ...(allowedFontCodes === null ? {} : { allowedFontCodes }),
  });

/** A blank document: one empty surface per print area of the template. */
const emptyDocument = (template: MockDesignTemplate): MockDesignDocument => ({
  schemaVersion: 1,
  templateCode: template.code,
  sku: template.sku,
  surfaces: Object.fromEntries(
    template.printAreas.map((area) => [area.code, { background: { kind: "none" }, elements: [] }]),
  ),
});

/**
 * The BE's `manifestChecksum` (artifacts sorted by role, `ROLE:artifactId:checksum` lines) with the
 * document's checksum appended when the design has a document.
 */
export function snapshotChecksum(
  manifest: Array<{ role: string; artifactId: string; checksum: string }>,
  documentChecksum?: string,
): Promise<string> {
  const lines = [...manifest]
    .sort((a, b) => (a.role < b.role ? -1 : a.role > b.role ? 1 : 0))
    .map((m) => `${m.role}:${m.artifactId}:${m.checksum}\n`);
  if (documentChecksum) lines.push(`DESIGN_DOCUMENT:${documentChecksum}\n`);
  return sha256Hex(lines.join(""));
}

/** Why a document cannot belong to the draft, or `undefined`: top level only, the feature owns the rest. */
function documentProblem(document: object, row: DraftRow): string | undefined {
  const { schemaVersion, templateCode, sku, surfaces } = document as Record<string, unknown>;
  if (schemaVersion !== 1) return "schemaVersion must be 1";
  if (templateCode !== row.templateCode || sku !== row.sku) {
    return "the document is not for the template of this design";
  }
  if (typeof surfaces !== "object" || surfaces === null || Array.isArray(surfaces)) {
    return "surfaces must be an object";
  }
  const codes: string[] = MOCK_DESIGN_TEMPLATES[row.sku]?.printAreas.map((a) => a.code) ?? [];
  for (const [code, surface] of Object.entries(surfaces)) {
    if (!codes.includes(code)) return `${code} is not a print area of the template`;
    if (!Array.isArray((surface as { elements?: unknown } | null)?.elements)) {
      return `${code} needs an elements array`;
    }
  }
  return undefined;
}

/* ── Catalogue ────────────────────────────────────────────────────────── */

/** The seeded mock catalogue: a product is customizable when one of its SKUs has a template. */
const defaultCatalogKindOf = (slug: string): MockCatalogKind | undefined => {
  const product = seedMockCatalog().find((p) => p.slug === slug);
  if (!product) return undefined;
  const skus = product.variants.map((v) => v.sku);
  const customizable = skus.some((sku) => sku in MOCK_DESIGN_TEMPLATES);
  return { productId: product.productId, kind: customizable ? "CUSTOMIZABLE" : "STANDARD", skus };
};

/* ── Paging and input ─────────────────────────────────────────────────── */

function toInt(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  return Number.isInteger(n) ? n : Number.NaN;
}

/** BE Pages.of: a negative page, a size below 1 or above the 200 cap is a 400. */
function paged<T>(
  all: T[],
  query: { page?: unknown; size?: unknown },
  toItem: (row: T) => unknown,
): MockResult {
  const page = toInt(query.page, 0);
  const size = toInt(query.size, DEFAULT_PAGE_SIZE);
  if (!(page >= 0) || !(size >= 1) || size > MAX_PAGE_SIZE) {
    return fail(
      400,
      "UNSUPPORTED_PARAMETER",
      `page must be >= 0 and size between 1 and ${MAX_PAGE_SIZE}`,
    );
  }
  const totalPages = Math.ceil(all.length / size);
  return ok({
    items: all.slice(page * size, (page + 1) * size).map(toItem),
    page,
    size,
    totalElements: all.length,
    totalPages,
    hasNext: page + 1 < totalPages,
    hasPrevious: page > 0,
  });
}

const isVersion = (value: unknown): value is number =>
  Number.isInteger(value) && Number(value) >= 0;
const versionError = (): FieldError => ({
  field: "version",
  message: "version must be zero or positive",
  code: "PositiveOrZero",
});

/** `ChangeRequest.reason`: `@NotBlank @Size(max = 2000)`. */
function reasonError(reason: unknown): FieldError | undefined {
  if (typeof reason !== "string" || !reason.trim()) {
    return { field: "reason", message: "reason must not be blank", code: "NotBlank" };
  }
  return reason.length > REASON_MAX
    ? { field: "reason", message: "reason is at most 2000 characters", code: "Size" }
    : undefined;
}

/** `ChangeRequest`: the `{ version, reason }` of a change request or a withdrawal. */
function readChange(body: { version?: unknown; reason?: unknown }) {
  const { version, reason } = body;
  const reasonProblem = reasonError(reason);
  if (isVersion(version) && typeof reason === "string" && !reasonProblem) {
    return { version, reason };
  }
  return {
    errors: [
      ...(isVersion(version) ? [] : [versionError()]),
      ...(reasonProblem ? [reasonProblem] : []),
    ],
  };
}

type VersionBody = { version?: unknown };

/* ── Store ────────────────────────────────────────────────────────────── */

export function createMockDesignStudio(deps: MockDesignDeps) {
  const { userId, customerId } = deps;
  const now = deps.now ?? Date.now;
  const newId = deps.newId ?? (() => globalThis.crypto.randomUUID());
  const kindOf = deps.catalogKindOf ?? defaultCatalogKindOf;
  const stamp = () => new Date(now()).toISOString();

  const rows = seedRows(userId, customerId, now());
  let seq = rows.length;

  const visible = (row: DraftRow) =>
    [row.ownerUserId, row.assignedUserId, row.reviewerUserId].includes(userId);
  const find = (id: string) => rows.find((row) => row.id === id && visible(row));
  const mayEdit = (row: DraftRow) => userId === row.ownerUserId || userId === row.assignedUserId;

  const bump = (row: DraftRow, at = stamp()) => touch(row, at);
  /** The decision log entry for the write just made (call after `bump`). */
  const record = (
    row: DraftRow,
    decision: string,
    extra: { notes?: string; artifactId?: string; actorId?: string } = {},
  ) => {
    row.decisions.push({
      actorId: extra.actorId ?? userId,
      artifactId: extra.artifactId,
      decision,
      notes: extra.notes,
      version: row.version,
      at: row.updatedAt,
    });
  };

  /** BE `DesignWorkflowService#editable`: version, who, and that the draft is still a DRAFT. */
  function editable(row: DraftRow, version: number): MockResult | undefined {
    if (row.version !== version) return conflict("The design changed; refresh before continuing");
    if (!mayEdit(row)) return forbidden();
    if (row.status === "APPROVED") return conflict("Create a new draft for confirmed content");
    if (row.status !== "DRAFT") return conflict("Withdraw the pending confirmation before editing");
    return undefined;
  }

  return {
    userId,
    customerId,

    ...createUploads({
      userId,
      find,
      now,
      stamp,
      newId,
      readImageSize: deps.readImageSize,
      toUrl: deps.toUrl,
    }),

    /** GET /designs?page=&size=&status= — the caller's designs, newest created first. */
    list(query: { page?: unknown; size?: unknown; status?: unknown } = {}): MockResult {
      const { status } = query;
      if (status !== undefined && !STATUSES.some((s) => s === status)) {
        return fail(400, "UNSUPPORTED_PARAMETER", "Unsupported status filter");
      }
      const mine = rows
        .filter((row) => visible(row) && (status === undefined || row.status === status))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.seq - a.seq);
      return paged(mine, query, toDraft);
    },

    /** GET /designs/{id} */
    get(id: string): MockResult {
      const row = find(id);
      return row ? ok(toDraft(row)) : notFound();
    },

    /** GET /designs/{id}/history — the decision log, newest first. */
    history(id: string, query: { page?: unknown; size?: unknown } = {}): MockResult {
      const row = find(id);
      if (!row) return notFound();
      return paged([...row.decisions].reverse(), query, toDecision);
    },

    /** GET /designs/{id}/snapshot */
    snapshot(id: string): MockResult {
      const row = find(id);
      return row?.snapshot ? ok(toSnapshot(row, row.snapshot)) : notFound();
    },

    /**
     * P1 POST /designs/mine — a customer starts a design from a template of a SKU, with the empty
     * document of that template already stored.
     */
    async create(
      body: { productId?: unknown; sku?: unknown; templateCode?: unknown; name?: unknown } = {},
    ): Promise<MockResult> {
      const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
      const productId = text(body.productId);
      const sku = text(body.sku);
      const templateCode = text(body.templateCode);
      const name = text(body.name);
      const errors = [
        ...(["productId", "sku", "templateCode", "name"] as const)
          .filter((field) => !text(body[field]))
          .map((field) => ({ field, message: `${field} must not be blank`, code: "NotBlank" })),
        ...(name.length > NAME_MAX
          ? [{ field: "name", message: "name is at most 200 characters", code: "Size" }]
          : []),
      ];
      if (errors.length) return invalid(errors);

      const template = MOCK_DESIGN_TEMPLATES[sku];
      if (!template) {
        return fail(409, "PRODUCT_NOT_CUSTOMIZABLE", "This product cannot be customized");
      }
      const slug = MOCK_DESIGN_PRODUCT_SLUGS[sku];
      const product = slug ? kindOf(slug) : undefined;
      if (!product || product.productId !== productId) {
        return fail(404, "PRODUCT_NOT_FOUND", "Product not found");
      }
      if (product.kind !== "CUSTOMIZABLE") {
        return fail(409, "PRODUCT_NOT_CUSTOMIZABLE", "This product cannot be customized");
      }
      if (!product.skus.includes(sku) || template.code !== templateCode) {
        return fail(422, "TEMPLATE_NOT_FOUND", "No such customization template for this SKU");
      }

      const document = emptyDocument(template);
      const checksum = await sha256Hex(canonicalJson(document));
      const at = stamp();
      seq += 1;
      const row = newRow({
        id: newId(),
        customerId,
        productId,
        productSlug: slug,
        sku,
        templateCode,
        ownerUserId: userId,
        reviewerUserId: MOCK_QC_USER_ID,
        name,
        updatedAt: at,
        createdAt: at,
        seq,
        document: { document, checksum, updatedAt: at },
      });
      rows.push(row);
      return ok(toDraft(row));
    },

    /** P2 GET /catalog/products/{slug}/customization */
    customization(slug: string): MockResult {
      const product = kindOf(slug);
      if (!product) return fail(404, "NOT_FOUND", "Product not found");
      if (product.kind !== "CUSTOMIZABLE") {
        return fail(409, "PRODUCT_NOT_CUSTOMIZABLE", "This product cannot be customized");
      }
      const templates = product.skus.flatMap((sku) => {
        const template = MOCK_DESIGN_TEMPLATES[sku];
        return template ? [toTemplate(template)] : [];
      });
      return ok({ productId: product.productId, kind: product.kind, templates });
    },

    /** P3 GET /designs/{id}/document — the design's document, at the draft's version. */
    getDocument(id: string): MockResult {
      const row = find(id);
      if (!row) return notFound();
      const { document, checksum, updatedAt } = row.document;
      return ok({
        designId: row.id,
        version: row.version,
        document: structuredClone(document),
        checksum,
        updatedAt,
      });
    },

    /**
     * P3 PUT /designs/{id}/document with `{ version, document }`: 413 over 1 MB, and 400
     * VALIDATION_FAILED (a `document` field error) for a document that is not this design's.
     */
    async putDocument(
      id: string,
      body: { version?: unknown; document?: unknown } = {},
    ): Promise<MockResult> {
      const { version, document } = body;
      if (!isVersion(version)) return invalid([versionError()]);
      if (typeof document !== "object" || document === null || Array.isArray(document)) {
        return invalid([{ field: "document", message: "document is required", code: "NotNull" }]);
      }
      if (new TextEncoder().encode(JSON.stringify(document)).length > MAX_DOCUMENT_BYTES) {
        return fail(413, "PAYLOAD_TOO_LARGE", "The design document is too large");
      }
      const row = find(id);
      if (!row) return notFound();
      const problem = documentProblem(document, row);
      if (problem) {
        return invalid([{ field: "document", message: problem }]);
      }

      const checksum = await sha256Hex(canonicalJson(document));
      // Past the await everything is synchronous: the check and the write cannot be interleaved.
      const refused = editable(row, version);
      if (refused) return refused;
      const at = stamp();
      row.document = {
        document: structuredClone(document as MockDesignDocument),
        checksum,
        updatedAt: at,
      };
      voidReview(row);
      bump(row, at);
      return ok({
        designId: row.id,
        version: row.version,
        document: structuredClone(row.document.document),
        checksum,
        updatedAt: at,
      });
    },

    /** PUT /designs/{id}/specification with `{ version, spec }` (text ≤ 4000 characters). */
    revise(id: string, body: { version?: unknown; spec?: unknown } = {}): MockResult {
      const { version, spec } = body;
      const errors: FieldError[] = [];
      if (!isVersion(version)) errors.push(versionError());
      if (typeof spec !== "string" || !spec.trim()) {
        errors.push({ field: "spec", message: "spec must not be blank", code: "NotBlank" });
      } else if (spec.length > SPEC_MAX) {
        errors.push({ field: "spec", message: "spec is at most 4000 characters", code: "Size" });
      }
      if (errors.length || !isVersion(version) || typeof spec !== "string") return invalid(errors);
      const row = find(id);
      if (!row) return notFound();
      const refused = editable(row, version);
      if (refused) return refused;

      row.spec = spec;
      voidReview(row);
      bump(row);
      record(row, "SPECIFICATION_CHANGED", { notes: spec });
      return ok(toDraft(row));
    },

    /**
     * P5 POST /designs/{id}/technical-review-requests — the customer is done and QC should look. A
     * fresh review is awaited, so an earlier outcome is cleared; `reviewRequestedAt` equals
     * `updatedAt` until the next change.
     */
    requestReview(id: string, body: VersionBody = {}): MockResult {
      if (!isVersion(body.version)) return invalid([versionError()]);
      const row = find(id);
      if (!row) return notFound();
      const refused = editable(row, body.version);
      if (refused) return refused;
      if (!row.currentArtifactId) return conflict("A technical review needs a current preview");

      voidReview(row);
      const at = stamp();
      row.reviewRequestedAt = at;
      bump(row, at);
      record(row, "TECHNICAL_REVIEW_REQUESTED");
      return ok(toDraft(row));
    },

    /**
     * Mock-only: the QC reviewer's answer (BE POST /technical-reviews, assigned QC only). Needs a
     * DRAFT with a current preview; `notes` is shown to the customer.
     */
    completeReview(id: string, passed: boolean, notes: string): MockResult {
      const row = rows.find((r) => r.id === id);
      if (!row) return notFound();
      if (row.status !== "DRAFT" || !row.currentArtifactId) {
        return conflict("Review requires the current draft artifact");
      }
      row.technicalReviewPassed = passed;
      row.reviewNotes = notes;
      row.reviewedAt = stamp();
      bump(row, row.reviewedAt);
      record(row, passed ? "TECHNICAL_ACCEPTED" : "TECHNICAL_REJECTED", {
        notes,
        artifactId: row.currentArtifactId,
        actorId: row.reviewerUserId ?? MOCK_QC_USER_ID,
      });
      return ok(toDraft(row));
    },

    /** POST /designs/{id}/confirmation-requests — DRAFT → SUBMITTED, after a passed review. */
    submit(id: string, body: VersionBody = {}): MockResult {
      if (!isVersion(body.version)) return invalid([versionError()]);
      const row = find(id);
      if (!row) return notFound();
      const refused = editable(row, body.version);
      if (refused) return refused;
      if (!row.technicalReviewPassed || !row.currentArtifactId) {
        return conflict("Technical review is required");
      }

      row.status = "SUBMITTED";
      bump(row);
      record(row, "SENT_TO_CUSTOMER", {
        notes: "Customer confirmation requested for the current artifact and specification",
      });
      return ok(toDraft(row));
    },

    /**
     * POST /designs/{id}/confirmations with `{ version, artifactId }` — owner only, SUBMITTED →
     * APPROVED with an immutable snapshot of the artifacts and the document. Confirming again with
     * the snapshot's artifact answers the snapshot.
     */
    async confirm(
      id: string,
      body: { version?: unknown; artifactId?: unknown } = {},
    ): Promise<MockResult> {
      const { version, artifactId } = body;
      const errors: FieldError[] = [];
      if (!isVersion(version)) errors.push(versionError());
      if (typeof artifactId !== "string" || !artifactId) {
        errors.push({ field: "artifactId", message: "artifactId is required", code: "NotNull" });
      }
      if (errors.length || !isVersion(version) || typeof artifactId !== "string") {
        return invalid(errors);
      }
      const row = find(id);
      if (!row) return notFound();
      if (userId !== row.ownerUserId) return forbidden();
      if (row.snapshot?.artifactId === artifactId) return ok(toSnapshot(row, row.snapshot));

      // The manifest is the current artifact of every role; the hash is taken before the write.
      const manifestIds = new Set(Object.values(row.currentArtifacts));
      if (manifestIds.size === 0) manifestIds.add(artifactId);
      const manifest = row.artifacts.filter((a) => manifestIds.has(a.artifactId));
      const documentChecksum = row.document.checksum;
      const checksum = await snapshotChecksum(manifest, documentChecksum);

      if (row.version !== version) return conflict("The design changed; refresh before continuing");
      if (
        row.status !== "SUBMITTED" ||
        row.currentArtifactId !== artifactId ||
        !row.technicalReviewPassed
      ) {
        return conflict(
          "The current artifact must have a valid technical review and confirmation request",
        );
      }
      if (manifest.length !== manifestIds.size) {
        return conflict("The current design bundle is incomplete");
      }

      const at = stamp();
      const snapshot: SnapshotRow = {
        id: newId(),
        artifactId,
        checksum,
        spec: row.spec,
        confirmedBy: userId,
        confirmedAt: at,
        artifacts: manifest
          .map(({ blob: _blob, url: _url, uploadKey: _key, storedAt: _at, ...entry }) => entry)
          .sort((a, b) => (a.role < b.role ? -1 : a.role > b.role ? 1 : 0)),
        document: structuredClone(row.document.document),
        documentChecksum,
      };
      row.snapshot = snapshot;
      row.status = "APPROVED";
      bump(row, at);
      record(row, "CUSTOMER_CONFIRMED", { notes: snapshot.id, artifactId });
      return ok(toSnapshot(row, snapshot));
    },

    /** POST /designs/{id}/change-requests — owner only, SUBMITTED → DRAFT with the customer's reason. */
    requestChanges(id: string, body: { version?: unknown; reason?: unknown } = {}): MockResult {
      const parsed = readChange(body);
      if ("errors" in parsed) return invalid(parsed.errors);
      const { version, reason } = parsed;
      const row = find(id);
      if (!row) return notFound();
      if (row.version !== version) return conflict("The design changed; refresh before continuing");
      if (userId !== row.ownerUserId) return forbidden();
      if (row.status !== "SUBMITTED") return conflict("No pending confirmation");

      row.status = "DRAFT";
      voidReview(row);
      // BE: review(null, false, reason) — the customer's reason is what the design shows next.
      row.reviewNotes = reason;
      bump(row);
      record(row, "CUSTOMER_CHANGES_REQUESTED", { notes: reason });
      return ok(toDraft(row));
    },

    /** POST /designs/{id}/confirmation-withdrawals — owner or designer, SUBMITTED → DRAFT. */
    withdraw(id: string, body: { version?: unknown; reason?: unknown } = {}): MockResult {
      const parsed = readChange(body);
      if ("errors" in parsed) return invalid(parsed.errors);
      const { version, reason } = parsed;
      const row = find(id);
      if (!row) return notFound();
      if (row.version !== version) return conflict("The design changed; refresh before continuing");
      if (!mayEdit(row)) return forbidden();
      if (row.status !== "SUBMITTED") return conflict("No pending confirmation");

      row.status = "DRAFT";
      voidReview(row);
      bump(row);
      record(row, "WITHDRAWN", { notes: reason });
      return ok(toDraft(row));
    },

    /**
     * POST /designs/{id}/revisions — forks an APPROVED design into a new DRAFT that starts from the
     * confirmed document. Its images come along (same ids, same stored bytes) so the document's image
     * elements still resolve; the artifacts do not (the BE keeps none: they are uploaded anew).
     */
    fork(id: string): MockResult {
      const source = find(id);
      if (!source) return notFound();
      if (!mayEdit(source)) return forbidden();
      if (source.status !== "APPROVED" || !source.snapshot) {
        return conflict("Only confirmed designs can be forked");
      }

      const at = stamp();
      seq += 1;
      const { snapshot } = source;
      const row = newRow({
        id: newId(),
        customerId: source.customerId,
        productId: source.productId,
        productSlug: source.productSlug,
        sku: source.sku,
        templateCode: source.templateCode,
        ownerUserId: source.ownerUserId,
        assignedUserId: source.assignedUserId,
        reviewerUserId: source.reviewerUserId,
        name: source.name,
        spec: source.spec,
        parentSnapshotId: snapshot.id,
        // A copied row is not the product of a keyed upload: the source's key replays nothing here.
        assets: source.assets.map(({ uploadKey: _key, ...asset }) => ({ ...asset })),
        updatedAt: at,
        createdAt: at,
        seq,
        document: {
          document: structuredClone(snapshot.document),
          checksum: snapshot.documentChecksum,
          updatedAt: at,
        },
      });
      rows.push(row);
      record(row, "DERIVED_FROM_SNAPSHOT", { notes: snapshot.id });
      return ok(toDraft(row));
    },
  };
}

export type MockDesignStudio = ReturnType<typeof createMockDesignStudio>;
