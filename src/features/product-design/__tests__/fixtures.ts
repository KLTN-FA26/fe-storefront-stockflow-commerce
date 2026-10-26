import { emptyDocument } from "../engine/document/factory";
import type { DesignDocument } from "../engine/document/schema";
import { bagM, cup12oz } from "../engine/__tests__/fixtures";
import { designDraftDtoSchema } from "../schemas";
import type { DesignDraft } from "../types";

/** A font registry with plain family names, as a screen test hands the studio. */
export { FONTS as TEST_FONTS } from "../engine/__tests__/fixtures";

/**
 * BE-shaped design answers as `origin/develop` sends them (`DesignWorkflowController` and
 * `DesignController`; Jackson drops every null field). The P1–P6 additions of spec §7.2 are kept
 * apart in `proposedDraftFields` so a test says which contract it exercises.
 */
const uuid = (n: number) => `7c1f0a00-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const ids = {
  design: uuid(1),
  customer: uuid(2),
  product: uuid(3),
  owner: uuid(4),
  reviewer: uuid(5),
  artifact: uuid(6),
  snapshot: uuid(7),
  asset: uuid(8),
  artifact2: uuid(9),
};

export const beDraft = (overrides: Record<string, unknown> = {}) => ({
  id: ids.design,
  customerId: ids.customer,
  productId: ids.product,
  ownerUserId: ids.owner,
  reviewerUserId: ids.reviewer,
  name: "Ly giấy logo quán",
  spec: "Mẫu thiết kế ly 12oz",
  status: "DRAFT",
  technicalReviewPassed: false,
  version: 3,
  ...overrides,
});

/** A `beDraft` the way the API layer hands it to the UI: parsed, so `undefined` fields are absent. */
export const designDraft = (overrides: Record<string, unknown> = {}): DesignDraft =>
  designDraftDtoSchema.parse(beDraft(overrides));

/** P6: what the proposed `DesignDraftResponse` adds (mock mode, and the real BE once it ships). */
export const proposedDraftFields = {
  productSlug: "ly-giay-2-lop-12oz",
  sku: "CUP-PAPER-12OZ-WHT",
  templateCode: "CUP12-BODY",
  reviewRequestedAt: "2026-10-25T08:00:00.123456Z",
  reviewedAt: "2026-10-25T09:30:00Z",
  updatedAt: "2026-10-25T08:00:00Z",
  previewArtifactId: ids.artifact,
};

export const bePage = <T>(items: T[], overrides: Record<string, unknown> = {}) => ({
  items,
  page: 0,
  size: 12,
  totalElements: items.length,
  totalPages: items.length > 0 ? 1 : 0,
  hasNext: false,
  hasPrevious: false,
  ...overrides,
});

export const beDecision = {
  actorId: ids.reviewer,
  artifactId: ids.artifact,
  decision: "TECHNICAL_REVIEW_PASSED",
  notes: "Ảnh đủ độ phân giải",
  version: 4,
  at: "2026-10-25T09:30:00Z",
};

export const beArtifact = {
  artifactId: ids.artifact,
  designId: ids.design,
  role: "CUSTOMER_PREVIEW",
  originalName: "preview.png",
  contentType: "image/png",
  sizeBytes: 48_213,
  storedAt: "2026-10-25T08:00:00Z",
  checksum: "a".repeat(64),
};

export const beSnapshot = {
  id: ids.snapshot,
  draftId: ids.design,
  artifactId: ids.artifact,
  checksum: "b".repeat(64),
  spec: "Mẫu thiết kế ly 12oz",
  confirmedBy: ids.owner,
  confirmedAt: "2026-10-25T10:00:00Z",
  artifacts: [
    {
      artifactId: ids.artifact,
      role: "CUSTOMER_PREVIEW",
      originalName: "preview.png",
      contentType: "image/png",
      sizeBytes: 48_213,
      checksum: "a".repeat(64),
    },
  ],
};

export const beDownload = {
  url: "https://files.example.vn/designs/preview.png?sig=abc",
  expiresAt: "2026-10-25T08:05:00Z",
};

export const beAsset = {
  assetId: ids.asset,
  designId: ids.design,
  originalName: "logo.png",
  contentType: "image/png",
  widthPx: 1200,
  heightPx: 800,
  sizeBytes: 90_001,
  checksum: "c".repeat(64),
  storedAt: "2026-10-25T07:50:00Z",
};

export const cupDocument = (): DesignDocument => emptyDocument(cup12oz);
export const bagDocument = (): DesignDocument => emptyDocument(bagM);

export const beDocumentRecord = (overrides: Record<string, unknown> = {}) => ({
  designId: ids.design,
  version: 3,
  document: cupDocument(),
  checksum: "d".repeat(64),
  updatedAt: "2026-10-25T08:00:00Z",
  ...overrides,
});

/** A P2 template the way a BE row would be spelled: formats as short names, no font list. */
export const beTemplate = (overrides: Record<string, unknown> = {}) => ({
  ...cup12oz,
  allowedFileFormats: ["PNG", "JPG"],
  allowedFontCodes: [],
  ...overrides,
});

export const beCustomization = (overrides: Record<string, unknown> = {}) => ({
  productId: ids.product,
  kind: "CUSTOMIZABLE",
  templates: [beTemplate()],
  ...overrides,
});

export const validCreateInput = {
  productId: ids.product,
  sku: "CUP-PAPER-12OZ-WHT",
  templateCode: "CUP12-BODY",
  name: "Ly giấy logo quán",
};
