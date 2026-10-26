/**
 * The designs the mock backend starts with, for the caller's `userId` / `customerId`: an APPROVED 12oz
 * cup (snapshot, document with a logo, the logo image, preview, decision log), a DRAFT kraft bag with a
 * document, and a design of another user the caller must never see. Seeding is synchronous, so the
 * checksums are precomputed; `features/product-design/__tests__/mock-contract.test.ts` checks them
 * against the engine's.
 */

import { seedMockCatalog } from "./catalog";
import {
  newRow,
  type AssetRow,
  type DecisionRow,
  type DraftRow,
  type MockDesignDocument,
} from "./design-model";

/** Fixed ids of the seeded designs (and of the other user's design the caller must never see). */
export const MOCK_DESIGN_IDS = {
  approvedCup: "7d51f000-0000-4000-8000-000000000001",
  draftBag: "7d51f000-0000-4000-8000-000000000002",
  foreign: "7d51f000-0000-4000-8000-000000000003",
  snapshot: "7d51f000-0000-4000-8000-0000000000c1",
  preview: "7d51f000-0000-4000-8000-0000000000a1",
  /** The logo image on the approved cup's document. */
  logoAsset: "7d51f000-0000-4000-8000-0000000000e1",
} as const;

export const MOCK_QC_USER_ID = "7d51f000-0000-4000-8000-0000000000b1";
const MOCK_SALES_USER_ID = "7d51f000-0000-4000-8000-0000000000b2";
const MOCK_OTHER_USER_ID = "7d51f000-0000-4000-8000-0000000000b3";
const MOCK_OTHER_CUSTOMER_ID = "7d51f000-0000-4000-8000-0000000000b4";

/**
 * SHA-256 of the seeded documents' canonical JSON and of the confirmed snapshot (see
 * `snapshotChecksum`), precomputed because seeding is synchronous; `mock-contract.test.ts` checks
 * them against the engine's `documentChecksum`.
 */
export const MOCK_SEED_CHECKSUMS = {
  cupDocument: "0c79d0251fb8d4edfb017c3d479ca5aa6423fd7af6a434572c751ae970a8f51d",
  bagDocument: "add774b54f4cd69ccec71e3667ee4c58c2ce6b458ed97f075aea46fbab430d17",
  snapshot: "f29adb39c5c8b16a836ac660aa9a862c060ee225670ed3817f1a1722aaf61c5b",
} as const;

function seedProductId(slug: string): string {
  const product = seedMockCatalog().find((p) => p.slug === slug);
  if (!product) throw new Error(`The mock catalogue has no product ${slug}`);
  return product.productId;
}

const DAY = 86_400_000;
const HOUR = 3_600_000;

const seedText = (
  id: string,
  content: string,
  at: { u: number; v: number },
  color: string,
): Record<string, unknown> => ({
  id,
  type: "text",
  name: content,
  hidden: false,
  locked: false,
  opacity: 1,
  placement: { ...at, rotationDeg: 0, scale: 1 },
  content,
  fontCode: "be-vietnam-pro",
  sizePt: 24,
  color,
  align: "center",
  bold: true,
  italic: false,
  letterSpacingEm: 0,
  lineHeight: 1.2,
});

const emptySurface = () => ({ background: { kind: "none" }, elements: [] });

/** An `image` element of the design document (the engine's `imageElementSchema`). */
const seedLogo = (id: string, assetId: string, at: { u: number; v: number }) => ({
  id,
  type: "image",
  name: "Logo",
  hidden: false,
  locked: false,
  opacity: 1,
  placement: { ...at, rotationDeg: 0, scale: 1 },
  assetId,
  naturalWidthPx: 600,
  naturalHeightPx: 600,
  widthMm: 30,
  heightMm: 30,
  flipX: false,
  flipY: false,
});

const seedCupDocument = (): MockDesignDocument => ({
  schemaVersion: 1,
  templateCode: "CUP12-BODY",
  sku: "CUP-PAPER-12OZ-WHT",
  surfaces: {
    BODY: {
      background: { kind: "color", color: "#F5EFE6" },
      elements: [
        seedText("el-cup-1", "Nhà Mình", { u: 118, v: 55 }, "#3B2A1E"),
        seedLogo("el-cup-2", MOCK_DESIGN_IDS.logoAsset, { u: 60, v: 55 }),
      ],
    },
  },
});

const seedBagDocument = (): MockDesignDocument => ({
  schemaVersion: 1,
  templateCode: "BAGM-4F",
  sku: "BAG-KRAFT-M",
  surfaces: {
    FRONT: {
      background: {
        kind: "pattern",
        patternId: "dots",
        colors: ["#C9A27B", "#B58B63"],
        scale: 1,
        rotationDeg: 0,
      },
      elements: [seedText("el-bag-1", "Tiệm Bánh Hoa", { u: 130, v: 140 }, "#FFFFFF")],
    },
    BACK: emptySurface(),
    LEFT: emptySurface(),
    RIGHT: emptySurface(),
  },
});

/** The logo the cup document places: a stored file with a link, as a seeded artifact is. */
const seedLogoAsset = (storedAt: string): AssetRow => ({
  assetId: MOCK_DESIGN_IDS.logoAsset,
  originalName: "logo.png",
  contentType: "image/png",
  sizeBytes: 12_480,
  checksum: "cd".repeat(32),
  storedAt,
  widthPx: 600,
  heightPx: 600,
  url: "/logo.png",
});

export function seedRows(userId: string, customerId: string, t: number): DraftRow[] {
  const ago = (ms: number) => new Date(t - ms).toISOString();
  const cupSlug = "ly-giay-2-lop-12oz";
  const bagSlug = "tui-giay-kraft";
  const previewChecksum = "ab".repeat(32);
  const spec = 'Ly giấy 12oz – CUP12-BODY: nền kem, 1 dòng chữ "Nhà Mình".';

  const manifestEntry = {
    artifactId: MOCK_DESIGN_IDS.preview,
    role: "CUSTOMER_PREVIEW" as const,
    originalName: "preview.png",
    contentType: "image/png",
    sizeBytes: 48_213,
    checksum: previewChecksum,
  };
  const decision = (
    decisionName: string,
    ms: number,
    version: number,
    extra: Partial<DecisionRow> = {},
  ): DecisionRow => ({
    actorId: userId,
    artifactId: undefined,
    notes: undefined,
    ...extra,
    decision: decisionName,
    version,
    at: ago(ms),
  });

  const approved = newRow({
    id: MOCK_DESIGN_IDS.approvedCup,
    customerId,
    productId: seedProductId(cupSlug),
    productSlug: cupSlug,
    sku: "CUP-PAPER-12OZ-WHT",
    templateCode: "CUP12-BODY",
    ownerUserId: userId,
    assignedUserId: MOCK_SALES_USER_ID,
    reviewerUserId: MOCK_QC_USER_ID,
    name: "Ly cà phê Nhà Mình 12oz",
    spec,
    status: "APPROVED",
    currentArtifactId: MOCK_DESIGN_IDS.preview,
    currentArtifacts: { CUSTOMER_PREVIEW: MOCK_DESIGN_IDS.preview },
    technicalReviewPassed: true,
    reviewNotes: "Ảnh đủ độ phân giải, đạt kỹ thuật",
    version: 4,
    reviewRequestedAt: ago(3 * DAY - HOUR),
    reviewedAt: ago(2 * DAY),
    updatedAt: ago(DAY),
    createdAt: ago(3 * DAY),
    document: {
      document: seedCupDocument(),
      checksum: MOCK_SEED_CHECKSUMS.cupDocument,
      updatedAt: ago(3 * DAY - HOUR),
    },
    assets: [seedLogoAsset(ago(3 * DAY - HOUR))],
    artifacts: [
      {
        artifactId: MOCK_DESIGN_IDS.preview,
        role: "CUSTOMER_PREVIEW",
        originalName: "preview.png",
        contentType: "image/png",
        sizeBytes: 48_213,
        checksum: previewChecksum,
        storedAt: ago(3 * DAY - HOUR),
        url: "/logo.png",
      },
    ],
    decisions: [
      decision("TECHNICAL_ACCEPTED", 2 * DAY, 2, {
        actorId: MOCK_QC_USER_ID,
        artifactId: MOCK_DESIGN_IDS.preview,
        notes: "Ảnh đủ độ phân giải, đạt kỹ thuật",
      }),
      decision("SENT_TO_CUSTOMER", 2 * DAY - HOUR, 3, {
        actorId: MOCK_SALES_USER_ID,
        notes: "Customer confirmation requested for the current artifact and specification",
      }),
      decision("CUSTOMER_CONFIRMED", DAY, 4, { notes: MOCK_DESIGN_IDS.snapshot }),
    ],
    snapshot: {
      id: MOCK_DESIGN_IDS.snapshot,
      artifactId: MOCK_DESIGN_IDS.preview,
      checksum: MOCK_SEED_CHECKSUMS.snapshot,
      spec,
      confirmedBy: userId,
      confirmedAt: ago(DAY),
      artifacts: [manifestEntry],
      document: seedCupDocument(),
      documentChecksum: MOCK_SEED_CHECKSUMS.cupDocument,
    },
  });

  const draftBag = newRow({
    id: MOCK_DESIGN_IDS.draftBag,
    customerId,
    productId: seedProductId(bagSlug),
    productSlug: bagSlug,
    sku: "BAG-KRAFT-M",
    templateCode: "BAGM-4F",
    ownerUserId: userId,
    reviewerUserId: MOCK_QC_USER_ID,
    name: "Túi kraft tiệm bánh Hoa",
    version: 2,
    updatedAt: ago(HOUR),
    createdAt: ago(DAY),
    document: {
      document: seedBagDocument(),
      checksum: MOCK_SEED_CHECKSUMS.bagDocument,
      updatedAt: ago(HOUR),
    },
  });

  // Another customer's design: listed nowhere, 404 everywhere.
  const foreign = newRow({
    id: MOCK_DESIGN_IDS.foreign,
    customerId: MOCK_OTHER_CUSTOMER_ID,
    productId: seedProductId(cupSlug),
    productSlug: cupSlug,
    sku: "CUP-PAPER-12OZ-WHT",
    templateCode: "CUP12-BODY",
    ownerUserId: MOCK_OTHER_USER_ID,
    reviewerUserId: MOCK_QC_USER_ID,
    name: "Thiết kế của khách khác",
    updatedAt: ago(2 * HOUR),
    createdAt: ago(2 * DAY),
    document: {
      document: seedCupDocument(),
      checksum: MOCK_SEED_CHECKSUMS.cupDocument,
      updatedAt: ago(2 * DAY),
    },
    assets: [seedLogoAsset(ago(2 * DAY))],
  });

  return [approved, draftBag, foreign].map((row, index) => ({ ...row, seq: index }));
}
