// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  MOCK_DESIGN_IDS,
  createMockDesignStudio,
  type MockCatalogKind,
  type MockDesignDeps,
  type MockDesignStudio,
  type MockResult,
} from "./designs";

// Whether the bodies satisfy the FE zod schemas is checked from the feature side
// (features/product-design/__tests__/mock-contract.test.ts) — lib must not import features.
interface Draft {
  id: string;
  name: string;
  status: string;
  version: number;
  sku: string;
  templateCode: string;
  productSlug?: string;
  spec?: string;
  currentArtifactId?: string;
  previewArtifactId?: string;
  parentSnapshotId?: string;
  technicalReviewPassed: boolean;
  reviewNotes?: string;
  reviewRequestedAt?: string;
  reviewedAt?: string;
  updatedAt: string;
}
interface Snapshot {
  id: string;
  draftId: string;
  artifactId: string;
  checksum: string;
  artifacts: Array<{ artifactId: string; role: string }>;
}
interface DocRecord {
  designId: string;
  version: number;
  checksum: string;
  document: { surfaces: Record<string, { background: { kind: string }; elements: unknown[] }> };
}
interface Page<T> {
  items: T[];
  page: number;
  size: number;
  totalElements: number;
  hasNext: boolean;
}
interface Stored {
  assetId: string;
  artifactId: string;
  widthPx: number;
  heightPx: number;
  role: string;
  originalName: string;
}

const uuid = (n: number) => `5e5e0000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const USER = uuid(0xa);
const CUSTOMER = uuid(0xb);
const P12 = uuid(0x12);
const PBAG = uuid(0x20);
const CATALOG: Record<string, MockCatalogKind> = {
  "ly-giay-2-lop-12oz": { productId: P12, kind: "CUSTOMIZABLE", skus: ["CUP-PAPER-12OZ-WHT"] },
  "tui-giay-kraft": {
    productId: PBAG,
    kind: "CUSTOMIZABLE",
    skus: ["BAG-KRAFT-M", "BAG-KRAFT-L"],
  },
  "nap-ly-90mm": { productId: uuid(0x30), kind: "STANDARD", skus: ["LID-90MM-BLK"] },
};
const T0 = Date.UTC(2026, 9, 26, 8, 0, 0);
const CUP = { productId: P12, sku: "CUP-PAPER-12OZ-WHT", templateCode: "CUP12-BODY" };

function studio(extra: Partial<MockDesignDeps> = {}) {
  let ids = 0;
  let clock = T0;
  return createMockDesignStudio({
    userId: USER,
    customerId: CUSTOMER,
    now: () => (clock += 1000),
    newId: () => uuid(0x1000 + ids++),
    readImageSize: async () => ({ width: 1200, height: 800 }),
    toUrl: (blob) => `blob:mock/${blob.size}`,
    catalogKindOf: (slug) => CATALOG[slug],
    ...extra,
  });
}

const data = <T>(result: MockResult): T => {
  expect(result.status, JSON.stringify(result.data)).toBeLessThan(300);
  return (result.data as { data: T }).data;
};
const errorCode = (result: MockResult) => (result.data as { errorCode?: string }).errorCode;
const fieldsOf = (result: MockResult) =>
  (result.data as { fieldErrors?: Array<{ field: string }> }).fieldErrors?.map((e) => e.field);

const cupDoc = (templateCode = "CUP12-BODY", sku = "CUP-PAPER-12OZ-WHT") => ({
  schemaVersion: 1,
  templateCode,
  sku,
  surfaces: { BODY: { background: { kind: "none" }, elements: [] as unknown[] } },
});
const file = (bytes = 8, type = "image/png", name = "logo.png") =>
  new File([new Uint8Array(bytes).fill(7)], name, { type });
/** A blob that reports a size over a limit without holding the bytes. */
class OversizedBlob extends Blob {
  readonly #reported: number;
  constructor(reported: number, type: string) {
    super([], { type });
    this.#reported = reported;
  }
  override get size() {
    return this.#reported;
  }
}

const startCup = async (s: MockDesignStudio) =>
  data<Draft>(await s.create({ ...CUP, name: "Ly A" }));
const get = (s: MockDesignStudio, id: string) => data<Draft>(s.get(id));

/** A draft with a saved document and a current preview, ready to be reviewed. */
async function draftWithPreview(s: MockDesignStudio) {
  const d = await startCup(s);
  data(await s.putDocument(d.id, { version: d.version, document: cupDoc() }));
  data(await s.uploadArtifact(d.id, "CUSTOMER_PREVIEW", file(), "preview-key-1"));
  return get(s, d.id);
}

/** SUBMITTED: reviewed and passed, then sent to the customer. */
async function submittedDraft(s: MockDesignStudio) {
  const d = await draftWithPreview(s);
  data(s.completeReview(d.id, true, "OK"));
  return data<Draft>(s.submit(d.id, { version: get(s, d.id).version }));
}

describe("drafts and the optimistic lock", () => {
  it("creates, saves with optimistic versions and rejects a stale version", async () => {
    const s = studio();
    const d = await startCup(s);
    const saved = data<{ version: number }>(
      await s.putDocument(d.id, { version: d.version, document: cupDoc() }),
    );
    expect(saved.version).toBe(d.version + 1);
    const stale = await s.putDocument(d.id, { version: d.version, document: cupDoc() });
    expect(stale.status).toBe(409);
    expect(errorCode(stale)).toBe("CONFLICT");
  });

  it("answers the BE fields and the P6 fields of a new draft, leaving absent ones out", async () => {
    const d = await startCup(studio());
    expect(d).toMatchObject({
      status: "DRAFT",
      version: 0,
      technicalReviewPassed: false,
      name: "Ly A",
      productSlug: "ly-giay-2-lop-12oz",
      ...CUP,
    });
    expect(d).toMatchObject({ customerId: CUSTOMER, ownerUserId: USER });
    for (const absent of ["spec", "currentArtifactId", "previewArtifactId", "reviewRequestedAt"]) {
      expect(d).not.toHaveProperty(absent);
    }
    expect(Object.values(d)).not.toContain(null);
  });

  it.each([
    ["a blank name", { ...CUP, name: "  " }, ["name"]],
    ["a name over 200 characters", { ...CUP, name: "x".repeat(201) }, ["name"]],
    ["a missing SKU", { productId: P12, templateCode: "CUP12-BODY", name: "A" }, ["sku"]],
  ])("refuses %s with 400 VALIDATION_FAILED", async (_label, body, fields) => {
    const result = await studio().create(body);
    expect(result.status).toBe(400);
    expect(errorCode(result)).toBe("VALIDATION_FAILED");
    expect(fieldsOf(result)).toEqual(fields);
  });

  it("answers the P1 errors: product, customizable, template", async () => {
    const s = studio();
    const refuse = async (body: Record<string, string>) => {
      const r = await s.create({ ...CUP, name: "A", ...body });
      return [r.status, errorCode(r)];
    };
    expect(await refuse({ productId: uuid(0x99) })).toEqual([404, "PRODUCT_NOT_FOUND"]);
    expect(await refuse({ sku: "LID-90MM-BLK" })).toEqual([409, "PRODUCT_NOT_CUSTOMIZABLE"]);
    expect(await refuse({ templateCode: "CUP12-LOGO" })).toEqual([422, "TEMPLATE_NOT_FOUND"]);
    const standard = studio({
      catalogKindOf: () => ({ ...CATALOG["ly-giay-2-lop-12oz"]!, kind: "STANDARD" }),
    });
    expect((await standard.create({ ...CUP, name: "A" })).status).toBe(409);
  });

  it("hides another user's design behind 404 everywhere and never lists it", async () => {
    const s = studio();
    const id = MOCK_DESIGN_IDS.foreign;
    const results = [
      s.get(id),
      s.history(id),
      s.snapshot(id),
      s.getDocument(id),
      s.listAssets(id),
      s.listArtifacts(id),
      s.revise(id, { version: 0, spec: "x" }),
      s.requestReview(id, { version: 0 }),
      s.submit(id, { version: 0 }),
      s.requestChanges(id, { version: 0, reason: "x" }),
      s.withdraw(id, { version: 0, reason: "x" }),
      s.fork(id),
      await s.putDocument(id, { version: 0, document: cupDoc() }),
      await s.uploadAsset(id, file()),
      await s.uploadArtifact(id, "CUSTOMER_PREVIEW", file()),
      await s.confirm(id, { version: 0, artifactId: uuid(1) }),
    ];
    expect(results.map((r) => r.status)).toEqual(results.map(() => 404));
    const { items } = data<Page<Draft>>(s.list({ size: 200 }));
    expect(items.map((d) => d.id)).not.toContain(id);
  });
});

describe("the design document (P3)", () => {
  it("holds the template's empty document from creation, at the draft's version", async () => {
    const s = studio();
    const cup = await startCup(s);
    const record = data<DocRecord>(s.getDocument(cup.id));
    expect(record).toMatchObject({ designId: cup.id, version: cup.version, document: cupDoc() });
    expect(record.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(record.document.surfaces.BODY).toEqual({ background: { kind: "none" }, elements: [] });

    const bag = data<Draft>(
      await s.create({ productId: PBAG, sku: "BAG-KRAFT-M", templateCode: "BAGM-4F", name: "Túi" }),
    );
    expect(Object.keys(data<DocRecord>(s.getDocument(bag.id)).document.surfaces)).toEqual([
      "FRONT",
      "BACK",
      "LEFT",
      "RIGHT",
    ]);
  });

  it("answers the stored record after a save, and 404 only for a design that is not yours", async () => {
    const s = studio();
    const d = await startCup(s);
    const empty = data<DocRecord>(s.getDocument(d.id));
    const document = {
      ...cupDoc(),
      surfaces: { BODY: { background: { kind: "color", color: "#FFFFFF" }, elements: [] } },
    };
    const saved = data<DocRecord>(await s.putDocument(d.id, { version: d.version, document }));
    expect(saved.version).toBe(d.version + 1);
    expect(saved.checksum).not.toBe(empty.checksum);
    expect(data<DocRecord>(s.getDocument(d.id))).toEqual(saved);
    expect(s.getDocument(uuid(0x9999)).status).toBe(404);
    expect(s.getDocument(MOCK_DESIGN_IDS.foreign).status).toBe(404);
  });

  it("checksums the canonical JSON: key order does not matter, content does", async () => {
    const s = studio();
    const a = await startCup(s);
    const b = await startCup(s);
    const reordered = {
      surfaces: cupDoc().surfaces,
      sku: CUP.sku,
      templateCode: CUP.templateCode,
      schemaVersion: 1,
    };
    const sumA = data<{ checksum: string }>(
      await s.putDocument(a.id, { version: 0, document: cupDoc() }),
    );
    const sumB = data<{ checksum: string }>(
      await s.putDocument(b.id, { version: 0, document: reordered }),
    );
    expect(sumA.checksum).toBe(sumB.checksum);
    const other = {
      ...cupDoc(),
      surfaces: { BODY: { background: { kind: "color", color: "#FFFFFF" }, elements: [] } },
    };
    const sumC = data<{ checksum: string }>(
      await s.putDocument(a.id, { version: 1, document: other }),
    );
    expect(sumC.checksum).not.toBe(sumA.checksum);
  });

  it("refuses what the BE would: 413 over 1 MB, 400 VALIDATION_FAILED off-template or without a version", async () => {
    const s = studio();
    const d = await startCup(s);
    const huge = cupDoc();
    huge.surfaces.BODY.elements.push({ pad: "x".repeat(1_000_001) });
    expect((await s.putDocument(d.id, { version: 0, document: huge })).status).toBe(413);
    for (const document of [
      cupDoc("CUP12-LOGO"),
      cupDoc("CUP12-BODY", "CUP-CUSTOM-LOGO"),
      { ...cupDoc(), schemaVersion: 2 },
      { ...cupDoc(), surfaces: { FRONT: { background: { kind: "none" }, elements: [] } } },
    ]) {
      const result = await s.putDocument(d.id, { version: 0, document });
      expect([result.status, errorCode(result), fieldsOf(result)]).toEqual([
        400,
        "VALIDATION_FAILED",
        ["document"],
      ]);
    }
    const unversioned = await s.putDocument(d.id, { document: cupDoc() });
    expect([unversioned.status, fieldsOf(unversioned)]).toEqual([400, ["version"]]);
    expect(get(s, d.id).version).toBe(0);
  });

  it("is frozen once the design is submitted", async () => {
    const s = studio();
    const d = await submittedDraft(s);
    const result = await s.putDocument(d.id, { version: d.version, document: cupDoc() });
    expect(result.status).toBe(409);
  });
});

describe("technical review and the workflow", () => {
  it("walks review → submit → confirm → fork", async () => {
    const s = studio();
    const d = await draftWithPreview(s);
    expect(s.submit(d.id, { version: d.version }).status).toBe(409); // no passed review yet
    s.completeReview(d.id, true, "OK");
    const v = get(s, d.id).version;
    const submitted = data<Draft>(s.submit(d.id, { version: v }));
    expect(submitted.status).toBe("SUBMITTED");
    const snap = data<Snapshot>(
      await s.confirm(d.id, {
        version: submitted.version,
        artifactId: submitted.currentArtifactId,
      }),
    );
    expect(get(s, d.id).status).toBe("APPROVED");
    expect(snap.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(data<Draft>(s.fork(d.id)).parentSnapshotId).toBe(snap.id);
  });

  it("records the request: reviewRequestedAt equals updatedAt until the next change", async () => {
    const s = studio();
    const d = await draftWithPreview(s);
    const requested = data<Draft>(s.requestReview(d.id, { version: d.version }));
    expect(requested.version).toBe(d.version + 1);
    expect(requested.reviewRequestedAt).toBeDefined();
    expect(requested.reviewRequestedAt).toBe(requested.updatedAt);
    expect(s.requestReview(d.id, { version: d.version }).status).toBe(409); // stale
    const edited = data<Draft>(s.revise(d.id, { version: requested.version, spec: "Thêm logo" }));
    expect(edited).not.toHaveProperty("reviewRequestedAt");
  });

  it("needs a current preview to ask for a review", async () => {
    const s = studio();
    const d = await startCup(s);
    expect(errorCode(s.requestReview(d.id, { version: d.version }))).toBe("CONFLICT");
    expect(s.completeReview(d.id, true, "OK").status).toBe(409);
  });

  it("shows the QC outcome and notes, and submit needs a pass", async () => {
    const s = studio();
    const d = await draftWithPreview(s);
    const rejected = data<Draft>(s.completeReview(d.id, false, "Logo mờ"));
    expect(rejected).toMatchObject({ technicalReviewPassed: false, reviewNotes: "Logo mờ" });
    expect(rejected.reviewedAt).toBeDefined();
    expect(s.submit(d.id, { version: rejected.version }).status).toBe(409);
    const passed = data<Draft>(s.completeReview(d.id, true, "Đạt"));
    expect(passed.technicalReviewPassed).toBe(true);
  });

  it.each([
    [
      "the document changes",
      async (s: MockDesignStudio, d: Draft) =>
        s.putDocument(d.id, { version: d.version, document: cupDoc() }),
    ],
    [
      "the specification changes",
      async (s: MockDesignStudio, d: Draft) => s.revise(d.id, { version: d.version, spec: "Mới" }),
    ],
    [
      "an artifact is uploaded",
      async (s: MockDesignStudio, d: Draft) => s.uploadArtifact(d.id, "TECHNICAL_SPEC", file(9)),
    ],
  ])("resets the technical review when %s", async (_label, change) => {
    const s = studio();
    const d = await draftWithPreview(s);
    s.requestReview(d.id, { version: d.version });
    s.completeReview(d.id, true, "OK");
    const reviewed = get(s, d.id);
    expect(reviewed).toMatchObject({ technicalReviewPassed: true, reviewNotes: "OK" });

    data(await change(s, reviewed));
    const after = get(s, d.id);
    expect(after.technicalReviewPassed).toBe(false);
    for (const gone of ["reviewNotes", "reviewRequestedAt", "reviewedAt"]) {
      expect(after).not.toHaveProperty(gone);
    }
    expect(after.version).toBe(reviewed.version + 1);
  });

  it("confirms from SUBMITTED only, with the current artifact and version", async () => {
    const s = studio();
    const drafted = await draftWithPreview(s);
    const refuse = async (version: number, artifactId?: string) =>
      (
        await s.confirm(drafted.id, {
          version,
          artifactId: artifactId ?? drafted.currentArtifactId,
        })
      ).status;
    expect(await refuse(drafted.version)).toBe(409); // still a DRAFT
    s.completeReview(drafted.id, true, "OK");
    const submitted = data<Draft>(s.submit(drafted.id, { version: get(s, drafted.id).version }));
    expect(await refuse(submitted.version - 1)).toBe(409); // stale version
    expect(await refuse(submitted.version, uuid(0x7777))).toBe(409); // not the current artifact
    expect(get(s, drafted.id).status).toBe("SUBMITTED");
    expect((await s.confirm(drafted.id, { version: submitted.version })).status).toBe(400);
  });

  it("freezes artifacts and document in an immutable snapshot and answers a repeat", async () => {
    const s = studio();
    const submitted = await submittedDraft(s);
    const body = { version: submitted.version, artifactId: submitted.currentArtifactId };
    const snap = data<Snapshot>(await s.confirm(submitted.id, body));
    expect(snap).toMatchObject({ draftId: submitted.id, artifactId: submitted.currentArtifactId });
    expect(snap.artifacts).toEqual([
      expect.objectContaining({
        artifactId: submitted.currentArtifactId,
        role: "CUSTOMER_PREVIEW",
      }),
    ]);

    // Confirming again, even with a stale version, answers the same snapshot.
    expect(data<Snapshot>(await s.confirm(submitted.id, body))).toEqual(snap);
    expect(data<Snapshot>(s.snapshot(submitted.id))).toEqual(snap);

    // A revision of the design starts from the confirmed document and leaves the snapshot alone.
    const fork = data<Draft>(s.fork(submitted.id));
    data(
      await s.putDocument(fork.id, {
        version: fork.version,
        document: { ...cupDoc(), surfaces: {} },
      }),
    );
    expect(data<Snapshot>(s.snapshot(submitted.id))).toEqual(snap);
    expect(s.snapshot(fork.id).status).toBe(404);
  });

  it("is edited no more once approved: writes need a new draft", async () => {
    const s = studio();
    const submitted = await submittedDraft(s);
    await s.confirm(submitted.id, {
      version: submitted.version,
      artifactId: submitted.currentArtifactId,
    });
    const version = get(s, submitted.id).version;
    expect(s.revise(submitted.id, { version, spec: "x" }).status).toBe(409);
    expect(s.requestReview(submitted.id, { version }).status).toBe(409);
    expect((await s.uploadArtifact(submitted.id, "CUSTOMER_PREVIEW", file(5))).status).toBe(409);
  });

  it("lets the customer ask for changes or withdraw, each back to a DRAFT with the review voided", async () => {
    const s = studio();
    const first = await submittedDraft(s);
    const asked = data<Draft>(
      s.requestChanges(first.id, { version: first.version, reason: "Đổi màu nền" }),
    );
    expect(asked).toMatchObject({
      status: "DRAFT",
      technicalReviewPassed: false,
      reviewNotes: "Đổi màu nền",
    });
    expect(asked).not.toHaveProperty("reviewRequestedAt");
    expect(s.requestChanges(first.id, { version: asked.version, reason: "x" }).status).toBe(409);

    const second = await submittedDraft(s);
    const withdrawn = data<Draft>(
      s.withdraw(second.id, { version: second.version, reason: "Nhầm" }),
    );
    expect(withdrawn).toMatchObject({ status: "DRAFT", technicalReviewPassed: false });
    expect(withdrawn).not.toHaveProperty("reviewNotes");
    expect(s.withdraw(second.id, { version: withdrawn.version, reason: "x" }).status).toBe(409);
  });

  it("refuses a blank reason, an over-long one and a stale version", async () => {
    const s = studio();
    const d = await submittedDraft(s);
    for (const reason of ["  ", "x".repeat(2001)]) {
      expect(s.requestChanges(d.id, { version: d.version, reason }).status).toBe(400);
      expect(s.withdraw(d.id, { version: d.version, reason }).status).toBe(400);
    }
    expect(s.requestChanges(d.id, { version: d.version - 1, reason: "x" }).status).toBe(409);
    expect(s.withdraw(d.id, { version: d.version - 1, reason: "x" }).status).toBe(409);
  });

  it("forks only an APPROVED design into a new DRAFT that keeps the document and its images, not the artifacts", async () => {
    const s = studio();
    const d = await draftWithPreview(s);
    expect(s.fork(d.id).status).toBe(409);

    const fork = data<Draft>(s.fork(MOCK_DESIGN_IDS.approvedCup));
    expect(fork).toMatchObject({
      status: "DRAFT",
      version: 0,
      parentSnapshotId: MOCK_DESIGN_IDS.snapshot,
    });
    expect(fork.id).not.toBe(MOCK_DESIGN_IDS.approvedCup);
    expect(fork).not.toHaveProperty("currentArtifactId");
    expect(data<unknown[]>(s.listArtifacts(fork.id))).toEqual([]);
    // It starts from the confirmed snapshot's document, at its own version.
    const parent = data<DocRecord>(s.getDocument(MOCK_DESIGN_IDS.approvedCup));
    expect(data<DocRecord>(s.getDocument(fork.id))).toMatchObject({
      designId: fork.id,
      version: 0,
      checksum: parent.checksum,
      document: parent.document,
    });
  });

  it("carries the images into the fork: same ids and metadata, the fork's own scope, the same bytes", async () => {
    const s = studio();
    const approved = MOCK_DESIGN_IDS.approvedCup;
    const source = data<Stored[]>(s.listAssets(approved));
    expect(source.map((a) => a.assetId)).toEqual([MOCK_DESIGN_IDS.logoAsset]);

    const fork = data<Draft>(s.fork(approved));
    expect(data<Stored[]>(s.listAssets(fork.id))).toEqual(
      source.map((asset) => ({ ...asset, designId: fork.id })),
    );

    // The forked document's image elements resolve through the fork's own image routes.
    const { document } = data<DocRecord>(s.getDocument(fork.id));
    const referenced = Object.values(document.surfaces)
      .flatMap((surface) => surface.elements as Array<{ type: string; assetId?: string }>)
      .filter((element) => element.type === "image")
      .map((element) => element.assetId);
    expect(referenced).toEqual([MOCK_DESIGN_IDS.logoAsset]);
    for (const assetId of referenced as string[]) {
      const link = data<{ url: string }>(s.assetLink(fork.id, assetId));
      expect(link.url).toBe(data<{ url: string }>(s.assetLink(approved, assetId)).url);
      expect(link.url).toBeTruthy();
    }
    // Another design's image id stays unknown to it.
    expect(s.assetLink(fork.id, uuid(0x4444)).status).toBe(404);
  });

  it("gives a fork the uploaded bytes of the source's images, not a second copy, and no upload key", async () => {
    const s = studio();
    const d = await draftWithPreview(s);
    const asset = data<Stored>(await s.uploadAsset(d.id, file(12), "asset-key-fork"));
    data(s.completeReview(d.id, true, "OK"));
    const submitted = data<Draft>(s.submit(d.id, { version: get(s, d.id).version }));
    data(
      await s.confirm(d.id, {
        version: submitted.version,
        artifactId: submitted.currentArtifactId,
      }),
    );

    const fork = data<Draft>(s.fork(d.id));
    expect(data<Stored[]>(s.listAssets(fork.id)).map((a) => a.assetId)).toEqual([asset.assetId]);
    const url = data<{ url: string }>(s.assetLink(d.id, asset.assetId)).url;
    expect(url).toBe("blob:mock/12");
    expect(data<{ url: string }>(s.assetLink(fork.id, asset.assetId)).url).toBe(url);

    // The copy is not the product of a keyed upload: the source's key replays nothing in the fork.
    const again = data<Stored>(await s.uploadAsset(fork.id, file(12), "asset-key-fork"));
    expect(again.assetId).not.toBe(asset.assetId);
    expect(data<Stored[]>(s.listAssets(fork.id))).toHaveLength(2);
    // And the source keeps exactly what it had.
    expect(data<Stored[]>(s.listAssets(d.id)).map((a) => a.assetId)).toEqual([asset.assetId]);
  });

  it("logs every decision, newest first", async () => {
    const s = studio();
    const d = await submittedDraft(s);
    const { items } = data<Page<{ decision: string; version: number }>>(s.history(d.id));
    expect(items.map((i) => i.decision)).toEqual(["SENT_TO_CUSTOMER", "TECHNICAL_ACCEPTED"]);
    expect(items.map((i) => i.version)).toEqual([d.version, d.version - 1]);
    expect(s.history(d.id, { page: -1 }).status).toBe(400);
    expect(s.history(d.id, { size: 0 }).status).toBe(400);
  });
});

describe("listing", () => {
  it("seeds an approved 12oz design with a snapshot and a draft kraft-bag design with a document", () => {
    const s = studio();
    expect(get(s, MOCK_DESIGN_IDS.approvedCup)).toMatchObject({
      status: "APPROVED",
      sku: "CUP-PAPER-12OZ-WHT",
      templateCode: "CUP12-BODY",
      customerId: CUSTOMER,
      ownerUserId: USER,
    });
    expect(data<Snapshot>(s.snapshot(MOCK_DESIGN_IDS.approvedCup)).id).toBe(
      MOCK_DESIGN_IDS.snapshot,
    );
    expect(get(s, MOCK_DESIGN_IDS.draftBag)).toMatchObject({ status: "DRAFT", sku: "BAG-KRAFT-M" });
    for (const id of [MOCK_DESIGN_IDS.approvedCup, MOCK_DESIGN_IDS.draftBag]) {
      const { document } = data<{
        document: {
          surfaces: Record<string, { elements: unknown[]; background: { kind: string } }>;
        };
      }>(s.getDocument(id));
      const surfaces = Object.values(document.surfaces);
      expect(surfaces.some((x) => x.elements.length > 0 || x.background.kind !== "none")).toBe(
        true,
      );
    }
  });

  it("lists the caller's designs newest created first and pages from zero", async () => {
    const s = studio();
    const created = await startCup(s);
    const page = data<Page<Draft>>(s.list());
    expect(page).toMatchObject({ page: 0, size: 20, totalElements: 3, hasNext: false });
    expect(page.items.map((d) => d.id)).toEqual([
      created.id,
      MOCK_DESIGN_IDS.draftBag,
      MOCK_DESIGN_IDS.approvedCup,
    ]);

    const first = data<Page<Draft>>(s.list({ page: "0", size: "2" }));
    expect(first.items).toHaveLength(2);
    expect(first.hasNext).toBe(true);
    expect(data<Page<Draft>>(s.list({ page: "1", size: "2" })).items.map((d) => d.id)).toEqual([
      MOCK_DESIGN_IDS.approvedCup,
    ]);
  });

  it("filters by status and refuses what the BE refuses", () => {
    const s = studio();
    const approved = data<Page<Draft>>(s.list({ status: "APPROVED" }));
    expect(approved.items.map((d) => d.id)).toEqual([MOCK_DESIGN_IDS.approvedCup]);
    expect(data<Page<Draft>>(s.list({ status: "SUBMITTED" })).items).toEqual([]);
    expect(s.list({ status: "NOPE" }).status).toBe(400);
    expect(s.list({ page: -1 }).status).toBe(400);
    expect(s.list({ size: 0 }).status).toBe(400);
    expect(s.list({ size: 201 }).status).toBe(400);
  });
});

describe("customer images (P4) and artifacts", () => {
  it("stores an image with its natural size and answers a link", async () => {
    const s = studio();
    const d = await startCup(s);
    const asset = data<Stored>(await s.uploadAsset(d.id, file(12), "asset-key-01"));
    expect(asset).toMatchObject({ widthPx: 1200, heightPx: 800, originalName: "logo.png" });
    expect(data<Stored[]>(s.listAssets(d.id))).toHaveLength(1);

    const link = data<{ url: string; expiresAt: string }>(s.assetLink(d.id, asset.assetId));
    expect(link.url).toBe("blob:mock/12");
    expect(Date.parse(link.expiresAt)).toBeGreaterThan(T0 + 4 * 60_000);
    expect(s.assetLink(d.id, uuid(0x6666)).status).toBe(404);
    // An image is not a change to the design: no new version, no review reset.
    expect(get(s, d.id).version).toBe(0);
  });

  it("answers 415 for an SVG upload and 413 over the limit", async () => {
    const s = studio();
    const d = await startCup(s);
    const svg = await s.uploadAsset(d.id, file(8, "image/svg+xml", "logo.svg"), "asset-key-02");
    expect([svg.status, errorCode(svg)]).toEqual([415, "UNSUPPORTED_MEDIA_TYPE"]);
    const pdf = await s.uploadAsset(d.id, file(8, "application/pdf", "a.pdf"), "asset-key-03");
    expect(pdf.status).toBe(415);
    const big = await s.uploadAsset(d.id, new OversizedBlob(20 * 1024 * 1024 + 1, "image/png"));
    expect([big.status, errorCode(big)]).toEqual([413, "PAYLOAD_TOO_LARGE"]);
    expect(data<unknown[]>(s.listAssets(d.id))).toEqual([]);

    // An artifact may be a PDF and goes to 50 MB.
    expect(
      (await s.uploadArtifact(d.id, "PRINT_READY", file(8, "application/pdf", "a.pdf"))).status,
    ).toBe(201);
    expect(
      (
        await s.uploadArtifact(
          d.id,
          "PRINT_READY",
          new OversizedBlob(21 * 1024 * 1024, "image/png"),
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await s.uploadArtifact(
          d.id,
          "PRINT_READY",
          new OversizedBlob(50 * 1024 * 1024 + 1, "image/png"),
        )
      ).status,
    ).toBe(413);
  });

  it("answers 415 for an image that cannot be read", async () => {
    const s = studio({
      readImageSize: async () => {
        throw new Error("decode");
      },
    });
    const d = await startCup(s);
    expect((await s.uploadAsset(d.id, file())).status).toBe(415);
  });

  it("replays an idempotent upload and refuses the key for other bytes", async () => {
    const s = studio();
    const d = await startCup(s);
    const first = data<Stored>(await s.uploadAsset(d.id, file(12), "asset-key-04"));
    const again = data<Stored>(await s.uploadAsset(d.id, file(12), "asset-key-04"));
    expect(again).toEqual(first);
    expect(data<Stored[]>(s.listAssets(d.id))).toHaveLength(1);

    const other = await s.uploadAsset(d.id, file(13), "asset-key-04");
    expect([other.status, errorCode(other)]).toEqual([422, "IDEMPOTENCY_KEY_REUSED"]);
    expect((await s.uploadAsset(d.id, file(12), "asset-key-05")).status).toBe(201);
    expect((await s.uploadAsset(d.id, file(12), "  ")).status).toBe(400);
  });

  it("makes an uploaded preview current, voids the review, and replays without a change", async () => {
    const s = studio();
    const d = await draftWithPreview(s);
    s.completeReview(d.id, true, "OK");
    const reviewed = get(s, d.id);

    const spec = data<Stored>(
      await s.uploadArtifact(d.id, "TECHNICAL_SPEC", file(9), "spec-key-001"),
    );
    expect(spec.role).toBe("TECHNICAL_SPEC");
    expect(get(s, d.id).currentArtifactId).toBe(d.currentArtifactId); // only a preview is "current"

    const replayed = data<Stored>(
      await s.uploadArtifact(d.id, "TECHNICAL_SPEC", file(9), "spec-key-001"),
    );
    expect(replayed).toEqual(spec);
    expect(get(s, d.id).version).toBe(reviewed.version + 1); // the replay changed nothing

    const reused = await s.uploadArtifact(d.id, "TECHNICAL_SPEC", file(10), "spec-key-001");
    expect([reused.status, errorCode(reused)]).toEqual([422, "IDEMPOTENCY_KEY_REUSED"]);

    const preview = data<Stored>(await s.uploadArtifact(d.id, "CUSTOMER_PREVIEW", file(11)));
    const after = get(s, d.id);
    expect([after.currentArtifactId, after.previewArtifactId]).toEqual([
      preview.artifactId,
      preview.artifactId,
    ]);
    expect(data<Stored[]>(s.listArtifacts(d.id)).map((a) => a.artifactId)).toEqual([
      preview.artifactId,
      spec.artifactId,
      d.currentArtifactId,
    ]);
    expect((await s.uploadArtifact(d.id, "SOMETHING", file())).status).toBe(400);
  });

  it("answers an artifact link: the stored file, or the seeded preview", async () => {
    const s = studio();
    const d = await draftWithPreview(s);
    const link = (id: string, artifactId: string) =>
      data<{ url: string }>(s.artifactLink(id, artifactId)).url;
    expect(link(d.id, d.currentArtifactId!)).toBe("blob:mock/8");
    expect(link(MOCK_DESIGN_IDS.approvedCup, MOCK_DESIGN_IDS.preview)).toBe("/logo.png");
    expect(s.artifactLink(d.id, MOCK_DESIGN_IDS.preview).status).toBe(404);
  });
});

describe("customization (P2)", () => {
  interface Customization {
    productId: string;
    kind: string;
    templates: Array<Record<string, unknown>>;
  }

  it("serves the templates of the product's SKUs, leaving null fields out", () => {
    const s = studio();
    const cup = data<Customization>(s.customization("ly-giay-2-lop-12oz"));
    expect(cup).toMatchObject({ productId: P12, kind: "CUSTOMIZABLE" });
    expect(cup.templates).toEqual([
      expect.objectContaining({
        code: "CUP12-BODY",
        sku: "CUP-PAPER-12OZ-WHT",
        minDpi: 150,
        colorMode: "CMYK",
      }),
    ]);
    expect(cup.templates[0]).not.toHaveProperty("maxColors");
    expect(cup.templates[0]).not.toHaveProperty("allowedFontCodes");

    const bag = data<Customization>(s.customization("tui-giay-kraft"));
    expect(bag.templates.map((t) => t.code)).toEqual(["BAGM-4F", "BAGL-4F"]);
    expect(bag.templates[0]).toMatchObject({ maxColors: 4 });
  });

  it("is 409 PRODUCT_NOT_CUSTOMIZABLE for a standard product and 404 for an unknown one", () => {
    const s = studio();
    const standard = s.customization("nap-ly-90mm");
    expect([standard.status, errorCode(standard)]).toEqual([409, "PRODUCT_NOT_CUSTOMIZABLE"]);
    expect(s.customization("khong-co").status).toBe(404);
  });

  it("knows the seeded catalogue when no lookup is given", () => {
    const s = createMockDesignStudio({ userId: USER, customerId: CUSTOMER });
    const tui = data<Customization>(s.customization("tui-giay-kraft"));
    expect(tui.templates).toHaveLength(2);
    expect(s.customization("nap-ly-90mm").status).toBe(409);
    expect(s.customization("khong-co").status).toBe(404);
  });
});
