/**
 * The design mock backend (spec 2026-11-09 §4, §5): the docs' lifecycle — DRAFT → PENDING_REVIEW
 * → APPROVED, DRAFT → ARCHIVED — for the one mock customer it serves, the caller. Its state lives
 * in memory and is written whole through `DesignMockStorage` after every write, awaited before the
 * answer, so a reload (IndexedDB) finds designs, documents, images and submitted files again.
 *
 * Rules (docs 12):
 *  - every write sends the version it saw; a stale one is 409 VERSION_CONFLICT (BR-11);
 *  - only a DRAFT is renamed, saved, submitted or deleted, else 409 INVALID_STATE (BR-07, BR-16),
 *    checked before the version so a tab that missed a submit learns the state changed;
 *  - at most 50 DRAFT designs, on create and on revision (§4.1, B37);
 *  - an ARCHIVED design is not found anywhere and never listed (BR-16);
 *  - a revision copies the APPROVED design's document and images (§4.7, BR-12).
 * `simulateApprove`, `simulateReturn` and `reset` stand in for the Sales Manager (spec §6.5).
 * Images and submissions are in `design-store-files.ts`, rows and envelope in `design-rows.ts`.
 */

import { emptyDocument } from "@/features/product-design/engine/document/factory";
import {
  MAX_DOCUMENT_BYTES,
  designDocumentSchema,
  type DesignDocument,
} from "@/features/product-design/engine/document/schema";
import { documentChecksum } from "@/features/product-design/engine/export/checksum";

import { isUsable, printConfigFor, type PrintConfigRow } from "./design-print-configs";
import {
  BUNDLE_ROLES,
  DESIGN_STATUSES,
  DRAFT_LIMIT,
  NAME_MAX,
  REASON_MAX,
  approvalNote,
  asRecord,
  boundedText,
  bundleChecksum,
  customerSkuCode,
  draftLimit,
  fail,
  invalid,
  invalidState,
  isIssue,
  isVersion,
  issuesNote,
  notFound,
  ok,
  toEventDto,
  versionConflict,
  type DesignDocumentRecordDto,
  type DesignMockState,
  type DesignRow,
  type EventRow,
  type MockResult,
} from "./design-rows";
import { seedDesignState } from "./design-seed";
import type { DesignMockStorage } from "./design-storage";
import { createDesignFiles } from "./design-store-files";

export interface DesignMockDeps {
  storage: DesignMockStorage;
  now?: () => Date;
  newId?: () => string;
  /** Natural pixel size of an uploaded image; defaults to the browser's `createImageBitmap`. */
  readImageSize?: (blob: Blob) => Promise<{ widthPx: number; heightPx: number }>;
  /** A URL for a stored blob; defaults to `URL.createObjectURL`, or `blob:mock/{key}` without it. */
  toUrl?: (key: string, blob: Blob) => string;
  /** Defaults to the mock's own print configurations. */
  printConfigFor?: (slug: string, sku: string) => PrintConfigRow | null;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 200;

async function browserImageSize(blob: Blob) {
  const bitmap = await createImageBitmap(blob);
  try {
    return { widthPx: bitmap.width, heightPx: bitmap.height };
  } finally {
    bitmap.close();
  }
}

const defaultToUrl = (key: string, blob: Blob) =>
  typeof URL.createObjectURL === "function" ? URL.createObjectURL(blob) : `blob:mock/${key}`;

/** A snapshot this store can read; anything else (an older shape) is replaced by the seed. */
function isState(rows: Record<string, unknown>): rows is DesignMockState {
  const { designs, documents, assets, history, files, seq } = rows;
  return (
    [designs, assets, history, files].every(Array.isArray) &&
    typeof documents === "object" &&
    documents !== null &&
    typeof seq === "object" &&
    seq !== null
  );
}

function toInt(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  return Number.isInteger(n) ? n : Number.NaN;
}

/** Why a document cannot be this design's (spec §4.1: the engine's schema, the template's areas). */
function documentProblem(document: unknown, config: PrintConfigRow | null): string | null {
  const parsed = designDocumentSchema.safeParse(document);
  if (!parsed.success) {
    const [issue] = parsed.error.issues;
    return issue ? `${issue.path.join(".")}: ${issue.message}` : "Not a design document";
  }
  if (!config) return null;
  const { template } = config;
  if (parsed.data.templateCode !== template.code || parsed.data.sku !== template.sku) {
    return "The document is not for this design's template";
  }
  const stray = Object.keys(parsed.data.surfaces).find(
    (code) => !template.printAreas.some((area) => area.code === code),
  );
  return stray ? `${stray} is not a print area of the template` : null;
}

export async function createDesignMockStore(deps: DesignMockDeps) {
  const { storage } = deps;
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? (() => globalThis.crypto.randomUUID());
  const toUrl = deps.toUrl ?? defaultToUrl;
  const configFor = deps.printConfigFor ?? printConfigFor;
  const stamp = () => now().toISOString();
  /** One URL per stored blob version, so a list polled every few seconds does not mint new ones. */
  const urls = new Map<string, string>();

  async function seeded(): Promise<DesignMockState> {
    const { state: fresh, blobs } = await seedDesignState(now());
    for (const [key, blob] of blobs) await storage.putBlob(key, blob);
    await storage.save({ rows: fresh });
    return fresh;
  }

  const loaded = await storage.load().catch(() => null);
  let state: DesignMockState = loaded && isState(loaded.rows) ? loaded.rows : await seeded();

  const persist = () => storage.save({ rows: state });
  const find = (id: string) => state.designs.find((d) => d.id === id && d.status !== "ARCHIVED");
  const drafts = () => state.designs.filter((d) => d.status === "DRAFT").length;
  const configOf = (row: DesignRow) => configFor(row.product.slug, row.variant.sku);

  function record(
    row: DesignRow,
    type: EventRow["type"],
    note: string | null,
    version: number,
    at = stamp(),
  ): EventRow {
    const event: EventRow = { designId: row.id, type, at, version, note };
    state.history.push(event);
    return event;
  }

  /** A change to the design: the optimistic-lock token moves and the modification time with it. */
  function touch(row: DesignRow) {
    row.version += 1;
    row.updatedAt = stamp();
  }

  function advance(row: DesignRow, type: EventRow["type"], note: string | null) {
    touch(row);
    record(row, type, note, row.version, row.updatedAt);
  }

  async function link(key: string, checksum: string, url?: string): Promise<string | null> {
    if (url) return url;
    const cacheKey = `${key}#${checksum}`;
    const cached = urls.get(cacheKey);
    if (cached) return cached;
    const blob = await storage.getBlob(key);
    if (!blob) return null;
    const made = toUrl(key, blob);
    urls.set(cacheKey, made);
    return made;
  }

  const uploads = createDesignFiles({
    state: () => state,
    storage,
    now,
    stamp,
    newId,
    readImageSize: deps.readImageSize ?? browserImageSize,
    link,
    find,
    configOf,
    advance,
    record,
    persist,
  });

  function newDraft(
    from: Pick<DesignRow, "product" | "variant">,
    name: string,
    sourceSnapshotId: string | null,
    at: string,
  ): DesignRow {
    state.seq.design += 1;
    const row: DesignRow = {
      id: newId(),
      seq: state.seq.design,
      name,
      status: "DRAFT",
      product: { slug: from.product.slug, title: from.product.title },
      variant: { sku: from.variant.sku, label: from.variant.label },
      version: 0,
      projectId: null, // part E
      sourceSnapshotId,
      lastReturn: null,
      createdAt: at,
      updatedAt: at,
      submittedAt: null,
      approvedAt: null,
      approval: null,
    };
    state.designs.push(row);
    return row;
  }

  function documentRecord(row: DesignRow): DesignDocumentRecordDto {
    const { document, checksum, updatedAt } = state.documents[row.id]!;
    return {
      designId: row.id,
      version: row.version,
      document: structuredClone(document),
      checksum,
      updatedAt,
    };
  }

  return {
    /** false for memory storage: the simulation panel says data is lost on reload. */
    persistent: storage.persistent,

    /** GET /designs?status=&page=&size= — newest updated first, 0-based pages, never ARCHIVED. */
    async list(query: { status?: unknown; page?: unknown; size?: unknown } = {}) {
      const status = query.status === "" ? undefined : query.status;
      if (status !== undefined && !DESIGN_STATUSES.some((s) => s === status)) {
        return fail(400, "UNSUPPORTED_PARAMETER", "Unsupported status filter");
      }
      const page = toInt(query.page, 0);
      const size = toInt(query.size, DEFAULT_PAGE_SIZE);
      if (!(page >= 0) || !(size >= 1) || size > MAX_PAGE_SIZE) {
        return fail(400, "UNSUPPORTED_PARAMETER", `page ≥ 0 and size 1..${MAX_PAGE_SIZE}`);
      }
      const mine = state.designs
        .filter((d) => d.status !== "ARCHIVED" && (status === undefined || d.status === status))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.seq - a.seq);
      const totalPages = Math.ceil(mine.length / size);
      const items = await Promise.all(
        mine.slice(page * size, (page + 1) * size).map((row) => uploads.toDto(row)),
      );
      return ok({
        items,
        page,
        size,
        totalElements: mine.length,
        totalPages,
        hasNext: page + 1 < totalPages,
        hasPrevious: page > 0,
      });
    },

    /** GET /designs/draft-count */
    async draftCount(): Promise<MockResult> {
      return ok({ drafts: drafts(), limit: DRAFT_LIMIT });
    },

    /** POST /designs `{ productSlug, sku, name }` — a DRAFT with the template's empty document. */
    async create(body: unknown): Promise<MockResult> {
      const input = asRecord(body);
      const productSlug = typeof input.productSlug === "string" ? input.productSlug.trim() : "";
      const sku = typeof input.sku === "string" ? input.sku.trim() : "";
      if (!productSlug) return invalid("productSlug", "productSlug must not be blank");
      if (!sku) return invalid("sku", "sku must not be blank");
      const name = boundedText("name", input.name, NAME_MAX);
      if ("refused" in name) return name.refused;

      // docs 12 BR-01, BR-02: an ACTIVE variant of a usable product, with a print configuration.
      const config = configFor(productSlug, sku);
      if (!config) {
        return fail(422, "PRINT_CONFIG_MISSING", "This variant has no print configuration");
      }
      if (!isUsable(config)) {
        return fail(422, "VARIANT_UNAVAILABLE", "This variant no longer takes designs");
      }
      if (drafts() >= DRAFT_LIMIT) return draftLimit();
      const document = emptyDocument(config.template);
      const checksum = await documentChecksum(document);
      if (drafts() >= DRAFT_LIMIT) return draftLimit(); // another create may have run meanwhile

      const at = stamp();
      const row = newDraft(
        { product: config.product, variant: { sku: config.sku, label: config.sku } },
        name.text,
        null,
        at,
      );
      state.documents[row.id] = { designId: row.id, document, checksum, updatedAt: at };
      record(row, "CREATED", null, 0, at);
      await persist();
      return ok(await uploads.toDto(row), 201);
    },

    /** GET /designs/{id} */
    async get(id: string): Promise<MockResult> {
      const row = find(id);
      return row ? ok(await uploads.toDto(row)) : notFound();
    },

    /** PATCH /designs/{id} `{ name, version }` */
    async rename(id: string, body: unknown): Promise<MockResult> {
      const row = find(id);
      if (!row) return notFound();
      const { name: rawName, version } = asRecord(body);
      const name = boundedText("name", rawName, NAME_MAX);
      if ("refused" in name) return name.refused;
      if (!isVersion(version)) return invalid("version", "version must be a whole number ≥ 0");
      if (row.status !== "DRAFT") return invalidState();
      if (row.version !== version) return versionConflict();
      row.name = name.text;
      touch(row);
      await persist();
      return ok(await uploads.toDto(row));
    },

    /** GET /designs/{id}/history — oldest first. */
    async history(id: string): Promise<MockResult> {
      if (!find(id)) return notFound();
      return ok(state.history.filter((event) => event.designId === id).map(toEventDto));
    },

    /** GET /designs/{id}/document — `{ designId, version, document, checksum, updatedAt }`. */
    async getDocument(id: string): Promise<MockResult> {
      const row = find(id);
      return row ? ok(documentRecord(row)) : notFound();
    },

    /** PUT /designs/{id}/document `{ version, document }` — a save: version + 1. */
    async putDocument(id: string, body: unknown): Promise<MockResult> {
      const row = find(id);
      if (!row) return notFound();
      const { version, document } = asRecord(body);
      if (!isVersion(version)) return invalid("version", "version must be a whole number ≥ 0");
      if (row.status !== "DRAFT") return invalidState();
      if (row.version !== version) return versionConflict();
      const problem = documentProblem(document, configOf(row));
      if (problem) return invalid("document", problem);
      if (new TextEncoder().encode(JSON.stringify(document)).length > MAX_DOCUMENT_BYTES) {
        return fail(413, "PAYLOAD_TOO_LARGE", "The design document is too large");
      }
      // Kept as sent (the schema only checked it), so its checksum is the browser's.
      const saved = structuredClone(document) as DesignDocument;
      const checksum = await documentChecksum(saved);

      // Past the await: the design may have moved meanwhile (another tab).
      if (find(id) !== row || row.status !== "DRAFT") return invalidState();
      if (row.version !== version) return versionConflict();
      touch(row);
      state.documents[id] = { designId: id, document: saved, checksum, updatedAt: row.updatedAt };
      await persist();
      return ok(documentRecord(row));
    },

    listAssets: uploads.listAssets,
    uploadAsset: uploads.uploadAsset,
    assetLink: uploads.assetLink,
    submit: uploads.submit,
    files: uploads.files,

    /**
     * POST /designs/{id}/preflight-failures `{ version, issues }` — the browser's preflight refused
     * a submit (docs 12 §5.3): on the record at the version it checked, nothing else changes.
     */
    async recordPreflightFailure(id: string, body: unknown): Promise<MockResult> {
      const row = find(id);
      if (!row) return notFound();
      const { version, issues } = asRecord(body);
      if (!isVersion(version)) return invalid("version", "version must be a whole number ≥ 0");
      if (!Array.isArray(issues) || !issues.length || !issues.every(isIssue)) {
        return invalid("issues", "issues must list what failed");
      }
      if (row.status !== "DRAFT") return invalidState();
      const event = record(row, "PREFLIGHT_FAILED", issuesNote(issues), version);
      await persist();
      return ok(toEventDto(event), 201);
    },

    /** DELETE /designs/{id} `{ version }` — DRAFT → ARCHIVED, never restored (docs 12 BR-16). */
    async remove(id: string, body: unknown): Promise<MockResult> {
      const row = find(id);
      if (!row) return notFound();
      const { version } = asRecord(body);
      if (!isVersion(version)) return invalid("version", "version must be a whole number ≥ 0");
      if (row.status !== "DRAFT") return invalidState();
      if (row.version !== version) return versionConflict();
      row.status = "ARCHIVED";
      advance(row, "ARCHIVED", null);
      await persist();
      return ok(await uploads.toDto(row));
    },

    /**
     * POST /designs/{id}/revisions — a new DRAFT from an APPROVED design's snapshot (docs 12 §4.7,
     * BR-12). Its images come along under the same ids, so the copied document's image elements
     * resolve in the new design; the submitted files do not (a revision is submitted anew).
     */
    async revise(id: string): Promise<MockResult> {
      const source = find(id);
      if (!source) return notFound();
      if (source.status !== "APPROVED" || !source.approval) return invalidState();
      if (drafts() >= DRAFT_LIMIT) return draftLimit();

      const at = stamp();
      const { snapshotId } = source.approval;
      const row = newDraft(source, source.name, snapshotId, at);
      const { document, checksum } = state.documents[source.id]!;
      state.documents[row.id] = {
        designId: row.id,
        document: structuredClone(document),
        checksum,
        updatedAt: at,
      };
      const copies = state.assets
        .filter((asset) => asset.designId === source.id)
        .map((asset) => ({ ...asset, designId: row.id, uploadKey: null }));
      state.assets.push(...copies);
      record(row, "DERIVED_FROM_SNAPSHOT", snapshotId, 0, at);
      await persist();
      return ok(await uploads.toDto(row), 201);
    },

    /** GET /catalog/products/{slug}/variants/{sku}/print-config */
    async printConfig(slug: string, sku: string): Promise<MockResult> {
      const config = configFor(slug, sku);
      return config
        ? ok(config)
        : fail(404, "NOT_FOUND", "This variant has no print configuration");
    },

    /**
     * Mock-only POST /__mock/designs/{id}/approve — PENDING_REVIEW → APPROVED: the submitted bundle
     * and the document are frozen under a snapshot id and a checksum, and a customer SKU code is
     * made (docs 12 §4.5, BR-08, BR-09).
     */
    async simulateApprove(id: string): Promise<MockResult> {
      const row = find(id);
      if (!row) return notFound();
      if (row.status !== "PENDING_REVIEW") return invalidState();
      const bundle = state.files.filter((file) => file.designId === id);
      if (bundle.length !== BUNDLE_ROLES.length) {
        return fail(409, "INVALID_STATE", "The submitted bundle is incomplete");
      }
      const checksum = await bundleChecksum(bundle, state.documents[id]!.checksum);

      if (find(id) !== row || row.status !== "PENDING_REVIEW") return invalidState();
      const approvedOfSku = state.designs.filter(
        (d) => d.approval && d.variant.sku === row.variant.sku,
      ).length;
      const approval = {
        snapshotId: newId(),
        skuCode: customerSkuCode(row.variant.sku, approvedOfSku + 1),
        bundleChecksum: checksum,
      };
      row.status = "APPROVED";
      row.approval = approval;
      advance(row, "APPROVED", approvalNote(approval));
      row.approvedAt = row.updatedAt;
      await persist();
      return ok(await uploads.toDto(row));
    },

    /** Mock-only POST /__mock/designs/{id}/return `{ reason }` — PENDING_REVIEW → DRAFT (BR-06). */
    async simulateReturn(id: string, body: unknown): Promise<MockResult> {
      const row = find(id);
      if (!row) return notFound();
      const reason = boundedText("reason", asRecord(body).reason, REASON_MAX);
      if ("refused" in reason) return reason.refused;
      if (row.status !== "PENDING_REVIEW") return invalidState();
      row.status = "DRAFT";
      advance(row, "RETURNED", reason.text);
      row.lastReturn = { reason: reason.text, returnedAt: row.updatedAt };
      await persist();
      return ok(await uploads.toDto(row));
    },

    /** Mock-only POST /__mock/reset — everything cleared, the seed written again. */
    async reset(): Promise<MockResult> {
      await storage.clear();
      urls.clear();
      state = await seeded();
      return ok(null);
    },
  };
}

export type DesignMockStore = Awaited<ReturnType<typeof createDesignMockStore>>;
