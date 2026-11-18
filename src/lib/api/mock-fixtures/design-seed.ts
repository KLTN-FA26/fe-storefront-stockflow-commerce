/**
 * The designs the mock starts with (and starts again with after `__mock/reset`): one per status of
 * the docs' lifecycle, for the one mock customer the mock serves — a DRAFT kraft bag, a DRAFT cup
 * returned with a reason, a cup PENDING_REVIEW, an APPROVED cup with a logo (snapshot, SKU code)
 * and an open quote request of 120 cartons, and an ARCHIVED cup that is never listed. Ids are fixed so tests and links can name them.
 *
 * The customer preview of a seeded submission is the static `/logo.png` (its real size and
 * SHA-256); the print-ready file and the technical spec are small placeholder blobs, not renderable
 * PDFs (mock only).
 */

import type {
  DesignDocument,
  SurfaceContent,
  TextElement,
} from "@/features/product-design/engine/document/schema";
import { documentChecksum, sha256Hex } from "@/features/product-design/engine/export/checksum";

import { vnDateOf } from "@/features/product-design/quote-request-rules";

import { MOCK_PRINT_CONFIGS } from "./design-print-configs";
import {
  approvalNote,
  bundleChecksum,
  customerSkuCode,
  fileKey,
  type AssetRow,
  type BundleRole,
  type DesignMockState,
  type DesignRow,
  type DocumentRow,
  type EventRow,
  type FileRow,
  type QuoteRequestRow,
} from "./design-rows";

export const MOCK_DESIGN_IDS = {
  draft: "7d51f000-0000-4000-8000-000000000001",
  returned: "7d51f000-0000-4000-8000-000000000002",
  pending: "7d51f000-0000-4000-8000-000000000003",
  approved: "7d51f000-0000-4000-8000-000000000004",
  archived: "7d51f000-0000-4000-8000-000000000005",
  /** The approved cup's snapshot. */
  approvedSnapshot: "7d51f000-0000-4000-8000-0000000000c1",
  /** The logo image on the approved cup's document. */
  logoAsset: "7d51f000-0000-4000-8000-0000000000e1",
  /** The approved cup's open quote request (WF-02 D1): its card shows it. */
  approvedQuoteRequest: "7d51f000-0000-4000-8000-0000000000a1",
} as const;

/** `public/logo.png`. */
const LOGO = {
  url: "/logo.png",
  sizeBytes: 947_534,
  sha256: "3b767c78aca187233f9cea893286805b9d149182b13491c73c37e5ca4c5ebf69",
  widthPx: 1254,
  heightPx: 1254,
};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const seedText = (id: string, content: string, at: { u: number; v: number }): TextElement => ({
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
  color: "#3B2A1E",
  align: "center",
  bold: true,
  italic: false,
  letterSpacingEm: 0,
  lineHeight: 1.2,
});

const blank = (): SurfaceContent => ({ background: { kind: "none" }, elements: [] });

function cupDocument(sku: string, body: SurfaceContent): DesignDocument {
  const { template } = MOCK_PRINT_CONFIGS[sku]!;
  // Texts and images on the cup bend along its body, as the studio places them.
  const elements = body.elements.map((el) => (el.type === "drawing" ? el : { ...el, wrap: true }));
  return {
    schemaVersion: 1,
    templateCode: template.code,
    sku,
    surfaces: { BODY: { ...body, elements } },
  };
}

const bagDocument = (): DesignDocument => ({
  schemaVersion: 1,
  templateCode: MOCK_PRINT_CONFIGS["BAG-KRAFT-M"]!.template.code,
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
      elements: [seedText("el-bag-1", "Tiệm Bánh Hoa", { u: 130, v: 140 })],
    },
    BACK: blank(),
    LEFT: blank(),
    RIGHT: blank(),
  },
});

const approvedCupDocument = () =>
  cupDocument("CUP-PAPER-12OZ-WHT", {
    background: { kind: "color", color: "#F5EFE6" },
    elements: [
      seedText("el-cup-1", "Nhà Mình", { u: 150, v: 60 }),
      {
        id: "el-cup-2",
        type: "image",
        name: "Logo",
        hidden: false,
        locked: false,
        opacity: 1,
        placement: { u: 80, v: 60, rotationDeg: 0, scale: 1 },
        assetId: MOCK_DESIGN_IDS.logoAsset,
        naturalWidthPx: LOGO.widthPx,
        naturalHeightPx: LOGO.heightPx,
        widthMm: 30,
        heightMm: 30,
        flipX: false,
        flipY: false,
      },
    ],
  });

/** A seeded submission: the static preview and two placeholder blobs. */
async function seedBundle(designId: string, storedAt: string) {
  const blobs: Array<[string, Blob]> = [];
  const files: FileRow[] = [
    {
      designId,
      role: "CUSTOMER_PREVIEW",
      name: "preview.png",
      contentType: "image/png",
      sizeBytes: LOGO.sizeBytes,
      sha256: LOGO.sha256,
      storedAt,
      url: LOGO.url,
    },
  ];
  const placeholders: Array<[BundleRole, string]> = [
    ["PRINT_READY", "print-ready.pdf"],
    ["TECHNICAL_SPEC", "technical-spec.pdf"],
  ];
  for (const [role, name] of placeholders) {
    const bytes = new TextEncoder().encode(
      `%PDF-1.4\n% design mock seed placeholder: ${role}\n%%EOF\n`,
    );
    files.push({
      designId,
      role,
      name,
      contentType: "application/pdf",
      sizeBytes: bytes.length,
      sha256: await sha256Hex(bytes),
      storedAt,
    });
    blobs.push([fileKey(designId, role), new Blob([bytes], { type: "application/pdf" })]);
  }
  return { files, blobs };
}

export async function seedDesignState(
  now: Date,
): Promise<{ state: DesignMockState; blobs: Array<[string, Blob]> }> {
  const t = now.getTime();
  const ago = (ms: number) => new Date(t - ms).toISOString();

  const designs: DesignRow[] = [];
  const documents: Record<string, DocumentRow> = {};
  const history: EventRow[] = [];
  const files: FileRow[] = [];
  const blobs: Array<[string, Blob]> = [];

  async function seed(
    row: Pick<DesignRow, "id" | "name" | "status" | "version" | "createdAt" | "updatedAt"> &
      Partial<Pick<DesignRow, "lastReturn" | "submittedAt" | "approvedAt" | "approval">> & {
        sku: string;
      },
    document: DesignDocument,
    events: Array<Omit<EventRow, "designId">>,
  ) {
    const { sku, ...fields } = row;
    const { product } = MOCK_PRINT_CONFIGS[sku]!;
    designs.push({
      seq: designs.length + 1,
      product: { slug: product.slug, title: product.title },
      variant: { sku, label: sku },
      projectId: null,
      sourceSnapshotId: null,
      lastReturn: null,
      submittedAt: null,
      approvedAt: null,
      approval: null,
      ...fields,
    });
    documents[row.id] = {
      designId: row.id,
      document,
      checksum: await documentChecksum(document),
      updatedAt: row.updatedAt,
    };
    history.push(...events.map((event) => ({ designId: row.id, ...event })));
  }

  async function submitted(designId: string, storedAt: string) {
    const bundle = await seedBundle(designId, storedAt);
    files.push(...bundle.files);
    blobs.push(...bundle.blobs);
    return bundle.files;
  }

  await seed(
    {
      id: MOCK_DESIGN_IDS.draft,
      sku: "BAG-KRAFT-M",
      name: "Túi kraft tiệm bánh Hoa",
      status: "DRAFT",
      version: 2,
      createdAt: ago(DAY),
      updatedAt: ago(HOUR),
    },
    bagDocument(),
    [{ type: "CREATED", at: ago(DAY), version: 0, note: null }],
  );

  const reason = "Chữ quá sát mép trên của thân ly, vui lòng dời xuống một chút.";
  await seed(
    {
      id: MOCK_DESIGN_IDS.returned,
      sku: "CUP-PAPER-8OZ-WHT",
      name: "Ly cà phê Sáng 8oz",
      status: "DRAFT",
      version: 5,
      createdAt: ago(3 * DAY),
      updatedAt: ago(DAY),
      submittedAt: ago(2 * DAY),
      lastReturn: { reason, returnedAt: ago(DAY) },
    },
    cupDocument("CUP-PAPER-8OZ-WHT", {
      background: { kind: "none" },
      elements: [seedText("el-sang-1", "Cà phê Sáng", { u: 125, v: 50 })],
    }),
    [
      { type: "CREATED", at: ago(3 * DAY), version: 0, note: null },
      { type: "SUBMITTED_FOR_REVIEW", at: ago(2 * DAY), version: 4, note: null },
      { type: "RETURNED", at: ago(DAY), version: 5, note: reason },
    ],
  );
  await submitted(MOCK_DESIGN_IDS.returned, ago(2 * DAY));

  await seed(
    {
      id: MOCK_DESIGN_IDS.pending,
      sku: "CUP-PET-500ML",
      name: "Ly trà sữa Mây 500ml",
      status: "PENDING_REVIEW",
      version: 3,
      createdAt: ago(2 * DAY),
      updatedAt: ago(3 * HOUR),
      submittedAt: ago(3 * HOUR),
    },
    cupDocument("CUP-PET-500ML", {
      background: { kind: "none" },
      elements: [seedText("el-may-1", "Trà sữa Mây", { u: 142, v: 74 })],
    }),
    [
      { type: "CREATED", at: ago(2 * DAY), version: 0, note: null },
      { type: "SUBMITTED_FOR_REVIEW", at: ago(3 * HOUR), version: 3, note: null },
    ],
  );
  await submitted(MOCK_DESIGN_IDS.pending, ago(3 * HOUR));

  const approvedDocument = approvedCupDocument();
  const approvedFiles = await submitted(MOCK_DESIGN_IDS.approved, ago(4 * DAY));
  const approval = {
    snapshotId: MOCK_DESIGN_IDS.approvedSnapshot,
    skuCode: customerSkuCode("CUP-PAPER-12OZ-WHT", 1),
    bundleChecksum: await bundleChecksum(approvedFiles, await documentChecksum(approvedDocument)),
  };
  await seed(
    {
      id: MOCK_DESIGN_IDS.approved,
      sku: "CUP-PAPER-12OZ-WHT",
      name: "Ly cà phê Nhà Mình 12oz",
      status: "APPROVED",
      version: 5,
      createdAt: ago(5 * DAY),
      updatedAt: ago(3 * DAY),
      submittedAt: ago(4 * DAY),
      approvedAt: ago(3 * DAY),
      approval,
    },
    approvedDocument,
    [
      { type: "CREATED", at: ago(5 * DAY), version: 0, note: null },
      { type: "SUBMITTED_FOR_REVIEW", at: ago(4 * DAY), version: 4, note: null },
      { type: "APPROVED", at: ago(3 * DAY), version: 5, note: approvalNote(approval) },
    ],
  );
  // Asked two days ago, for delivery in a month: OPEN, the sales staff have not answered yet.
  const desiredDeliveryDate = vnDateOf(new Date(t + 30 * DAY));
  const quoteRequest: QuoteRequestRow = {
    id: MOCK_DESIGN_IDS.approvedQuoteRequest,
    designId: MOCK_DESIGN_IDS.approved,
    cartons: 120,
    desiredDeliveryDate,
    status: "OPEN",
    requestedAt: ago(2 * DAY),
    closedAt: null,
    closedBy: null,
  };
  history.push({
    designId: MOCK_DESIGN_IDS.approved,
    type: "QUOTE_REQUESTED",
    at: ago(2 * DAY),
    version: 5,
    note: `120 carton(s), delivery by ${desiredDeliveryDate}`,
  });
  const logo: AssetRow = {
    designId: MOCK_DESIGN_IDS.approved,
    assetId: MOCK_DESIGN_IDS.logoAsset,
    originalName: "logo.png",
    contentType: "image/png",
    widthPx: LOGO.widthPx,
    heightPx: LOGO.heightPx,
    sizeBytes: LOGO.sizeBytes,
    checksum: LOGO.sha256,
    storedAt: ago(5 * DAY),
    uploadKey: null,
    url: LOGO.url,
  };

  await seed(
    {
      id: MOCK_DESIGN_IDS.archived,
      sku: "CUP-PAPER-8OZ-WHT",
      name: "Bản nháp cũ",
      status: "ARCHIVED",
      version: 1,
      createdAt: ago(6 * DAY),
      updatedAt: ago(5 * DAY),
    },
    cupDocument("CUP-PAPER-8OZ-WHT", blank()),
    [
      { type: "CREATED", at: ago(6 * DAY), version: 0, note: null },
      { type: "ARCHIVED", at: ago(5 * DAY), version: 1, note: null },
    ],
  );

  return {
    state: {
      designs,
      documents,
      assets: [logo],
      history,
      files,
      artifactUploads: [],
      projects: [],
      projectEvents: [],
      library: [],
      reviewRounds: [],
      submissionUploads: [],
      failNextApproval: [],
      quoteRequests: [quoteRequest],
      projectQuoteRequests: [],
      seq: { design: designs.length, project: 0 },
    },
    blobs,
  };
}
