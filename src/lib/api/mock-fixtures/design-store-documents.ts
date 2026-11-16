/**
 * The design document record of the design mock (spec 2026-11-09 §4.5 "Document record"): read it,
 * and save it as sent once the engine's schema and the template's print areas accept it. Each runs
 * as an operation of `design-store.ts`, over the shared `StoreContext`.
 */

import {
  MAX_DOCUMENT_BYTES,
  designDocumentSchema,
  type DesignDocument,
} from "@/features/product-design/engine/document/schema";
import { documentChecksum } from "@/features/product-design/engine/export/checksum";

import type { PrintConfigRow } from "./design-print-configs";
import {
  asRecord,
  fail,
  invalid,
  invalidState,
  isVersion,
  notFound,
  ok,
  versionConflict,
  type DesignDocumentRecordDto,
  type DesignRow,
  type MockResult,
} from "./design-rows";
import type { StoreContext } from "./design-store-context";

/** 413 when the document, as sent, is over the size the API takes; else null. */
export function documentTooLarge(document: unknown): MockResult | null {
  return new TextEncoder().encode(JSON.stringify(document)).length > MAX_DOCUMENT_BYTES
    ? fail(413, "PAYLOAD_TOO_LARGE", "The design document is too large")
    : null;
}

/** Why a document cannot be this design's (spec §4.1: the engine's schema, the template's areas). */
export function documentProblem(document: unknown, config: PrintConfigRow | null): string | null {
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

export function createDocumentOps(ctx: StoreContext) {
  function documentRecord(row: DesignRow): DesignDocumentRecordDto {
    const { document, checksum, updatedAt } = ctx.state().documents[row.id]!;
    return {
      designId: row.id,
      version: row.version,
      document: structuredClone(document),
      checksum,
      updatedAt,
    };
  }

  return {
    /** GET /designs/{id}/document — `{ designId, version, document, checksum, updatedAt }`. */
    async getDocument(id: string): Promise<MockResult> {
      const row = ctx.find(id);
      return row ? ok(documentRecord(row)) : notFound();
    },

    /** PUT /designs/{id}/document `{ version, document }` — a save: version + 1. */
    async putDocument(id: string, body: unknown): Promise<MockResult> {
      const row = ctx.find(id);
      if (!row) return notFound();
      const { version, document } = asRecord(body);
      if (!isVersion(version)) return invalid("version", "version must be a whole number ≥ 0");
      // Version first, as the BE (`DesignWorkflow`): a stale tab meets CONFLICT.
      if (row.version !== version) return versionConflict();
      if (row.status !== "DRAFT") return invalidState();
      const problem = documentProblem(document, ctx.configOf(row));
      if (problem) return invalid("document", problem);
      const tooLarge = documentTooLarge(document);
      if (tooLarge) return tooLarge;
      // Kept as sent (the schema only checked it), so its checksum is the browser's.
      const saved = structuredClone(document) as DesignDocument;
      const checksum = await documentChecksum(saved);
      ctx.touch(row);
      ctx.state().documents[id] = {
        designId: id,
        document: saved,
        checksum,
        updatedAt: row.updatedAt,
      };
      await ctx.persist();
      return ok(documentRecord(row));
    },
  };
}
