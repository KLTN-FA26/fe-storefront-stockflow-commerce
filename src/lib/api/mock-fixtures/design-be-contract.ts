/**
 * The design mock's answers in the BE's own contract (`origin/develop` 85e6036a,
 * `design/internal/controller/`): the store keeps its rows in the shape the front end first defined
 * (`design-rows.ts`), and the routes of `mock-design.ts` run each answer through here on its way
 * out, for the endpoints already moved to the BE contract (SF1: designs and their lifecycle):
 *
 *  - the `{success, data}` envelope as is, but every null field omitted (`non_null` inclusion);
 *  - a design as `DesignDraftResponse` (`productSlug`, `productName`, `sku`, `variantName`,
 *    `reviewRequestedAt`, `reviewedAt`, `reviewNotes`, `parentSnapshotId`, `projectId`, ...), no
 *    `createdAt`, no embedded project;
 *  - the history as a page of `DesignDecisionResponse`, newest first;
 *  - the BE's error codes and statuses (`CONFLICT`, `DESIGN_NOT_DRAFT`, `DESIGN_DRAFT_LIMIT_REACHED`,
 *    `PRINT_CONFIG_NOT_FOUND`, `PRODUCT_NOT_CUSTOMIZABLE`, `VALIDATION_FAILED` is 400, ...).
 *
 * A task that moves another endpoint to the BE contract adds its mapper here and registers the BE path
 * in `mock-design.ts`; the old path may stay until nothing calls it.
 */

import { seedMockCatalog } from "./catalog";
import { isUsable, type PrintConfigRow } from "./design-print-configs";
import {
  asRecord,
  fail,
  ok,
  stableGuid,
  type DesignDto,
  type DesignEventDto,
  type MockResult,
} from "./design-rows";
import { readPaging } from "./design-store-paging";

/** Every null (and undefined) dropped, at any depth: the BE leaves a null out of its JSON. */
export function omitNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(omitNulls);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([k, v]) => [k, omitNulls(v)]),
  );
}

/**
 * What the store's error code is in the BE: its code and status. `bare` drops the `details` and
 * `fieldErrors`: some BE refusals (415, 413, 429) carry only a `message`. A function picks the code
 * from the store's answer when one old code is several in the BE.
 */
type BeCodeFixed = { status: number; code: string; bare?: boolean };
type BeCode = BeCodeFixed | ((body: Record<string, unknown>) => BeCodeFixed);

/** The store's old error words → the BE's (F-2), for every route moved to the BE contract. */
const BE_CODES: Record<string, BeCode> = {
  VERSION_CONFLICT: { status: 409, code: "CONFLICT" },
  INVALID_STATE: { status: 409, code: "DESIGN_NOT_DRAFT" },
  DRAFT_LIMIT: { status: 409, code: "DESIGN_DRAFT_LIMIT_REACHED" },
  PRINT_CONFIG_MISSING: { status: 404, code: "PRINT_CONFIG_NOT_FOUND" },
  VARIANT_UNAVAILABLE: { status: 409, code: "PRODUCT_NOT_CUSTOMIZABLE" },
  PROJECT_FULL: { status: 409, code: "DESIGN_PROJECT_FULL" },
  PROJECT_ARCHIVED: { status: 409, code: "DESIGN_PROJECT_ARCHIVED" },
  VALIDATION_FAILED: { status: 400, code: "VALIDATION_FAILED" },
  // Projects, their library and clones (rows 9, 21-36).
  PROJECT_HAS_PENDING: { status: 409, code: "DESIGN_PROJECT_HAS_PENDING" },
  DESIGN_IN_OTHER_PROJECT: { status: 409, code: "DESIGN_IN_ANOTHER_PROJECT" },
  DESIGN_PENDING: { status: 409, code: "DESIGN_PENDING_IN_PROJECT" },
  DESIGN_ARCHIVED: { status: 404, code: "NOT_FOUND", bare: true },
  LIBRARY_FULL: { status: 409, code: "DESIGN_PROJECT_LIBRARY_FULL" },
  VARIANT_NOT_ELIGIBLE: { status: 409, code: "DESIGN_CLONE_TARGET_INVALID" },
  // An image the template refuses: 415 for the format, 413 for the size, a `message` only. The
  // store words the reason in English, and its `FILE_RULE` names it in `details.rule`.
  FILE_REJECTED: (body) =>
    String(body.message).includes("over")
      ? { status: 413, code: "PAYLOAD_TOO_LARGE", bare: true }
      : { status: 415, code: "UNSUPPORTED_MEDIA_TYPE", bare: true },
  FILE_RULE: (body) =>
    asRecord(body.details).rule === "FILE_SIZE"
      ? { status: 413, code: "PAYLOAD_TOO_LARGE", bare: true }
      : { status: 415, code: "UNSUPPORTED_MEDIA_TYPE", bare: true },
  // A set of fewer than two designs is a validation error in the BE, a design outside the
  // project is not found (`DesignBatchSubmissionService`, `requireInProject`).
  SET_TOO_SMALL: { status: 400, code: "VALIDATION_FAILED" },
  DESIGN_NOT_IN_PROJECT: { status: 404, code: "NOT_FOUND", bare: true },
  // A library file that is not of the design's project is not found.
  NOT_IN_PROJECT: { status: 404, code: "NOT_FOUND", bare: true },
};

type Via = {
  /** The BE's status for a success (200 unless it says 201). */
  status?: number;
  /** Nulls are omitted at the top level only: a stored layout holds its own, which are not the BE's to drop. */
  shallow?: boolean;
  /** An old code the BE words differently on this route (e.g. a revision of a non-approved design is `CONFLICT`). */
  codes?: Record<string, BeCode>;
};

/** A store answer as the BE sends it: the data mapped and stripped of nulls, or the error in BE words. */
export function viaBe(
  result: MockResult,
  map: (data: unknown) => unknown,
  via: Via = {},
): MockResult {
  const body = asRecord(result.data);
  if (body.success === true) {
    return {
      status: via.status ?? result.status,
      data: {
        ...body,
        data: via.shallow ? omitTopNulls(map(body.data)) : omitNulls(map(body.data)),
      },
    };
  }
  const code = typeof body.errorCode === "string" ? body.errorCode : "";
  const rule = via.codes?.[code] ?? BE_CODES[code];
  if (!rule) return result;
  const { status, code: errorCode, bare } = typeof rule === "function" ? rule(body) : rule;
  const { details: _details, fieldErrors: _fieldErrors, ...rest } = body;
  return { status, data: { ...(bare ? rest : body), errorCode } };
}

/** The fields of an object with a null dropped, one level deep. */
function omitTopNulls(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== null && v !== undefined));
}

/** `DesignDraftResponse` of a design the store answered with. */
export function beDraft(dto: DesignDto, templateCode: string | undefined): Record<string, unknown> {
  const returned = dto.status === "APPROVED" ? null : dto.lastReturn;
  return {
    id: dto.id,
    name: dto.name,
    status: dto.status,
    version: dto.version,
    productSlug: dto.product.slug,
    productName: dto.product.title,
    sku: dto.variant.sku,
    variantName: dto.variant.label,
    templateCode,
    previewUrl: dto.previewUrl,
    projectId: dto.projectId,
    // BE-2: the customer's SKU is sent on an approved design only.
    customerSku: dto.status === "APPROVED" ? dto.approval?.skuCode : undefined,
    parentSnapshotId: dto.sourceSnapshotId,
    reviewRequestedAt: dto.submittedAt,
    reviewedAt: dto.status === "APPROVED" ? dto.approvedAt : returned?.returnedAt,
    reviewNotes: returned?.reason,
    updatedAt: dto.updatedAt,
  };
}

/** `GET /designs/{id}/history` of the store's events (oldest first): the page `query` asks, newest first. */
export function beHistoryPage(events: readonly DesignEventDto[], query: unknown): MockResult {
  const paging = readPaging(asRecord(query));
  if ("refused" in paging) return paging.refused;
  const rows = events.toReversed().map((event) => ({
    decision: event.type,
    notes: event.note,
    version: event.version,
    at: event.at,
  }));
  const { page, size } = paging;
  const totalPages = Math.ceil(rows.length / size);
  return ok(
    omitNulls({
      items: rows.slice(page * size, (page + 1) * size),
      page,
      size,
      totalElements: rows.length,
      totalPages,
      hasNext: page + 1 < totalPages,
      hasPrevious: page > 0,
    }),
  );
}

/**
 * `GET /designs/{id}/snapshot` of an approved design (BE: `id`, `checksum`, `customerSku`, the
 * frozen `artifacts`; 404 before approval). The design carries the store's `approval` and files.
 */
export function beSnapshot(dto: DesignDto & { artifacts?: unknown }): MockResult {
  const approval = asRecord(dto.approval);
  if (dto.status !== "APPROVED" || typeof approval.snapshotId !== "string") {
    return fail(404, "NOT_FOUND", "Snapshot not found");
  }
  const artifacts = (Array.isArray(dto.artifacts) ? dto.artifacts : []).map((artifact) => {
    const { artifactId, role, originalName, contentType, sizeBytes, checksum } = asRecord(artifact);
    return { artifactId, role, originalName, contentType, sizeBytes, checksum };
  });
  return ok(
    omitNulls({
      id: approval.snapshotId,
      draftId: dto.id,
      checksum: approval.bundleChecksum,
      customerSku: approval.skuCode,
      artifacts,
      assets: [],
    }),
  );
}

/** `DesignDecisionResponse` of a history event the store answered with (a recorded preflight failure). */
export const beDecision = (event: DesignEventDto) => ({
  decision: event.type,
  notes: event.note,
  version: event.version,
  at: event.at,
});

/** One template as the BE's reads send it: nulls left out, its `.glb` beside it when it has one. */
const templateShape = (config: PrintConfigRow) => ({
  ...config.template,
  // The BE's template holds its own file rules: the fixture's `fileRules` are the same numbers.
  minDpi: config.fileRules.minDpi,
  allowedFileFormats: config.fileRules.formats,
  maxFileSizeMb: config.fileRules.maxFileSizeMb,
  ...(config.model3d ? { model3d: config.model3d } : {}),
});

/** A product id for a slug the mock catalogue does not know: stable and GUID-shaped. */
const mockProductId = (slug: string) => stableGuid(`product:${slug}`);

/** The slugs of the products this page's customization reads named, by the id given: for `POST /designs/mine`. */
const unknownProducts = new Map<string, string>();

/**
 * `GET /catalog/products/{slug}/customization` (`CatalogCustomizationResponse`): the product's id
 * and the template of each ACTIVE, usable variant it has, each with `hasCartonSpec` and its `.glb`
 * when it has one. Unknown product 404 `NOT_FOUND`, a STANDARD one 409 `PRODUCT_NOT_CUSTOMIZABLE`.
 * ASSUMPTION (mock only): a product the mock catalogue does not know (the real catalogue's, under
 * DESIGN_USE_MOCK) gets the default cup or bag configuration for the variant the `sku` hint names,
 * as the print-config read it replaces did; without a hint it lists no template.
 */
export function customizationOf(
  slug: string,
  configFor: (slug: string, sku: string) => PrintConfigRow | null,
  skuHint?: string,
): MockResult {
  const product = seedMockCatalog().find((candidate) => candidate.slug === slug);
  const listed = (config: PrintConfigRow | null) =>
    config !== null && isUsable(config)
      ? [{ ...templateShape(config), hasCartonSpec: config.hasCartonSpec }]
      : [];
  if (!product) {
    const productId = mockProductId(slug);
    unknownProducts.set(productId, slug);
    const config = skuHint ? configFor(slug, skuHint) : null;
    return ok(omitNulls({ productId, kind: "CUSTOMIZABLE", templates: listed(config) }));
  }
  if (product.kind !== "CUSTOMIZABLE") {
    return fail(409, "PRODUCT_NOT_CUSTOMIZABLE", "This product cannot be customized");
  }
  // A hinted variant the fixtures know but the catalogue does not list is served too (mock only).
  const skus = new Set(product.variants.map((variant) => variant.sku));
  if (skuHint) skus.add(skuHint);
  const templates = [...skus].flatMap((sku) => listed(configFor(slug, sku)));
  return ok(omitNulls({ productId: product.productId, kind: product.kind, templates }));
}

/**
 * `GET /designs/{id}/template`: the template a design is drawn on, in the shape of one customization
 * template plus `active`, and BE-11's `designable` (the variant still takes designs: false for
 * `MOCK_BLOCKED_SKU`, so the studio shows `VARIANT_UNAVAILABLE`) and `hasCartonSpec`. The mock keeps no frozen copy: an approved design
 * reads the template it was made on, which the fixtures never change.
 */
export const designTemplateOf = (config: PrintConfigRow | null): MockResult =>
  config
    ? ok(
        omitNulls({
          ...templateShape(config),
          active: true,
          designable: config.variantStatus === "ACTIVE",
          hasCartonSpec: config.hasCartonSpec,
        }),
      )
    : fail(404, "PRINT_CONFIG_NOT_FOUND", "Customization template not found");

/** The product a BE `productId` names: the mock catalogue's, or one a customization read named. */
export function productOfId(productId: unknown): { slug: string } | undefined {
  const known = seedMockCatalog().find((product) => product.productId === productId);
  if (known) return known;
  const slug = typeof productId === "string" ? unknownProducts.get(productId) : undefined;
  return slug === undefined ? undefined : { slug };
}
