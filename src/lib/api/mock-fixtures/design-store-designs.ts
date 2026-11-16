/**
 * The customer's designs in the design mock (spec 2026-11-09 §4.1, §4.5): create, read, rename,
 * record a preflight refusal, delete, and derive a revision. A design may start in a project
 * (`design-store-projects.ts`). The document record is
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
  projectNotFound,
  toEventDto,
  versionConflict,
  type DesignRow,
  type MockResult,
} from "./design-rows";
import { joinProject, joinRefusal } from "./design-store-projects";
import type { StoreContext } from "./design-store-context";
import type { DesignFiles } from "./design-store-files";

/** A new DRAFT row (version 0, no project) in the state; the caller records its first event. */
export function newDraft(
  ctx: StoreContext,
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
    projectId: null, // joined by `joinProject` (design-store-projects.ts)
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

export function createDesignOps(ctx: StoreContext, files: DesignFiles) {
  return {
    /**
     * POST /designs `{ productSlug, sku, name, projectId? }` — a DRAFT with the template's empty
     * document, in the project when one is given (the checks of adding a design to it, BR-17).
     */
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
      let project;
      if (input.projectId !== undefined && input.projectId !== null) {
        if (typeof input.projectId !== "string" || !input.projectId.trim()) {
          return invalid("projectId", "projectId must be a project's id");
        }
        project = ctx.findProject(input.projectId);
        if (!project) return projectNotFound();
        const refused = joinRefusal(ctx, project);
        if (refused) return refused;
      }
      if (ctx.drafts() >= DRAFT_LIMIT) return draftLimit();
      const document = emptyDocument(config.template);
      const checksum = await documentChecksum(document);

      const at = ctx.stamp();
      const row = newDraft(
        ctx,
        { product: config.product, variant: { sku: config.sku, label: config.sku } },
        name.text,
        null,
        at,
      );
      ctx.state().documents[row.id] = { designId: row.id, document, checksum, updatedAt: at };
      ctx.record(row, "CREATED", null, 0, at);
      if (project) joinProject(ctx, row, project);
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
      // Version first, as the BE (`DesignWorkflow`): a stale tab meets CONFLICT.
      if (row.version !== version) return versionConflict();
      if (row.status !== "DRAFT") return invalidState();
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
      // Version first, as the BE (`DesignWorkflow`): a stale tab meets CONFLICT.
      if (row.version !== version) return versionConflict();
      if (row.status !== "DRAFT") return invalidState();
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
      // Version first, as the BE (`DesignWorkflow`): a stale tab meets CONFLICT.
      if (row.version !== version) return versionConflict();
      if (row.status !== "DRAFT") return invalidState();
      row.status = "ARCHIVED";
      ctx.advance(row, "ARCHIVED", null);
      // A member draft leaving changes its project's count: the project's list order follows.
      const home = row.projectId === null ? undefined : ctx.findProject(row.projectId);
      if (home) home.updatedAt = row.updatedAt;
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
      const row = newDraft(ctx, source, source.name, snapshotId, at);
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
      // BR-22: a revision of a design of a closed project belongs to none. ASSUMPTION (A-E3,
      // as for a clone): in an ACTIVE project it joins while there is room; of a full project it
      // belongs to none, and unlike a clone's the customer is not told (a revision opens its own
      // draft at once, where the studio header shows the project, or none).
      const home = source.projectId === null ? undefined : ctx.findProject(source.projectId);
      if (home && !joinRefusal(ctx, home)) joinProject(ctx, row, home);
      await ctx.persist();
      return ok(await files.toDto(row), 201);
    },
  };
}
