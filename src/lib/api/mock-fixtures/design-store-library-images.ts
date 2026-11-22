/**
 * The image side of the project library in the design mock (docs 12 §4.9.29, BR-18): an image
 * enters the library by upload or as a copy of a design's image, and goes from it into a design as
 * a copy of its own. See `design-store-library.ts` for the rules of the whole library.
 */

import {
  BYTES_PER_MB,
  asRecord,
  assetKey,
  fail,
  invalid,
  invalidState,
  libraryItemNotFound,
  libraryKey,
  notFound,
  ok,
  projectArchived,
  projectNotFound,
  toAssetDto,
  type AssetRow,
  type LibraryImageRow,
  type MockResult,
} from "./design-rows";
import type { StoreContext } from "./design-store-context";
import {
  assetsOf,
  keyReused,
  nameOf,
  readImageUpload,
  rulesOf,
  withBlobs,
} from "./design-store-files";
import {
  defaultRuleRefusal,
  LIBRARY_FILE_RULES,
  libraryFull,
  notInProject,
  type LibraryHelpers,
} from "./design-store-library-shared";

export function createLibraryImageOps(
  ctx: StoreContext,
  { itemsOf, isFull, toDto, addImage }: LibraryHelpers,
) {
  return {
    /** POST /design-projects/{id}/library/images (multipart `file`, `Idempotency-Key`). */
    async uploadImage(id: string, file: Blob, name?: string, key?: string): Promise<MockResult> {
      const project = ctx.findProject(id);
      if (!project) return projectNotFound();
      if (project.status !== "ACTIVE") return projectArchived(422);
      const read = await readImageUpload(ctx, file, LIBRARY_FILE_RULES);
      if ("refused" in read) return read.refused;
      const { contentType, checksum, widthPx, heightPx } = read;

      const uploadKey = key?.trim() || null;
      const earlier = uploadKey
        ? itemsOf(project)
            .filter((i): i is LibraryImageRow => i.kind === "IMAGE")
            .find((i) => i.uploadKey === uploadKey)
        : undefined;
      if (earlier) {
        return earlier.checksum === checksum ? ok(await toDto(earlier), 201) : keyReused();
      }
      if (isFull(project, "IMAGE")) return libraryFull("IMAGE");
      return addImage(
        project,
        {
          originalName: name ?? nameOf(file, "upload"),
          contentType,
          widthPx,
          heightPx,
          sizeBytes: file.size,
          checksum,
          storedAt: ctx.stamp(),
          uploadKey,
        },
        file,
      );
    },

    /**
     * POST /design-projects/{id}/library/images/from-design `{ designId, assetId }` — a copy of
     * one of the design's images; the design keeps its own.
     */
    async saveImageFromDesign(id: string, body: unknown): Promise<MockResult> {
      const project = ctx.findProject(id);
      if (!project) return projectNotFound();
      if (project.status !== "ACTIVE") return projectArchived(422);
      const { designId, assetId } = asRecord(body);
      if (typeof designId !== "string" || !designId.trim()) {
        return invalid("designId", "designId must not be blank");
      }
      if (typeof assetId !== "string" || !assetId.trim()) {
        return invalid("assetId", "assetId must not be blank");
      }
      const source = ctx.find(designId);
      if (!source) return notFound();
      if (source.projectId !== project.id) return notInProject();
      const asset = assetsOf(ctx, designId).find((a) => a.assetId === assetId);
      if (!asset) return notFound();
      const refused = defaultRuleRefusal(asset.contentType, asset.sizeBytes);
      if (refused) return refused;
      const bytes = asset.url ? null : await ctx.storage.getBlob(assetKey(asset.assetId));
      if (!asset.url && !bytes) return notFound();
      if (isFull(project, "IMAGE")) return libraryFull("IMAGE");
      return addImage(
        project,
        {
          originalName: asset.originalName,
          contentType: asset.contentType,
          widthPx: asset.widthPx,
          heightPx: asset.heightPx,
          sizeBytes: asset.sizeBytes,
          checksum: asset.checksum,
          storedAt: ctx.stamp(),
          uploadKey: null,
          ...(asset.url ? { url: asset.url } : {}),
        },
        bytes,
      );
    },

    /**
     * POST /designs/{id}/assets/from-library `{ libraryItemId }` — a copy of the library image
     * as an image of the design, checked against the rules of the design's variant (BR-18). Only
     * a DRAFT takes images, like an upload; the item's project may be closed (A-E2).
     */
    async placeInDesign(designId: string, body: unknown): Promise<MockResult> {
      const design = ctx.find(designId);
      if (!design) return notFound();
      if (design.status !== "DRAFT") return invalidState();
      const { libraryItemId } = asRecord(body);
      if (typeof libraryItemId !== "string" || !libraryItemId.trim()) {
        return invalid("libraryItemId", "libraryItemId must not be blank");
      }
      const item = ctx.state().library.find((i) => i.id === libraryItemId);
      if (!item) return libraryItemNotFound();
      if (item.kind !== "IMAGE") return invalid("libraryItemId", "libraryItemId is not an image");
      // R-E6: a design uses the library of its own project only.
      if (design.projectId !== item.projectId) return notInProject();

      const rules = rulesOf(ctx, design);
      if (!rules.formats.includes(item.contentType)) {
        return fail(422, "FILE_RULE", `Accepted formats: ${rules.formats.join(", ")}`, {
          details: { rule: "FORMAT", contentType: item.contentType, formats: [...rules.formats] },
        });
      }
      if (item.sizeBytes > rules.maxFileSizeMb * BYTES_PER_MB) {
        return fail(422, "FILE_RULE", `The file is over ${rules.maxFileSizeMb} MB`, {
          details: {
            rule: "FILE_SIZE",
            sizeBytes: item.sizeBytes,
            maxFileSizeMb: rules.maxFileSizeMb,
          },
        });
      }
      const bytes = item.url ? null : await ctx.storage.getBlob(libraryKey(item.id));
      if (!item.url && !bytes) return libraryItemNotFound();

      const asset: AssetRow = {
        designId,
        assetId: ctx.newId(),
        originalName: item.originalName,
        contentType: item.contentType,
        widthPx: item.widthPx,
        heightPx: item.heightPx,
        sizeBytes: item.sizeBytes,
        checksum: item.checksum,
        storedAt: ctx.stamp(),
        uploadKey: null,
        ...(item.url ? { url: item.url } : {}),
      };
      await withBlobs(ctx, async (put) => {
        if (bytes) await put(assetKey(asset.assetId), bytes);
        ctx.state().assets.push(asset);
        await ctx.persist();
      });
      return ok(toAssetDto(asset), 201);
    },
  };
}
