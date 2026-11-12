/**
 * The customer's designs in the design mock (spec 2026-11-09 §4.1, §4.5): create, read, rename,
 * record a preflight refusal, delete, and derive a revision. The document record is
 * `design-store-documents.ts`. Each runs as an operation of `design-store.ts`, over the shared
 * `StoreContext`.
 */

import { emptyDocument } from "@/features/product-design/engine/document/factory";
import { documentChecksum } from "@/features/product-design/engine/export/checksum";

import { isUsable } from "./design-print-configs";
import {
  DRAFT_LIMIT,
  NAME_MAX,
  asRecord,
  boundedText,
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
  type DesignRow,
  type MockResult,
} from "./design-rows";
import type { StoreContext } from "./design-store-context";
import type { DesignFiles } from "./design-store-files";

export function createDesignOps(ctx: StoreContext, files: DesignFiles) {
  function newDraft(
    from: Pick<DesignRow, "product" | "variant">,
    name: string,
    sourceSnapshotId: string | null,
    at: string,
  ): DesignRow {
    const state = ctx.state();
    state.seq.design += 1;
    const row: DesignRow = {
      id: ctx.newId(),
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

  return {
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
      const config = ctx.configFor(productSlug, sku);
      if (!config) {
        return fail(422, "PRINT_CONFIG_MISSING", "This variant has no print configuration");
      }
      if (!isUsable(config)) {
        return fail(422, "VARIANT_UNAVAILABLE", "This variant no longer takes designs");
      }
      if (ctx.drafts() >= DRAFT_LIMIT) return draftLimit();
      const document = emptyDocument(config.template);
      const checksum = await documentChecksum(document);

      const at = ctx.stamp();
      const row = newDraft(
        { product: config.product, variant: { sku: config.sku, label: config.sku } },
        name.text,
        null,
        at,
      );
      ctx.state().documents[row.id] = { designId: row.id, document, checksum, updatedAt: at };
      ctx.record(row, "CREATED", null, 0, at);
      await ctx.persist();
      return ok(await files.toDto(row), 201);
    },

    /** GET /designs/{id} */
    async get(id: string): Promise<MockResult> {
      const row = ctx.find(id);
      return row ? ok(await files.toDto(row)) : notFound();
    },

    /** PATCH /designs/{id} `{ name, version }` */
    async rename(id: string, body: unknown): Promise<MockResult> {
      const row = ctx.find(id);
      if (!row) return notFound();
      const { name: rawName, version } = asRecord(body);
      const name = boundedText("name", rawName, NAME_MAX);
      if ("refused" in name) return name.refused;
      if (!isVersion(version)) return invalid("version", "version must be a whole number ≥ 0");
      if (row.status !== "DRAFT") return invalidState();
      if (row.version !== version) return versionConflict();
      row.name = name.text;
      ctx.touch(row);
      await ctx.persist();
      return ok(await files.toDto(row));
    },

    /** GET /designs/{id}/history — oldest first. */
    async history(id: string): Promise<MockResult> {
      if (!ctx.find(id)) return notFound();
      return ok(
        ctx
          .state()
          .history.filter((event) => event.designId === id)
          .map(toEventDto),
      );
    },

    /**
     * POST /designs/{id}/preflight-failures `{ version, issues }` — the browser's preflight refused
     * a submit (docs 12 §5.3): on the record, nothing else changes. A write like any other: a stale
     * version is 409 VERSION_CONFLICT (spec §4).
     */
    async recordPreflightFailure(id: string, body: unknown): Promise<MockResult> {
      const row = ctx.find(id);
      if (!row) return notFound();
      const { version, issues } = asRecord(body);
      if (!isVersion(version)) return invalid("version", "version must be a whole number ≥ 0");
      if (!Array.isArray(issues) || !issues.length || !issues.every(isIssue)) {
        return invalid("issues", "issues must list what failed");
      }
      if (row.status !== "DRAFT") return invalidState();
      if (row.version !== version) return versionConflict();
      const event = ctx.record(row, "PREFLIGHT_FAILED", issuesNote(issues), version);
      await ctx.persist();
      return ok(toEventDto(event), 201);
    },

    /** DELETE /designs/{id} `{ version }` — DRAFT → ARCHIVED, never restored (docs 12 BR-16). */
    async remove(id: string, body: unknown): Promise<MockResult> {
      const row = ctx.find(id);
      if (!row) return notFound();
      const { version } = asRecord(body);
      if (!isVersion(version)) return invalid("version", "version must be a whole number ≥ 0");
      if (row.status !== "DRAFT") return invalidState();
      if (row.version !== version) return versionConflict();
      row.status = "ARCHIVED";
      ctx.advance(row, "ARCHIVED", null);
      await ctx.persist();
      return ok(await files.toDto(row));
    },

    /**
     * POST /designs/{id}/revisions — a new DRAFT from an APPROVED design's snapshot (docs 12 §4.7,
     * BR-12). Its images come along under the same ids, so the copied document's image elements
     * resolve in the new design; the submitted files do not (a revision is submitted anew).
     */
    async revise(id: string): Promise<MockResult> {
      const source = ctx.find(id);
      if (!source) return notFound();
      if (source.status !== "APPROVED" || !source.approval) return invalidState();
      if (ctx.drafts() >= DRAFT_LIMIT) return draftLimit();

      const state = ctx.state();
      const at = ctx.stamp();
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
      ctx.record(row, "DERIVED_FROM_SNAPSHOT", snapshotId, 0, at);
      await ctx.persist();
      return ok(await files.toDto(row), 201);
    },
  };
}
