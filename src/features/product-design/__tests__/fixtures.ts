import { emptyDocument } from "../engine/document/factory";
import type { DesignDocument } from "../engine/document/schema";
import { bagM, cup12oz } from "../engine/__tests__/fixtures";
import { designDtoSchema } from "../schemas";
import type { Design } from "../types";

/** A font registry with plain family names, as a screen test hands the studio. */
export { FONTS as TEST_FONTS } from "../engine/__tests__/fixtures";

/**
 * Design answers shaped as the contract of spec 2026-11-09 §4.1, inside the envelope the client
 * unwraps: nullable fields are sent as `null`, never left out.
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
  createdAt: "2026-11-01T08:00:00Z",
  updatedAt: "2026-11-02T08:00:00Z",
  submittedAt: null,
  approvedAt: null,
  approval: null,
  ...overrides,
});

/** A `designDto` the way the API layer hands it to the UI: parsed. */
export const design = (overrides: Record<string, unknown> = {}): Design =>
  designDtoSchema.parse(designDto(overrides));

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
    approval: {
      snapshotId: ids.snapshot,
      skuCode: "CUP-PAPER-12OZ-WHT-KH0010-001",
      bundleChecksum: "e".repeat(64),
    },
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
