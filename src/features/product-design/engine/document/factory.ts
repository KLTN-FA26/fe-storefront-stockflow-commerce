import type { CustomizationTemplate } from "../template/schema";
import { designDocumentSchema, type DesignDocument, type SurfaceContent } from "./schema";

/** A new empty surface: no background, no elements. Never share one between surfaces. */
export function emptySurface(): SurfaceContent {
  return { background: { kind: "none" }, elements: [] };
}

/** A blank document with one empty surface per print area of the template. */
export function emptyDocument(template: CustomizationTemplate): DesignDocument {
  const surfaces: DesignDocument["surfaces"] = {};
  for (const area of template.printAreas) surfaces[area.code] = emptySurface();
  return { schemaVersion: 1, templateCode: template.code, sku: template.sku, surfaces };
}

/**
 * Parse a stored document of any known version into the current shape. v1 is current; a future
 * version adds its upgrade step here. Anything else is rejected rather than guessed at.
 */
export function migrateDocument(raw: unknown): DesignDocument {
  const version =
    typeof raw === "object" && raw !== null
      ? (raw as { schemaVersion?: unknown }).schemaVersion
      : undefined;
  if (version !== 1) throw new Error("Unsupported design document version");
  return designDocumentSchema.parse(raw);
}

/** Size as the backend sees it: UTF-8 bytes of the JSON (budget: `MAX_DOCUMENT_BYTES`). */
export function documentByteSize(doc: DesignDocument): number {
  return new TextEncoder().encode(JSON.stringify(doc)).length;
}
