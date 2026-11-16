/**
 * Images and submitted files of the design mock (spec 2026-11-09 §4.2):
 *  - an upload is checked against the variant's file rules — type, size, a readable image — and
 *    refused with 422 FILE_REJECTED without storing anything (docs 12 BR-04); the same
 *    `Idempotency-Key` with the same file answers the first upload again;
 *  - a link is a short-lived URL of the stored blob; a row whose blob is gone answers 404;
 *  - the submitted files are listed as the latest submission (`design-store-submission.ts`) left
 *    them;
 *  - bytes are stored before the rows that list them, and a write that fails part-way deletes the
 *    bytes it stored (`withBlobs`): a failure leaves neither rows nor bytes behind.
 */

import { sha256Hex } from "@/features/product-design/engine/export/checksum";

import { DEFAULT_FILE_RULES, type PrintConfigRow } from "./design-print-configs";
import {
  BYTES_PER_MB,
  BUNDLE_ROLES,
  asRecord,
  assetKey,
  fail,
  fileBlobKey,
  fileRejected,
  invalidState,
  notFound,
  ok,
  toAssetDto,
  toDesignDto,
  type AssetRow,
  type BundleRole,
  type DesignDto,
  type DesignMockState,
  type DesignRow,
  type DesignFileDto,
  type EventRow,
  type FileRow,
  type MockResult,
} from "./design-rows";
import type { DesignMockStorage } from "./design-storage";

const LINK_TTL_MS = 5 * 60_000;

/**
 * What the store lends this module and the submission. Its functions run inside the store's
 * operations: alone, over the state just loaded from storage, so a check and the write after it
 * cannot be interleaved.
 */
export interface FilesContext {
  state(): DesignMockState;
  storage: DesignMockStorage;
  now(): Date;
  stamp(): string;
  newId(): string;
  readImageSize(blob: Blob): Promise<{ widthPx: number; heightPx: number }>;
  /** A URL for the blob under `key`; null when the blob is gone. A static `url` wins. */
  link(key: string, checksum: string, url?: string): Promise<string | null>;
  /** Deletes blobs no row lists any more, best-effort (a failure is logged, never thrown). */
  discardBlobs(keys: readonly string[]): Promise<void>;
  /** A design the caller can see (ARCHIVED is not found). */
  find(id: string): DesignRow | undefined;
  configOf(row: DesignRow): PrintConfigRow | null;
  /** Version + 1 and `updatedAt`, then the event at that version. */
  advance(row: DesignRow, type: EventRow["type"], note: string | null): void;
  record(row: DesignRow, type: EventRow["type"], note: string | null, version: number): EventRow;
  persist(): Promise<void>;
}

export const mimeOf = (file: Blob) => (file.type.split(";")[0] ?? "").trim().toLowerCase();
export const nameOf = (file: Blob, fallback: string) =>
  "name" in file && typeof file.name === "string" && file.name ? file.name : fallback;
export const hashOf = async (blob: Blob) => sha256Hex(new Uint8Array(await blob.arrayBuffer()));

export const assetsOf = (ctx: FilesContext, designId: string) =>
  ctx.state().assets.filter((a) => a.designId === designId);
export const rulesOf = (ctx: FilesContext, row: DesignRow) =>
  ctx.configOf(row)?.fileRules ?? DEFAULT_FILE_RULES;

/** The file rules as a refusal of an upload (BR-18, B34), or null when the file passes them. */
export function ruleRefusal(
  rules: { formats: readonly string[]; maxFileSizeMb: number },
  contentType: string,
  sizeBytes: number,
): MockResult | null {
  if (!rules.formats.includes(contentType)) {
    return fileRejected(`Accepted formats: ${rules.formats.join(", ")}`);
  }
  if (sizeBytes > rules.maxFileSizeMb * BYTES_PER_MB) {
    return fileRejected(`The file is over ${rules.maxFileSizeMb} MB`);
  }
  return null;
}

/**
 * What an image upload checks before it stores anything, for a design's and a library's alike:
 * the type and size by `rules`, then that the bytes are a readable image. Answers what the row
 * needs (type, SHA-256, pixel size), or the refusal.
 */
export async function readImageUpload(
  ctx: FilesContext,
  file: Blob,
  rules: { formats: readonly string[]; maxFileSizeMb: number },
): Promise<
  | { refused: MockResult }
  | { contentType: string; checksum: string; widthPx: number; heightPx: number }
> {
  const contentType = mimeOf(file);
  const refused = ruleRefusal(rules, contentType, file.size);
  if (refused) return { refused };
  const [checksum, size] = await Promise.all([
    hashOf(file),
    ctx.readImageSize(file).catch(() => null),
  ]);
  if (!size || size.widthPx < 1 || size.heightPx < 1) {
    return { refused: fileRejected("The file is not a readable image") };
  }
  return { contentType, checksum, ...size };
}

/** The same key with other bytes (a retry that is not one): 422 `IDEMPOTENCY_KEY_REUSED`. */
export const keyReused = () =>
  fail(422, "IDEMPOTENCY_KEY_REUSED", "This key was already used for another file");

/** A stored image is usable when its bytes are still there and it is within the file rules. */
export async function assetUsable(
  ctx: FilesContext,
  asset: AssetRow | undefined,
  row: DesignRow,
): Promise<boolean> {
  if (!asset) return false;
  const rules = rulesOf(ctx, row);
  if (!rules.formats.includes(asset.contentType)) return false;
  if (asset.sizeBytes > rules.maxFileSizeMb * BYTES_PER_MB) return false;
  return asset.url !== undefined || (await ctx.storage.getBlob(assetKey(asset.assetId))) !== null;
}

/**
 * Runs `write`, which stores blobs through `put` and then saves the rows that list them. Should it
 * throw, the blobs it stored are deleted again, best-effort, and its own error is the one thrown:
 * a clean-up that fails too is only logged (`discardBlobs`).
 */
export async function withBlobs<T>(
  ctx: FilesContext,
  write: (put: (key: string, blob: Blob) => Promise<void>) => Promise<T>,
): Promise<T> {
  const written: string[] = [];
  try {
    return await write(async (key, blob) => {
      written.push(key); // before the write: one that fails part-way may have stored something
      await ctx.storage.putBlob(key, blob);
    });
  } catch (error) {
    await ctx.discardBlobs(written).catch(() => undefined); // the write's error wins
    throw error;
  }
}

/** The name of a bundle file sent without one. */
const FALLBACK_NAMES: Record<BundleRole, string> = {
  CUSTOMER_PREVIEW: "preview.png",
  PRINT_READY: "print-ready.pdf",
  TECHNICAL_SPEC: "technical-spec.pdf",
};

/** The three files of a submission and the SHA-256 the browser sent for each (`checksums`). */
export type BundleForm = { checksums: unknown; files: Partial<Record<BundleRole, Blob>> };

/**
 * The checks every bundle meets (a single submission's, a review round's upload): all three files,
 * each matching the SHA-256 sent for it, else 422 FILE_REJECTED. Answers the hashes in role order.
 */
export async function readBundle(
  form: BundleForm,
): Promise<{ hashes: string[] } | { refused: MockResult }> {
  const missing = BUNDLE_ROLES.filter((role) => !form.files[role]);
  if (missing.length) return { refused: fileRejected(`Missing ${missing.join(", ")}`) };
  const sent = asRecord(form.checksums);
  const hashes = await Promise.all(BUNDLE_ROLES.map((role) => hashOf(form.files[role]!)));
  const mismatched = BUNDLE_ROLES.filter((role, i) => sent[role] !== hashes[i]);
  if (mismatched.length) {
    return { refused: fileRejected(`Checksum mismatch: ${mismatched.join(", ")}`) };
  }
  return { hashes };
}

/** The rows of a bundle `readBundle` accepted, its blobs to be stored under `keyOf(role)`. */
export function bundleRows(
  designId: string,
  files: BundleForm["files"],
  hashes: readonly string[],
  storedAt: string,
  keyOf: (role: BundleRole) => string,
): FileRow[] {
  return BUNDLE_ROLES.map((role, i) => {
    const file = files[role]!;
    return {
      designId,
      role,
      name: nameOf(file, FALLBACK_NAMES[role]),
      contentType: mimeOf(file),
      sizeBytes: file.size,
      sha256: hashes[i]!,
      storedAt,
      key: keyOf(role),
    };
  });
}

export function createDesignFiles(ctx: FilesContext) {
  /** The design's latest submission, by role. */
  const bundleOf = (designId: string) =>
    new Map(
      ctx
        .state()
        .files.filter((f) => f.designId === designId)
        .map((f) => [f.role, f] as const),
    );

  /** The design's latest CUSTOMER_PREVIEW, for cards; null before the first submission. */
  async function previewUrl(row: DesignRow): Promise<string | null> {
    const preview = bundleOf(row.id).get("CUSTOMER_PREVIEW");
    return preview ? ctx.link(fileBlobKey(preview), preview.sha256, preview.url) : null;
  }

  return {
    /** The design as the API answers it, with its `previewUrl`. */
    async toDto(row: DesignRow): Promise<DesignDto> {
      return toDesignDto(
        row,
        await previewUrl(row),
        ctx.state().projects.find((project) => project.id === row.projectId),
      );
    },

    /** GET /designs/{id}/assets — newest first. */
    async listAssets(id: string): Promise<MockResult> {
      if (!ctx.find(id)) return notFound();
      return ok(assetsOf(ctx, id).reverse().map(toAssetDto));
    },

    /** POST /designs/{id}/assets (multipart `file`, `Idempotency-Key`). */
    async uploadAsset(id: string, file: Blob, name?: string, key?: string): Promise<MockResult> {
      const row = ctx.find(id);
      if (!row) return notFound();
      if (row.status !== "DRAFT") return invalidState();
      const read = await readImageUpload(ctx, file, rulesOf(ctx, row));
      if ("refused" in read) return read.refused;
      const { contentType, checksum, widthPx, heightPx } = read;

      const uploadKey = key?.trim() || null;
      const earlier = uploadKey
        ? assetsOf(ctx, id).find((a) => a.uploadKey === uploadKey)
        : undefined;
      if (earlier) {
        return earlier.checksum === checksum ? ok(toAssetDto(earlier), 201) : keyReused();
      }
      const asset: AssetRow = {
        designId: id,
        assetId: ctx.newId(),
        originalName: name ?? nameOf(file, "upload"),
        contentType,
        widthPx,
        heightPx,
        sizeBytes: file.size,
        checksum,
        storedAt: ctx.stamp(),
        uploadKey,
      };
      // The bytes, then the row that lists them; should the row not be saved, the bytes go again.
      await withBlobs(ctx, async (put) => {
        await put(assetKey(asset.assetId), file);
        ctx.state().assets.push(asset);
        await ctx.persist();
      });
      return ok(toAssetDto(asset), 201);
    },

    /** GET /designs/{id}/assets/{assetId}/url — `{ url, expiresAt }`. */
    async assetLink(id: string, assetId: string): Promise<MockResult> {
      if (!ctx.find(id)) return notFound();
      const asset = assetsOf(ctx, id).find((a) => a.assetId === assetId);
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
        const url = file ? await ctx.link(fileBlobKey(file), file.sha256, file.url) : null;
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
  };
}

export type DesignFiles = ReturnType<typeof createDesignFiles>;
