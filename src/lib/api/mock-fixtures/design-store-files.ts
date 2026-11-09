/**
 * Images and submitted files of the design mock (spec 2026-11-09 §4.2):
 *  - an upload is checked against the variant's file rules — type, size, a readable image — and
 *    refused with 422 FILE_REJECTED without storing anything (docs 12 BR-04); the same
 *    `Idempotency-Key` with the same file answers the first upload again;
 *  - a link is a short-lived URL of the stored blob; a row whose blob is gone answers 404;
 *  - a submission (docs 12 §4.3, BR-05, BR-07) needs a DRAFT at the sent version, a passing
 *    browser preflight, the server's own re-check of what it can see (variant ACTIVE, carton spec,
 *    content, every placed image stored and within the rules), then the three files whose SHA-256
 *    match what the browser sent. A preflight refusal is recorded as PREFLIGHT_FAILED.
 */

import type { DesignDocument } from "@/features/product-design/engine/document/schema";
import { sha256Hex } from "@/features/product-design/engine/export/checksum";
import { variantIssues } from "@/features/product-design/engine/preflight/rules/variant";
import type { PreflightIssue } from "@/features/product-design/engine/preflight/types";
import type { PrintAreaCode } from "@/features/product-design/engine/template/schema";

import { DEFAULT_FILE_RULES, isUsable, type PrintConfigRow } from "./design-print-configs";
import {
  BUNDLE_ROLES,
  assetKey,
  fail,
  fileKey,
  fileRejected,
  invalid,
  invalidState,
  isIssue,
  isVersion,
  issuesNote,
  notFound,
  ok,
  preflightFailed,
  toAssetDto,
  toDesignDto,
  versionConflict,
  type AssetRow,
  type BundleRole,
  type DesignDto,
  type DesignMockState,
  type DesignRow,
  type DesignFileDto,
  type EventRow,
  type MockResult,
} from "./design-rows";
import type { DesignMockStorage } from "./design-storage";

const BYTES_PER_MB = 1024 * 1024;
const LINK_TTL_MS = 5 * 60_000;

/** What the store lends this module. */
export interface FilesContext {
  state(): DesignMockState;
  storage: DesignMockStorage;
  now(): Date;
  stamp(): string;
  newId(): string;
  readImageSize(blob: Blob): Promise<{ widthPx: number; heightPx: number }>;
  /** A URL for the blob under `key`; null when the blob is gone. A static `url` wins. */
  link(key: string, checksum: string, url?: string): Promise<string | null>;
  /** A design the caller can see (ARCHIVED is not found). */
  find(id: string): DesignRow | undefined;
  configOf(row: DesignRow): PrintConfigRow | null;
  /** Version + 1 and `updatedAt`, then the event at that version. */
  advance(row: DesignRow, type: EventRow["type"], note: string | null): void;
  record(row: DesignRow, type: EventRow["type"], note: string | null, version: number): EventRow;
  persist(): Promise<void>;
}

/** The multipart parts of POST /designs/{id}/submissions, as the route read them. */
export type DesignSubmission = {
  version: unknown;
  /** `{ result: "Pass" | "Fail", issues }`, the browser's preflight. */
  preflight: unknown;
  /** `{ PRINT_READY, CUSTOMER_PREVIEW, TECHNICAL_SPEC }`: SHA-256 hex of each file. */
  checksums: unknown;
  files: Partial<Record<BundleRole, Blob>>;
};

const mimeOf = (file: Blob) => (file.type.split(";")[0] ?? "").trim().toLowerCase();
const nameOf = (file: Blob, fallback: string) =>
  "name" in file && typeof file.name === "string" && file.name ? file.name : fallback;
const hashOf = async (blob: Blob) => sha256Hex(new Uint8Array(await blob.arrayBuffer()));

const FALLBACK_NAMES: Record<BundleRole, string> = {
  CUSTOMER_PREVIEW: "preview.png",
  PRINT_READY: "print-ready.pdf",
  TECHNICAL_SPEC: "technical-spec.pdf",
};

/** The browser's preflight, or null when it is not `{ result: Pass | Fail, issues: [...] }`. */
function readPreflight(
  value: unknown,
): { result: "Pass" | "Fail"; issues: PreflightIssue[] } | null {
  if (typeof value !== "object" || value === null) return null;
  const { result, issues } = value as { result?: unknown; issues?: unknown };
  if (result !== "Pass" && result !== "Fail") return null;
  if (!Array.isArray(issues) || !issues.every(isIssue)) return null;
  return { result, issues };
}

export function createDesignFiles(ctx: FilesContext) {
  const assetsOf = (designId: string) => ctx.state().assets.filter((a) => a.designId === designId);
  /** The design's latest submission, by role. */
  const bundleOf = (designId: string) =>
    new Map(
      ctx
        .state()
        .files.filter((f) => f.designId === designId)
        .map((f) => [f.role, f] as const),
    );
  const rulesOf = (row: DesignRow) => ctx.configOf(row)?.fileRules ?? DEFAULT_FILE_RULES;

  /** A stored image is usable when its bytes are still there and it is within the file rules. */
  async function assetUsable(asset: AssetRow | undefined, row: DesignRow): Promise<boolean> {
    if (!asset) return false;
    const rules = rulesOf(row);
    if (!rules.formats.includes(asset.contentType)) return false;
    if (asset.sizeBytes > rules.maxFileSizeMb * BYTES_PER_MB) return false;
    return asset.url !== undefined || (await ctx.storage.getBlob(assetKey(asset.assetId))) !== null;
  }

  /** What the server re-checks of the browser's preflight (spec §4.2), as engine-shaped issues. */
  async function recheck(row: DesignRow): Promise<PreflightIssue[]> {
    const config = ctx.configOf(row);
    const issues = variantIssues({
      usable: config !== null && isUsable(config),
      hasCartonSpec: config?.hasCartonSpec ?? true,
    });
    const { document } = ctx.state().documents[row.id]!;
    const surfaces = Object.entries(document.surfaces) as Array<
      [PrintAreaCode, DesignDocument["surfaces"][PrintAreaCode]]
    >;
    // As the engine's EMPTY_DESIGN: a background or a visible element on some surface.
    const hasContent = surfaces.some(
      ([, surface]) =>
        surface !== undefined &&
        (surface.background.kind !== "none" || surface.elements.some((el) => !el.hidden)),
    );
    if (!hasContent) {
      issues.push({ ruleId: "EMPTY_DESIGN", level: "fail", message: "Thiết kế chưa có nội dung." });
    }
    const assets = assetsOf(row.id);
    for (const [surfaceCode, surface] of surfaces) {
      for (const el of surface?.elements ?? []) {
        if (el.type !== "image" || el.hidden) continue;
        const asset = assets.find((a) => a.assetId === el.assetId);
        if (await assetUsable(asset, row)) continue;
        issues.push({
          ruleId: "ASSET_INVALID",
          level: "fail",
          message: "Ảnh không hợp lệ hoặc không tải được.",
          surfaceCode,
          elementId: el.id,
        });
      }
    }
    return issues;
  }

  /** 422 PREFLIGHT_FAILED, on the record (docs 12 §5.3); the design stays as it was. */
  async function refusePreflight(row: DesignRow, issues: PreflightIssue[]): Promise<MockResult> {
    if (ctx.find(row.id) !== row || row.status !== "DRAFT") return invalidState();
    ctx.record(row, "PREFLIGHT_FAILED", issuesNote(issues), row.version);
    await ctx.persist();
    return preflightFailed(issues);
  }

  /** The design's latest CUSTOMER_PREVIEW, for cards; null before the first submission. */
  async function previewUrl(row: DesignRow): Promise<string | null> {
    const preview = bundleOf(row.id).get("CUSTOMER_PREVIEW");
    return preview ? ctx.link(fileKey(row.id, preview.role), preview.sha256, preview.url) : null;
  }

  return {
    /** The design as the API answers it, with its `previewUrl`. */
    async toDto(row: DesignRow): Promise<DesignDto> {
      return toDesignDto(row, await previewUrl(row));
    },

    /** GET /designs/{id}/assets — newest first. */
    async listAssets(id: string): Promise<MockResult> {
      if (!ctx.find(id)) return notFound();
      return ok(assetsOf(id).reverse().map(toAssetDto));
    },

    /** POST /designs/{id}/assets (multipart `file`, `Idempotency-Key`). */
    async uploadAsset(id: string, file: Blob, name?: string, key?: string): Promise<MockResult> {
      const row = ctx.find(id);
      if (!row) return notFound();
      if (row.status !== "DRAFT") return invalidState();
      const rules = rulesOf(row);
      const contentType = mimeOf(file);
      if (!rules.formats.includes(contentType)) {
        return fileRejected(`Accepted formats: ${rules.formats.join(", ")}`);
      }
      if (file.size > rules.maxFileSizeMb * BYTES_PER_MB) {
        return fileRejected(`The file is over ${rules.maxFileSizeMb} MB`);
      }
      const [checksum, size] = await Promise.all([
        hashOf(file),
        ctx.readImageSize(file).catch(() => null),
      ]);
      if (!size || size.widthPx < 1 || size.heightPx < 1) {
        return fileRejected("The file is not a readable image");
      }

      // Past the awaits the checks and the write run without interruption.
      const uploadKey = key?.trim() || null;
      const earlier = uploadKey ? assetsOf(id).find((a) => a.uploadKey === uploadKey) : undefined;
      if (earlier) {
        return earlier.checksum === checksum
          ? ok(toAssetDto(earlier), 201)
          : fail(422, "IDEMPOTENCY_KEY_REUSED", "This key was already used for another file");
      }
      if (ctx.find(id)?.status !== "DRAFT") return invalidState();
      const asset: AssetRow = {
        designId: id,
        assetId: ctx.newId(),
        originalName: name ?? nameOf(file, "upload"),
        contentType,
        widthPx: size.widthPx,
        heightPx: size.heightPx,
        sizeBytes: file.size,
        checksum,
        storedAt: ctx.stamp(),
        uploadKey,
      };
      ctx.state().assets.push(asset);
      await ctx.storage.putBlob(assetKey(asset.assetId), file);
      await ctx.persist();
      return ok(toAssetDto(asset), 201);
    },

    /** GET /designs/{id}/assets/{assetId}/url — `{ url, expiresAt }`. */
    async assetLink(id: string, assetId: string): Promise<MockResult> {
      if (!ctx.find(id)) return notFound();
      const asset = assetsOf(id).find((a) => a.assetId === assetId);
      const url = asset ? await ctx.link(assetKey(assetId), asset.checksum, asset.url) : null;
      if (!url) return notFound();
      return ok({ url, expiresAt: new Date(ctx.now().getTime() + LINK_TTL_MS).toISOString() });
    },

    /** GET /designs/{id}/files — the latest submission, in role order. */
    async files(id: string): Promise<MockResult> {
      if (!ctx.find(id)) return notFound();
      const listed: DesignFileDto[] = [];
      const bundle = bundleOf(id);
      for (const role of BUNDLE_ROLES) {
        const file = bundle.get(role);
        const url = file ? await ctx.link(fileKey(id, role), file.sha256, file.url) : null;
        if (file && url) {
          listed.push({
            role,
            name: file.name,
            sizeBytes: file.sizeBytes,
            sha256: file.sha256,
            url,
          });
        }
      }
      return ok(listed);
    },

    /** POST /designs/{id}/submissions — DRAFT → PENDING_REVIEW. */
    async submit(id: string, form: DesignSubmission): Promise<MockResult> {
      const row = ctx.find(id);
      if (!row) return notFound();
      const { version } = form;
      if (!isVersion(version)) return invalid("version", "version must be a whole number ≥ 0");
      const preflight = readPreflight(form.preflight);
      if (!preflight) return invalid("preflight", "preflight must be { result, issues }");
      if (row.status !== "DRAFT") return invalidState();
      if (row.version !== version) return versionConflict();

      if (preflight.result === "Fail") return refusePreflight(row, preflight.issues);
      const issues = await recheck(row);
      if (issues.length) return refusePreflight(row, issues);

      const missing = BUNDLE_ROLES.filter((role) => !form.files[role]);
      if (missing.length) return fileRejected(`Missing ${missing.join(", ")}`);
      const sent = (form.checksums ?? {}) as Partial<Record<BundleRole, unknown>>;
      const hashes = await Promise.all(BUNDLE_ROLES.map((role) => hashOf(form.files[role]!)));
      const mismatched = BUNDLE_ROLES.filter((role, i) => sent[role] !== hashes[i]);
      if (mismatched.length) return fileRejected(`Checksum mismatch: ${mismatched.join(", ")}`);

      // Past the awaits: the design may have moved meanwhile (another tab).
      if (ctx.find(id) !== row || row.status !== "DRAFT") return invalidState();
      if (row.version !== version) return versionConflict();
      const storedAt = ctx.stamp();
      const state = ctx.state();
      state.files = state.files.filter((f) => f.designId !== id);
      for (const [i, role] of BUNDLE_ROLES.entries()) {
        const file = form.files[role]!;
        state.files.push({
          designId: id,
          role,
          name: nameOf(file, FALLBACK_NAMES[role]),
          contentType: mimeOf(file),
          sizeBytes: file.size,
          sha256: hashes[i]!,
          storedAt,
        });
      }
      row.status = "PENDING_REVIEW";
      ctx.advance(row, "SUBMITTED_FOR_REVIEW", null);
      row.submittedAt = row.updatedAt;
      for (const role of BUNDLE_ROLES) {
        await ctx.storage.putBlob(fileKey(id, role), form.files[role]!);
      }
      await ctx.persist();
      return ok(toDesignDto(row, await previewUrl(row)));
    },
  };
}

export type DesignFiles = ReturnType<typeof createDesignFiles>;
