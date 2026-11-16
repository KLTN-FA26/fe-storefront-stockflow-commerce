import { emptyDocument } from "../engine/document/factory";
import type { DesignDocument } from "../engine/document/schema";
import { bagM, cup12oz } from "../engine/__tests__/fixtures";
import { designSchema } from "../schemas";
import type { Design } from "../types";

/** A font registry with plain family names, as a screen test hands the studio. */
export { FONTS as TEST_FONTS } from "../engine/__tests__/fixtures";

/**
 * `designDto` is a design in the DOMAIN shape the screens read (what `design()` parses), the shape
 * the not-yet-moved endpoints (projects, clones, submissions) still answer. `designDraftDto` is the
 * BE's `DesignDraftResponse`: nulls omitted, its own field names.
 */
const uuid = (n: number) => `7c1f0a00-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const ids = {
  design: uuid(1),
  revision: uuid(2),
  snapshot: uuid(3),
  asset: uuid(4),
  project: uuid(5),
};

export const designDto = (overrides: Record<string, unknown> = {}) => ({
  id: ids.design,
  name: "Ly giấy logo quán",
  status: "DRAFT",
  product: { slug: "ly-giay-2-lop-12oz", title: "Ly giấy 2 lớp 12oz" },
  variant: { sku: "CUP-PAPER-12OZ-WHT", label: "CUP-PAPER-12OZ-WHT" },
  version: 3,
  projectId: null,
  project: null,
  sourceSnapshotId: null,
  lastReturn: null,
  previewUrl: null,
  updatedAt: "2026-11-02T08:00:00Z",
  submittedAt: null,
  approvedAt: null,
  ...overrides,
});

/** A `designDto` the way the API layer hands it to the UI: parsed. */
export const design = (overrides: Record<string, unknown> = {}): Design =>
  designSchema.parse(designDto(overrides));

/** The BE's `DesignDraftResponse` of a draft with no review yet: only what the BE sends. */
export const designDraftDto = (overrides: Record<string, unknown> = {}) => ({
  id: ids.design,
  name: "Ly giấy logo quán",
  status: "DRAFT",
  version: 3,
  productSlug: "ly-giay-2-lop-12oz",
  productName: "Ly giấy 2 lớp 12oz",
  sku: "CUP-PAPER-12OZ-WHT",
  variantName: "Trắng 12oz",
  templateCode: "CUP12-BODY",
  updatedAt: "2026-11-02T08:00:00Z",
  ...overrides,
});

/** The BE's draft returned by the Sales Manager: `reviewNotes` and `reviewedAt` are set. */
export const returnedDraftDto = (overrides: Record<string, unknown> = {}) =>
  designDraftDto({
    reviewNotes: "Logo bị mờ, hãy dùng ảnh rõ hơn",
    reviewedAt: "2026-11-03T09:00:00Z",
    ...overrides,
  });

/** The BE's approved design: `reviewedAt` is the approval's time (no `reviewNotes`). */
export const approvedDraftDto = (overrides: Record<string, unknown> = {}) =>
  designDraftDto({
    status: "APPROVED",
    version: 6,
    reviewRequestedAt: "2026-11-04T08:00:00Z",
    reviewedAt: "2026-11-05T08:00:00Z",
    previewUrl: "/logo.png",
    ...overrides,
  });

/** The BE's `DesignDecisionResponse`: `notes` is left out when there are none. */
export const decisionDto = (overrides: Record<string, unknown> = {}) => ({
  decision: "CREATED",
  version: 0,
  at: "2026-11-01T08:00:00Z",
  ...overrides,
});

export const returnedDto = (overrides: Record<string, unknown> = {}) =>
  designDto({
    lastReturn: { reason: "Logo bị mờ, hãy dùng ảnh rõ hơn", returnedAt: "2026-11-03T09:00:00Z" },
    ...overrides,
  });

export const approvedDto = (overrides: Record<string, unknown> = {}) =>
  designDto({
    status: "APPROVED",
    version: 6,
    submittedAt: "2026-11-04T08:00:00Z",
    approvedAt: "2026-11-05T08:00:00Z",
    previewUrl: "/logo.png",
    ...overrides,
  });

/** A page as the BE sends it: `page` is 0-based. */
export const pageDto = <T>(items: T[], overrides: Record<string, unknown> = {}) => ({
  items,
  page: 0,
  size: 12,
  totalElements: items.length,
  totalPages: items.length > 0 ? 1 : 0,
  hasNext: false,
  hasPrevious: false,
  ...overrides,
});

export const eventDto = (overrides: Record<string, unknown> = {}) => ({
  type: "CREATED",
  at: "2026-11-01T08:00:00Z",
  version: 0,
  note: null,
  ...overrides,
});

export const assetDto = {
  assetId: ids.asset,
  designId: ids.design,
  originalName: "logo.png",
  contentType: "image/png",
  widthPx: 1200,
  heightPx: 800,
  sizeBytes: 90_001,
  checksum: "c".repeat(64),
  storedAt: "2026-11-01T07:50:00Z",
};

export const downloadDto = {
  url: "https://files.example.vn/designs/logo.png?sig=abc",
  expiresAt: "2026-11-01T08:05:00Z",
};

/** `DesignArtifactResponse`: a file of a design as the BE lists it (every upload, newest first). */
export const artifactDto = (role: string, overrides: Record<string, unknown> = {}) => ({
  artifactId: `7c1f0a00-0000-4000-8000-${String(role.length * 1000 + 7).padStart(12, "0")}`,
  designId: ids.design,
  role,
  originalName: `${role.toLowerCase()}.bin`,
  contentType: "application/pdf",
  sizeBytes: 2_048,
  storedAt: "2026-11-01T08:00:00Z",
  checksum: "f".repeat(64),
  documentChecksum: "d".repeat(64),
  ...overrides,
});

/** The old contract's file row (with its link), kept for the screens that still read the old mock's. */
export const fileDto = (role: string, overrides: Record<string, unknown> = {}) => ({
  role,
  name: `${role.toLowerCase()}.bin`,
  sizeBytes: 2_048,
  sha256: "f".repeat(64),
  url: `blob:mock/file/${ids.design}/${role}`,
  ...overrides,
});

export const cupDocument = (): DesignDocument => emptyDocument(cup12oz);
export const bagDocument = (): DesignDocument => emptyDocument(bagM);

export const documentRecordDto = (overrides: Record<string, unknown> = {}) => ({
  designId: ids.design,
  version: 3,
  document: cupDocument(),
  checksum: "d".repeat(64),
  updatedAt: "2026-11-02T08:00:00Z",
  ...overrides,
});

export const printConfigDto = (overrides: Record<string, unknown> = {}) => ({
  sku: cup12oz.sku,
  product: { slug: "ly-giay-2-lop-12oz", title: "Ly giấy 2 lớp 12oz", status: "PUBLISHED" },
  variantStatus: "ACTIVE",
  hasCartonSpec: true,
  template: cup12oz,
  fileRules: { minDpi: 300, formats: ["image/png", "image/jpeg"], maxFileSizeMb: 50 },
  ...overrides,
});

/**
 * One template as the BE sends it (`CatalogCustomizationResponse.Template`): the engine's 12 oz
 * cup with its nulls left out (`maxColors`, `allowedFontCodes`), a `templateId`, no `model3d`.
 */
export const templateDto = (overrides: Record<string, unknown> = {}) => {
  const { maxColors: _colors, allowedFontCodes: _fonts, ...rest } = cup12oz;
  return { ...rest, templateId: ids.snapshot, ...overrides };
};

/** `GET /catalog/products/{slug}/customization`: its templates carry `hasCartonSpec`. */
export const customizationDto = (
  templates: unknown[] = [templateDto({ hasCartonSpec: true })],
) => ({
  productId: ids.project,
  kind: "CUSTOMIZABLE",
  templates,
});
