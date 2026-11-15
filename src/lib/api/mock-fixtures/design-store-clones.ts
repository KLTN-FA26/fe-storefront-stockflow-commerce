/**
 * "Clone to another size" in the design mock (spec 2026-11-12 §4, §7): a new DRAFT for another
 * variant of the same product, with the document the browser re-fitted (`retargetDocument`) and a
 * copy of every image that document uses. It runs as an operation of `design-store.ts`, over the
 * shared `StoreContext`.
 */

import { type DesignDocument } from "@/features/product-design/engine/document/schema";
import { documentChecksum } from "@/features/product-design/engine/export/checksum";

import { isUsable } from "./design-print-configs";
import {
  DRAFT_LIMIT,
  NAME_MAX,
  asRecord,
  assetKey,
  draftLimit,
  fail,
  invalid,
  notFound,
  ok,
  type AssetRow,
  type MockResult,
} from "./design-rows";
import type { StoreContext } from "./design-store-context";
import { documentProblem, documentTooLarge } from "./design-store-documents";
import { newDraft } from "./design-store-designs";
import { withBlobs, type DesignFiles } from "./design-store-files";
import { joinProject, joinRefusal } from "./design-store-projects";

/** 422: the variant is not another variant of the same product that takes designs. */
const notEligible = () =>
  fail(422, "VARIANT_NOT_ELIGIBLE", "That variant cannot take a copy of this design");

/** The ids of the images a document uses, once each, in the order they appear. */
function imageIdsOf(document: DesignDocument): string[] {
  const ids = new Set<string>();
  for (const surface of Object.values(document.surfaces)) {
    for (const element of surface?.elements ?? []) {
      if (element.type === "image") ids.add(element.assetId);
    }
  }
  return [...ids];
}

/** The same document with each image pointing at `copies[assetId]`. */
function remapImages(document: DesignDocument, copies: ReadonlyMap<string, string>) {
  const next = structuredClone(document);
  for (const surface of Object.values(next.surfaces)) {
    for (const element of surface?.elements ?? []) {
      if (element.type === "image") element.assetId = copies.get(element.assetId)!;
    }
  }
  return next;
}

export function createCloneOps(ctx: StoreContext, files: DesignFiles) {
  return {
    /**
     * POST /designs/{id}/clones `{ variantSku, document }` → 201 `{ design, notInProject }`.
     * `notInProject` is why the copy did not join the source's project (ASSUMPTION A-E3): `PROJECT_ARCHIVED`
     * or `PROJECT_FULL`; null when it joined, or the source had none.
     */
    async clone(id: string, body: unknown, key?: string): Promise<MockResult> {
      const source = ctx.find(id);
      if (!source) return notFound();
      const { variantSku, document } = asRecord(body);
      if (typeof variantSku !== "string" || !variantSku.trim()) {
        return invalid("variantSku", "variantSku must not be blank");
      }
      const sku = variantSku.trim();

      // The same key on the same source answers the copy it made, so a retry after a lost answer
      // makes no second one (R-E7). The key of another variant is a mistake.
      const idempotencyKey = key?.trim() || null;
      const earlier = idempotencyKey
        ? ctx
            .state()
            .designs.find((d) => d.clone?.key === idempotencyKey && d.clone.sourceId === source.id)
        : undefined;
      if (earlier) {
        return earlier.variant.sku === sku
          ? ok(
              { design: await files.toDto(earlier), notInProject: earlier.clone!.notInProject },
              201,
            )
          : fail(422, "IDEMPOTENCY_KEY_REUSED", "This key was already used for another variant");
      }

      // BR-01, BR-02: another variant of the same product, active, with a print configuration.
      const config = sku === source.variant.sku ? null : ctx.configFor(source.product.slug, sku);
      if (!config || config.product.slug !== source.product.slug || !isUsable(config)) {
        return notEligible();
      }
      const problem = documentProblem(document, config);
      if (problem) return invalid("document", problem);
      const tooLarge = documentTooLarge(document);
      if (tooLarge) return tooLarge;
      if (ctx.drafts() >= DRAFT_LIMIT) return draftLimit();

      const state = ctx.state();
      const sent = document as DesignDocument;
      const wanted = imageIdsOf(sent);
      const originals = new Map<string, AssetRow>();
      for (const assetId of wanted) {
        const found = state.assets.find((a) => a.designId === source.id && a.assetId === assetId);
        if (!found) return invalid("document", `Image ${assetId} is not an image of this design`);
        originals.set(assetId, found);
      }
      const bytes = new Map<string, Blob>();
      for (const [assetId, asset] of originals) {
        if (asset.url) continue;
        const blob = await ctx.storage.getBlob(assetKey(assetId));
        if (!blob) return invalid("document", `Image ${assetId} is no longer stored`);
        bytes.set(assetId, blob);
      }

      const at = ctx.stamp();
      const row = newDraft(
        ctx,
        { product: source.product, variant: { sku: config.sku, label: config.sku } },
        `${source.name} · ${config.sku}`.slice(0, NAME_MAX),
        null,
        at,
      );
      const copies = new Map<string, string>();
      const copiedRows: AssetRow[] = [];
      for (const [assetId, asset] of originals) {
        const copy: AssetRow = { ...asset, designId: row.id, assetId: ctx.newId(), storedAt: at };
        copy.uploadKey = null;
        copies.set(assetId, copy.assetId);
        copiedRows.push(copy);
      }
      const saved = remapImages(sent, copies);
      state.documents[row.id] = {
        designId: row.id,
        document: saved,
        checksum: await documentChecksum(saved),
        updatedAt: at,
      };
      ctx.record(row, "CREATED", null, 0, at);

      // ASSUMPTION (A-E3): the copy stays in the source's project while that is ACTIVE and has room.
      const home = source.projectId === null ? undefined : ctx.findProject(source.projectId);
      let notInProject: string | null = null;
      if (home) {
        const refused = joinRefusal(ctx, home);
        if (refused) notInProject = (refused.data as { errorCode: string }).errorCode;
        else joinProject(ctx, row, home);
      }

      if (idempotencyKey) row.clone = { key: idempotencyKey, sourceId: source.id, notInProject };
      await withBlobs(ctx, async (put) => {
        for (const [assetId, blob] of bytes) await put(assetKey(copies.get(assetId)!), blob);
        state.assets.push(...copiedRows);
        await ctx.persist();
      });
      return ok({ design: await files.toDto(row), notInProject }, 201);
    },
  };
}
