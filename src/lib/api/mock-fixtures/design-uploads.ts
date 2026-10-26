/**
 * Customer images (spec §7.2 P4) and design artifacts of the mock backend: the declared type and size
 * limits, idempotent replay, storage and download links. Both are stored on the design's row; `find`
 * is the store's visibility rule (a design the caller may not see is 404).
 *
 *  - images: png/jpeg/webp up to 20 MB, kept apart from the draft (no new version, no review reset);
 *  - artifacts (BE `DesignArtifactService`): png/jpeg/webp/pdf up to 50 MB; a new one becomes the
 *    current artifact of its role (the preview, for CUSTOMER_PREVIEW) and voids the technical review;
 *  - an `Idempotency-Key` replays the first answer for the same file; the same key with another file
 *    is IDEMPOTENCY_KEY_REUSED (422, as the BE's ErrorCode and `orders.ts`).
 */

import {
  conflict,
  fail,
  notFound,
  ok,
  sha256Hex,
  touch,
  voidReview,
  type ArtifactRow,
  type AssetRow,
  type DraftRow,
  type MockArtifactRole,
  type MockResult,
  type StoredFile,
} from "./design-model";

const MAX_ASSET_BYTES = 20 * 1024 * 1024;
const MAX_ARTIFACT_BYTES = 50 * 1024 * 1024; // BE FileCategory.DESIGN_RENDER
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const ASSET_RULES = { maxBytes: MAX_ASSET_BYTES, types: IMAGE_TYPES };
const ARTIFACT_RULES = { maxBytes: MAX_ARTIFACT_BYTES, types: [...IMAGE_TYPES, "application/pdf"] };
const ARTIFACT_ROLES: readonly MockArtifactRole[] = [
  "CUSTOMER_PREVIEW",
  "TECHNICAL_SPEC",
  "PRINT_READY",
  "PRODUCTION_INSTRUCTION",
];
const LINK_TTL_MS = 5 * 60_000;
const KEY_REUSED_STATUS = 422;

const mimeOf = (file: Blob) => (file.type.split(";")[0] ?? "").trim().toLowerCase();
const fileName = (file: Blob, name?: string) =>
  name ?? ("name" in file && typeof file.name === "string" ? file.name : "upload");

/** BufferedUpload: the declared type and the size are refused before anything else is looked at. */
function refuseUpload(file: Blob, rules: { maxBytes: number; types: string[] }) {
  if (!rules.types.includes(mimeOf(file))) {
    return fail(415, "UNSUPPORTED_MEDIA_TYPE", "This file type is not accepted");
  }
  if (file.size > rules.maxBytes) {
    return fail(413, "PAYLOAD_TOO_LARGE", "The uploaded file is too large");
  }
  return undefined;
}

/** The BE's replay rule: the same file under the same key is the same request. */
const sameUpload = (
  earlier: StoredFile,
  sent: Pick<StoredFile, "checksum" | "originalName" | "contentType">,
) =>
  earlier.checksum === sent.checksum &&
  earlier.originalName === sent.originalName &&
  earlier.contentType === sent.contentType;

const isArtifactRole = (value: string): value is MockArtifactRole =>
  ARTIFACT_ROLES.some((artifactRole) => artifactRole === value);

const keyProblem = (key: string | undefined) =>
  key !== undefined && !key.trim()
    ? fail(400, "VALIDATION_FAILED", "Idempotency-Key must not be blank when present")
    : undefined;

async function browserImageSize(blob: Blob) {
  const bitmap = await createImageBitmap(blob);
  try {
    return { width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}

/* ── Serialisation ────────────────────────────────────────────────────── */

const toArtifact = (row: DraftRow, a: ArtifactRow) => ({
  artifactId: a.artifactId,
  designId: row.id,
  role: a.role,
  originalName: a.originalName,
  contentType: a.contentType,
  sizeBytes: a.sizeBytes,
  storedAt: a.storedAt,
  checksum: a.checksum,
});

const toAsset = (row: DraftRow, a: AssetRow) => ({
  assetId: a.assetId,
  designId: row.id,
  originalName: a.originalName,
  contentType: a.contentType,
  widthPx: a.widthPx,
  heightPx: a.heightPx,
  sizeBytes: a.sizeBytes,
  checksum: a.checksum,
  storedAt: a.storedAt,
});

/* ── Uploads ──────────────────────────────────────────────────────────── */

export interface UploadContext {
  userId: string;
  find: (id: string) => DraftRow | undefined;
  now: () => number;
  stamp: () => string;
  newId: () => string;
  /** Natural pixel size of an uploaded image; defaults to the browser's `createImageBitmap`. */
  readImageSize?: ((blob: Blob) => Promise<{ width: number; height: number }>) | undefined;
  /** Link for a stored file; defaults to `URL.createObjectURL`. */
  toUrl?: ((blob: Blob) => string) | undefined;
}

export function createUploads(ctx: UploadContext) {
  const { userId, find, now, stamp, newId } = ctx;
  const readImageSize = ctx.readImageSize ?? browserImageSize;
  const toUrl = ctx.toUrl ?? ((blob: Blob) => URL.createObjectURL(blob));
  const urls = new Map<string, string>();

  const linkFor = (key: string, file: StoredFile): MockResult => {
    let url = file.url;
    if (url === undefined && file.blob) {
      url = urls.get(key) ?? toUrl(file.blob);
      urls.set(key, url);
    }
    return ok({ url: url ?? "", expiresAt: new Date(now() + LINK_TTL_MS).toISOString() });
  };

  const keyReused = () =>
    fail(
      KEY_REUSED_STATUS,
      "IDEMPOTENCY_KEY_REUSED",
      "This idempotency key was already used for a different request",
    );

  return {
    /** P4 GET /designs/{id}/assets */
    listAssets(id: string): MockResult {
      const row = find(id);
      return row ? ok([...row.assets].reverse().map((a) => toAsset(row, a))) : notFound();
    },

    /** P4 POST /designs/{id}/assets (multipart `file`, `Idempotency-Key`): stores a customer image. */
    async uploadAsset(id: string, file: Blob, key?: string, name?: string): Promise<MockResult> {
      const row = find(id);
      if (!row) return notFound();
      const refused = refuseUpload(file, ASSET_RULES) ?? keyProblem(key);
      if (refused) return refused;

      const [checksum, size] = await Promise.all([
        sha256Hex(new Uint8Array(await file.arrayBuffer())),
        readImageSize(file).catch(() => undefined),
      ]);
      if (!size) return fail(415, "UNSUPPORTED_MEDIA_TYPE", "The file is not a readable image");
      const sent = { checksum, originalName: fileName(file, name), contentType: mimeOf(file) };
      const uploadKey = key === undefined ? undefined : `${userId}:${key.trim()}`;
      const earlier = uploadKey ? row.assets.find((a) => a.uploadKey === uploadKey) : undefined;
      if (earlier) {
        return sameUpload(earlier, sent) ? ok(toAsset(row, earlier), 201) : keyReused();
      }
      if (row.status !== "DRAFT") return conflict("Only draft designs accept images");

      const asset: AssetRow = {
        assetId: newId(),
        ...sent,
        widthPx: size.width,
        heightPx: size.height,
        sizeBytes: file.size,
        storedAt: stamp(),
        blob: file,
        ...(uploadKey ? { uploadKey } : {}),
      };
      row.assets.push(asset);
      return ok(toAsset(row, asset), 201);
    },

    /** P4 GET /designs/{id}/assets/{assetId}/download-url */
    assetLink(id: string, assetId: string): MockResult {
      const asset = find(id)?.assets.find((a) => a.assetId === assetId);
      return asset ? linkFor(`asset:${assetId}`, asset) : notFound();
    },

    /** GET /designs/{id}/artifacts — newest first. */
    listArtifacts(id: string): MockResult {
      const row = find(id);
      return row ? ok([...row.artifacts].reverse().map((a) => toArtifact(row, a))) : notFound();
    },

    /**
     * POST /designs/{id}/artifacts?role= — a new artifact becomes the current one of its role
     * (the preview, for CUSTOMER_PREVIEW) and voids the technical review.
     */
    async uploadArtifact(
      id: string,
      artifactRole: string,
      file: Blob,
      key?: string,
      name?: string,
    ): Promise<MockResult> {
      const row = find(id);
      if (!row) return notFound();
      if (!isArtifactRole(artifactRole)) {
        return fail(400, "UNSUPPORTED_PARAMETER", "Unsupported artifact role");
      }
      const refused = refuseUpload(file, ARTIFACT_RULES) ?? keyProblem(key);
      if (refused) return refused;

      const checksum = await sha256Hex(new Uint8Array(await file.arrayBuffer()));
      const sent = { checksum, originalName: fileName(file, name), contentType: mimeOf(file) };
      const uploadKey = key === undefined ? undefined : `${userId}:${artifactRole}:${key.trim()}`;
      const earlier = uploadKey ? row.artifacts.find((a) => a.uploadKey === uploadKey) : undefined;
      if (earlier) {
        return sameUpload(earlier, sent) ? ok(toArtifact(row, earlier), 201) : keyReused();
      }
      if (row.status !== "DRAFT") return conflict("Only draft designs accept artifact changes");

      const at = stamp();
      const artifact: ArtifactRow = {
        artifactId: newId(),
        role: artifactRole,
        ...sent,
        sizeBytes: file.size,
        storedAt: at,
        blob: file,
        ...(uploadKey ? { uploadKey } : {}),
      };
      row.artifacts.push(artifact);
      row.currentArtifacts[artifactRole] = artifact.artifactId;
      if (artifactRole === "CUSTOMER_PREVIEW") row.currentArtifactId = artifact.artifactId;
      voidReview(row);
      touch(row, at);
      return ok(toArtifact(row, artifact), 201);
    },

    /** GET /designs/{id}/artifacts/{artifactId}/download-url */
    artifactLink(id: string, artifactId: string): MockResult {
      const artifact = find(id)?.artifacts.find((a) => a.artifactId === artifactId);
      return artifact ? linkFor(`artifact:${artifactId}`, artifact) : notFound();
    },
  };
}
