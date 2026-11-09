import { describe, expect, it, vi } from "vitest";

import { emptyDocument } from "@/features/product-design/engine/document/factory";
import type { DesignDocument } from "@/features/product-design/engine/document/schema";
import { sha256Hex } from "@/features/product-design/engine/export/checksum";
import type { PreflightIssue } from "@/features/product-design/engine/preflight/types";

import { seedMockCatalog } from "./catalog";
import {
  MOCK_BLOCKED_SKU,
  MOCK_PRINT_CONFIGS,
  MOCK_SKU_WITHOUT_CARTON_SPEC,
  MOCK_SKU_WITHOUT_PRINT_CONFIG,
  printConfigFor,
  type PrintConfigRow,
} from "./design-print-configs";
import type {
  DesignAssetDto,
  DesignDocumentRecordDto,
  DesignDto,
  DesignEventDto,
  DesignFileDto,
  MockResult,
} from "./design-rows";
import { MOCK_DESIGN_IDS } from "./design-seed";
import { createMemoryStorage, type DesignMockStorage } from "./design-storage";
import { createDesignMockStore, type DesignMockDeps } from "./design-store";

const uuid = (n: number) => `5e5e0000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const T0 = Date.UTC(2026, 10, 9, 8, 0, 0);
const CUP12 = { productSlug: "ly-giay-2-lop-12oz", sku: "CUP-PAPER-12OZ-WHT" };
const slugOf = (sku: string) =>
  seedMockCatalog().find((p) => p.variants.some((v) => v.sku === sku))!.slug;

function makeStore(extra: Partial<DesignMockDeps> = {}) {
  let ids = 0;
  let clock = T0;
  return createDesignMockStore({
    storage: createMemoryStorage(),
    now: () => new Date((clock += 1000)),
    newId: () => uuid(0x1000 + ids++),
    readImageSize: async () => ({ widthPx: 1200, heightPx: 800 }),
    toUrl: (key) => `blob:test/${key}`,
    ...extra,
  });
}

const data = <T>(result: MockResult) => (result.data as { data: T }).data;
const errorOf = (result: MockResult) =>
  result.data as { errorCode: string; details?: { issues?: PreflightIssue[] } };

/** The status and error code of a refused call, in one comparable value. */
const refusal = (result: MockResult) => [result.status, errorOf(result).errorCode];

const png = (bytes = 64, name = "logo.png") =>
  new File([new Uint8Array(bytes).fill(7)], name, { type: "image/png" });

const text = (id: string): DesignDocument["surfaces"][keyof DesignDocument["surfaces"]] => ({
  background: { kind: "none" },
  elements: [
    {
      id,
      type: "text",
      name: "Chữ",
      hidden: false,
      locked: false,
      opacity: 1,
      placement: { u: 60, v: 50, rotationDeg: 0, scale: 1 },
      content: "Nhà Mình",
      fontCode: "be-vietnam-pro",
      sizePt: 24,
      color: "#112233",
      align: "center",
      bold: false,
      italic: false,
      letterSpacingEm: 0,
      lineHeight: 1.2,
    },
  ],
});

const image = (id: string, assetId: string) => ({
  id,
  type: "image" as const,
  name: "Logo",
  hidden: false,
  locked: false,
  opacity: 1,
  placement: { u: 60, v: 50, rotationDeg: 0, scale: 1 },
  assetId,
  naturalWidthPx: 1200,
  naturalHeightPx: 800,
  widthMm: 30,
  heightMm: 20,
  flipX: false,
  flipY: false,
});

/** The three files of a submission and the SHA-256 of each, as the browser sends them. */
async function bundle(seed = "v1") {
  const files = {
    PRINT_READY: new File([`print ${seed}`], "print-ready.pdf", { type: "application/pdf" }),
    CUSTOMER_PREVIEW: new File([`preview ${seed}`], "preview.png", { type: "image/png" }),
    TECHNICAL_SPEC: new File([`spec ${seed}`], "technical-spec.pdf", { type: "application/pdf" }),
  };
  const hash = async (file: Blob) => sha256Hex(new Uint8Array(await file.arrayBuffer()));
  const checksums = {
    PRINT_READY: await hash(files.PRINT_READY),
    CUSTOMER_PREVIEW: await hash(files.CUSTOMER_PREVIEW),
    TECHNICAL_SPEC: await hash(files.TECHNICAL_SPEC),
  };
  return { files, checksums };
}

const PASS = { result: "Pass", issues: [] };

type Store = Awaited<ReturnType<typeof makeStore>>;

async function design(store: Store, id: string) {
  return data<DesignDto>(await store.get(id));
}

async function submitPassing(store: Store, id: string, seed?: string) {
  const { version } = await design(store, id);
  return store.submit(id, { version, preflight: PASS, ...(await bundle(seed)) });
}

async function createCup(store: Store, name = "Ly quán") {
  const result = await store.create({ ...CUP12, name });
  expect(result.status).toBe(201);
  return data<DesignDto>(result);
}

/** Puts a document with one text element on the design's first surface (a created design is empty). */
async function fillDocument(store: Store, id: string) {
  const record = data<DesignDocumentRecordDto>(await store.getDocument(id));
  const [code] = Object.keys(record.document.surfaces) as Array<keyof DesignDocument["surfaces"]>;
  const document = {
    ...record.document,
    surfaces: { ...record.document.surfaces, [code!]: text("t1") },
  };
  const saved = await store.putDocument(id, { version: record.version, document });
  expect(saved.status).toBe(200);
}

describe("design mock store", () => {
  it("create needs a print config: unknown sku of a known product → 422 PRINT_CONFIG_MISSING; MOCK_SKU_WITHOUT_PRINT_CONFIG → 422; blocked variant → 422 VARIANT_UNAVAILABLE", async () => {
    const store = await makeStore();

    expect(
      refusal(await store.create({ productSlug: CUP12.productSlug, sku: "CUP-NOPE", name: "A" })),
    ).toEqual([422, "PRINT_CONFIG_MISSING"]);
    expect(
      refusal(
        await store.create({ productSlug: CUP12.productSlug, sku: "BAG-KRAFT-M", name: "A" }),
      ),
    ).toEqual([422, "PRINT_CONFIG_MISSING"]);
    expect(
      refusal(
        await store.create({
          productSlug: slugOf(MOCK_SKU_WITHOUT_PRINT_CONFIG),
          sku: MOCK_SKU_WITHOUT_PRINT_CONFIG,
          name: "A",
        }),
      ),
    ).toEqual([422, "PRINT_CONFIG_MISSING"]);
    expect(
      refusal(
        await store.create({
          productSlug: slugOf(MOCK_BLOCKED_SKU),
          sku: MOCK_BLOCKED_SKU,
          name: "A",
        }),
      ),
    ).toEqual([422, "VARIANT_UNAVAILABLE"]);
    expect(data<{ drafts: number }>(await store.draftCount()).drafts).toBe(2);
  });

  it("create returns DRAFT version 0, projectId null, document = the template's empty document, history [CREATED]", async () => {
    const store = await makeStore();

    const created = await createCup(store, "  Ly quán Nhà Mình  ");

    expect(created).toEqual({
      id: expect.any(String),
      name: "Ly quán Nhà Mình",
      status: "DRAFT",
      product: { slug: CUP12.productSlug, title: "Ly giấy 2 lớp 12oz" },
      variant: { sku: CUP12.sku, label: CUP12.sku },
      version: 0,
      projectId: null,
      sourceSnapshotId: null,
      lastReturn: null,
      previewUrl: null,
      createdAt: created.createdAt,
      updatedAt: created.createdAt,
      submittedAt: null,
      approvedAt: null,
      approval: null,
    });
    const record = data<DesignDocumentRecordDto>(await store.getDocument(created.id));
    expect(record).toMatchObject({ designId: created.id, version: 0 });
    expect(record.document).toEqual(emptyDocument(MOCK_PRINT_CONFIGS[CUP12.sku]!.template));
    expect(record.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(data<DesignEventDto[]>(await store.history(created.id))).toEqual([
      { type: "CREATED", at: created.createdAt, version: 0, note: null },
    ]);
    expect(await design(store, created.id)).toEqual(created);
  });

  it("create refuses a blank or 201-character name and a missing product or SKU (422)", async () => {
    const store = await makeStore();
    expect(refusal(await store.create({ ...CUP12, name: "   " }))).toEqual([
      422,
      "VALIDATION_FAILED",
    ]);
    expect(refusal(await store.create({ ...CUP12, name: "x".repeat(201) }))).toEqual([
      422,
      "VALIDATION_FAILED",
    ]);
    expect(refusal(await store.create({ sku: CUP12.sku, name: "A" }))).toEqual([
      422,
      "VALIDATION_FAILED",
    ]);
    expect((await store.create({ ...CUP12, name: "x".repeat(200) })).status).toBe(201);
  });

  it("the 51st DRAFT → 409 DRAFT_LIMIT; ARCHIVED and APPROVED do not count; revise also checks the limit", async () => {
    const store = await makeStore();
    // The seed has one design per status: two of them are DRAFT.
    expect(data(await store.draftCount())).toEqual({ drafts: 2, limit: 50 });

    const created: DesignDto[] = [];
    for (let i = 0; i < 48; i += 1) created.push(await createCup(store, `Ly ${i}`));
    expect(data(await store.draftCount())).toEqual({ drafts: 50, limit: 50 });

    expect(refusal(await store.create({ ...CUP12, name: "Ly 51" }))).toEqual([409, "DRAFT_LIMIT"]);
    expect(refusal(await store.revise(MOCK_DESIGN_IDS.approved))).toEqual([409, "DRAFT_LIMIT"]);

    expect((await store.remove(created[0]!.id, { version: 0 })).status).toBe(200);
    expect(data(await store.draftCount())).toEqual({ drafts: 49, limit: 50 });
    expect((await store.revise(MOCK_DESIGN_IDS.approved)).status).toBe(201);
    expect(refusal(await store.create({ ...CUP12, name: "Ly 51" }))).toEqual([409, "DRAFT_LIMIT"]);
  });

  it("putDocument with a stale version → 409 VERSION_CONFLICT; on PENDING_REVIEW → 409 INVALID_STATE; ok → version + 1", async () => {
    const store = await makeStore();
    const id = MOCK_DESIGN_IDS.draft;
    const record = data<DesignDocumentRecordDto>(await store.getDocument(id));
    const pending = data<DesignDocumentRecordDto>(await store.getDocument(MOCK_DESIGN_IDS.pending));

    expect(
      refusal(
        await store.putDocument(id, { version: record.version + 1, document: record.document }),
      ),
    ).toEqual([409, "VERSION_CONFLICT"]);
    expect(
      refusal(
        await store.putDocument(MOCK_DESIGN_IDS.pending, {
          version: pending.version,
          document: pending.document,
        }),
      ),
    ).toEqual([409, "INVALID_STATE"]);
    expect(
      refusal(
        await store.putDocument(id, {
          version: record.version,
          document: { ...record.document, templateCode: "OTHER" },
        }),
      ),
    ).toEqual([422, "VALIDATION_FAILED"]);

    const changed = {
      ...record.document,
      surfaces: { ...record.document.surfaces, BACK: text("b1") },
    };
    const saved = await store.putDocument(id, { version: record.version, document: changed });

    expect(saved.status).toBe(200);
    expect(data<DesignDocumentRecordDto>(saved)).toMatchObject({
      designId: id,
      version: record.version + 1,
      document: changed,
    });
    expect((await design(store, id)).version).toBe(record.version + 1);
    expect(data<DesignDocumentRecordDto>(await store.getDocument(id)).document).toEqual(changed);
  });

  it("rename trims, refuses empty and 201 characters (422), only on DRAFT", async () => {
    const store = await makeStore();
    const id = MOCK_DESIGN_IDS.draft;
    const { version } = await design(store, id);

    expect(refusal(await store.rename(id, { name: "   ", version }))).toEqual([
      422,
      "VALIDATION_FAILED",
    ]);
    expect(refusal(await store.rename(id, { name: "x".repeat(201), version }))).toEqual([
      422,
      "VALIDATION_FAILED",
    ]);
    expect(refusal(await store.rename(id, { name: "A", version: version + 3 }))).toEqual([
      409,
      "VERSION_CONFLICT",
    ]);
    const pending = await design(store, MOCK_DESIGN_IDS.pending);
    expect(
      refusal(await store.rename(pending.id, { name: "A", version: pending.version })),
    ).toEqual([409, "INVALID_STATE"]);

    const renamed = data<DesignDto>(await store.rename(id, { name: "  Túi mới  ", version }));
    expect(renamed).toMatchObject({ name: "Túi mới", version: version + 1 });
    const longest = await store.rename(id, { name: "x".repeat(200), version: version + 1 });
    expect(data<DesignDto>(longest).name).toHaveLength(200);
  });

  it("uploadAsset refuses a type outside fileRules.formats and a file over maxFileSizeMb (422 FILE_REJECTED), stores nothing", async () => {
    const memory = createMemoryStorage();
    const putKeys: string[] = [];
    const storage: DesignMockStorage = {
      ...memory,
      putBlob: async (key, blob) => {
        putKeys.push(key);
        await memory.putBlob(key, blob);
      },
    };
    const store = await makeStore({ storage });
    const id = MOCK_DESIGN_IDS.draft;
    const before = data<DesignAssetDto[]>(await store.listAssets(id));
    putKeys.length = 0;

    const gif = new File([new Uint8Array(10)], "a.gif", { type: "image/gif" });
    expect(refusal(await store.uploadAsset(id, gif))).toEqual([422, "FILE_REJECTED"]);
    const huge = new File([new Uint8Array(50 * 1024 * 1024 + 1)], "big.png", { type: "image/png" });
    expect(refusal(await store.uploadAsset(id, huge))).toEqual([422, "FILE_REJECTED"]);
    const unreadable = await makeStore({
      storage,
      readImageSize: () => Promise.reject(new Error("not an image")),
    });
    expect(refusal(await unreadable.uploadAsset(id, png()))).toEqual([422, "FILE_REJECTED"]);

    expect(data<DesignAssetDto[]>(await store.listAssets(id))).toEqual(before);
    expect(putKeys).toEqual([]);

    const pending = MOCK_DESIGN_IDS.pending;
    expect(refusal(await store.uploadAsset(pending, png()))).toEqual([409, "INVALID_STATE"]);

    const uploaded = await store.uploadAsset(id, png(64, "logo.png"), undefined, "key-1");
    expect(uploaded.status).toBe(201);
    const asset = data<DesignAssetDto>(uploaded);
    expect(asset).toMatchObject({
      designId: id,
      originalName: "logo.png",
      contentType: "image/png",
      widthPx: 1200,
      heightPx: 800,
      sizeBytes: 64,
    });
    expect(asset.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(putKeys).toEqual([`asset/${asset.assetId}`]);
    // The same key with the same file answers the first upload again.
    expect(data(await store.uploadAsset(id, png(64, "logo.png"), undefined, "key-1"))).toEqual(
      asset,
    );
    expect(data<DesignAssetDto[]>(await store.listAssets(id))[0]).toEqual(asset);
    expect(data(await store.assetLink(id, asset.assetId))).toEqual({
      url: `blob:test/asset/${asset.assetId}`,
      expiresAt: expect.any(String),
    });
  });

  it("submit: stale version 409; missing file 422; preflight result Fail 422 PREFLIGHT_FAILED; hasCartonSpec false 422 PREFLIGHT_FAILED with NO_CARTON_SPEC; ok → PENDING_REVIEW, submittedAt set, history SUBMITTED_FOR_REVIEW, files(id) lists 3 roles with sha256", async () => {
    const store = await makeStore();
    const id = MOCK_DESIGN_IDS.draft;
    const { version } = await design(store, id);
    const { files, checksums } = await bundle();

    expect(
      refusal(await store.submit(id, { version: version + 1, preflight: PASS, files, checksums })),
    ).toEqual([409, "VERSION_CONFLICT"]);
    const { TECHNICAL_SPEC: _missing, ...twoFiles } = files;
    expect(
      refusal(await store.submit(id, { version, preflight: PASS, files: twoFiles, checksums })),
    ).toEqual([422, "FILE_REJECTED"]);
    expect(
      refusal(
        await store.submit(id, {
          version,
          preflight: PASS,
          files,
          checksums: { ...checksums, PRINT_READY: "0".repeat(64) },
        }),
      ),
    ).toEqual([422, "FILE_REJECTED"]);

    const issue: PreflightIssue = {
      ruleId: "DPI_BELOW_MIN",
      level: "fail",
      message: "Ảnh có độ phân giải thấp.",
      surfaceCode: "FRONT",
      elementId: "el-bag-1",
    };
    const failed = await store.submit(id, {
      version,
      preflight: { result: "Fail", issues: [issue] },
      files,
      checksums,
    });
    expect(refusal(failed)).toEqual([422, "PREFLIGHT_FAILED"]);
    expect(errorOf(failed).details?.issues).toEqual([issue]);

    const noCarton = data<DesignDto>(
      await store.create({
        productSlug: slugOf(MOCK_SKU_WITHOUT_CARTON_SPEC),
        sku: MOCK_SKU_WITHOUT_CARTON_SPEC,
        name: "Ly kraft",
      }),
    );
    await fillDocument(store, noCarton.id);
    const refused = await submitPassing(store, noCarton.id);
    expect(refusal(refused)).toEqual([422, "PREFLIGHT_FAILED"]);
    expect(errorOf(refused).details?.issues).toEqual([
      expect.objectContaining({ ruleId: "NO_CARTON_SPEC", level: "fail" }),
    ]);
    expect((await design(store, noCarton.id)).status).toBe("DRAFT");

    expect((await design(store, id)).status).toBe("DRAFT");
    const submitted = await store.submit(id, { version, preflight: PASS, files, checksums });
    expect(submitted.status).toBe(200);
    const after = data<DesignDto>(submitted);
    expect(after).toMatchObject({ status: "PENDING_REVIEW", version: version + 1 });
    expect(after.submittedAt).toEqual(after.updatedAt);
    expect(after.previewUrl).toBe(`blob:test/file/${id}/CUSTOMER_PREVIEW`);
    expect(data<DesignEventDto[]>(await store.history(id)).at(-1)).toEqual({
      type: "SUBMITTED_FOR_REVIEW",
      at: after.submittedAt,
      version: version + 1,
      note: null,
    });
    expect(data<DesignFileDto[]>(await store.files(id))).toEqual([
      {
        role: "CUSTOMER_PREVIEW",
        name: "preview.png",
        sizeBytes: files.CUSTOMER_PREVIEW.size,
        sha256: checksums.CUSTOMER_PREVIEW,
        url: `blob:test/file/${id}/CUSTOMER_PREVIEW`,
      },
      {
        role: "PRINT_READY",
        name: "print-ready.pdf",
        sizeBytes: files.PRINT_READY.size,
        sha256: checksums.PRINT_READY,
        url: `blob:test/file/${id}/PRINT_READY`,
      },
      {
        role: "TECHNICAL_SPEC",
        name: "technical-spec.pdf",
        sizeBytes: files.TECHNICAL_SPEC.size,
        sha256: checksums.TECHNICAL_SPEC,
        url: `blob:test/file/${id}/TECHNICAL_SPEC`,
      },
    ]);
    expect(
      refusal(await store.submit(id, { version: version + 1, preflight: PASS, files, checksums })),
    ).toEqual([409, "INVALID_STATE"]);
  });

  it("submit re-checks on the server: empty document → EMPTY_DESIGN, a missing asset → ASSET_INVALID, a variant no longer ACTIVE → VARIANT_UNAVAILABLE", async () => {
    let blocked = false;
    const store = await makeStore({
      printConfigFor: (slug, sku): PrintConfigRow | null => {
        const config = printConfigFor(slug, sku);
        return config && blocked ? { ...config, variantStatus: "BLOCKED" } : config;
      },
    });

    const empty = await createCup(store);
    const refusedEmpty = await submitPassing(store, empty.id);
    expect(refusal(refusedEmpty)).toEqual([422, "PREFLIGHT_FAILED"]);
    expect(errorOf(refusedEmpty).details?.issues).toEqual([
      expect.objectContaining({ ruleId: "EMPTY_DESIGN", level: "fail" }),
    ]);

    // docs 12 §3: a background colour alone is not a design either.
    const blank = data<DesignDocumentRecordDto>(await store.getDocument(empty.id));
    const backgroundOnly = {
      ...blank.document,
      surfaces: { BODY: { background: { kind: "color", color: "#336699" }, elements: [] } },
    };
    await store.putDocument(empty.id, { version: blank.version, document: backgroundOnly });
    const refusedBackground = await submitPassing(store, empty.id);
    expect(refusal(refusedBackground)).toEqual([422, "PREFLIGHT_FAILED"]);
    expect(errorOf(refusedBackground).details?.issues).toEqual([
      expect.objectContaining({ ruleId: "EMPTY_DESIGN", level: "fail" }),
    ]);

    const record = data<DesignDocumentRecordDto>(await store.getDocument(empty.id));
    const withImage = {
      ...record.document,
      surfaces: {
        BODY: { background: { kind: "none" }, elements: [image("img-1", uuid(0xdead))] },
      },
    };
    await store.putDocument(empty.id, { version: record.version, document: withImage });
    const refusedAsset = await submitPassing(store, empty.id);
    expect(errorOf(refusedAsset).details?.issues).toEqual([
      expect.objectContaining({
        ruleId: "ASSET_INVALID",
        level: "fail",
        surfaceCode: "BODY",
        elementId: "img-1",
      }),
    ]);

    blocked = true;
    const refusedVariant = await submitPassing(store, MOCK_DESIGN_IDS.draft);
    expect(errorOf(refusedVariant).details?.issues).toEqual([
      expect.objectContaining({ ruleId: "VARIANT_UNAVAILABLE", level: "fail" }),
    ]);
    // Every refusal is on the record, and the design stays a DRAFT.
    expect(
      data<DesignEventDto[]>(await store.history(empty.id)).map((event) => event.type),
    ).toEqual(["CREATED", "PREFLIGHT_FAILED", "PREFLIGHT_FAILED", "PREFLIGHT_FAILED"]);
    expect((await design(store, MOCK_DESIGN_IDS.draft)).status).toBe("DRAFT");
  });

  it("recordPreflightFailure appends PREFLIGHT_FAILED with the issues, status unchanged", async () => {
    const store = await makeStore();
    const id = MOCK_DESIGN_IDS.draft;
    const before = await design(store, id);
    const issues: PreflightIssue[] = [
      { ruleId: "EMPTY_DESIGN", level: "fail", message: "Thiết kế chưa có nội dung." },
      { ruleId: "NO_CARTON_SPEC", level: "fail", message: "Chưa có quy cách thùng." },
    ];

    const recorded = await store.recordPreflightFailure(id, { version: before.version, issues });

    expect(recorded.status).toBe(201);
    const last = data<DesignEventDto[]>(await store.history(id)).at(-1);
    expect(last).toEqual({
      type: "PREFLIGHT_FAILED",
      at: expect.any(String),
      version: before.version,
      note: "Thiết kế chưa có nội dung.; Chưa có quy cách thùng.",
    });
    expect(data(recorded)).toEqual(last);
    expect(await design(store, id)).toEqual(before);

    // A write like any other: a stale (or unknown, ahead) version is refused and nothing is recorded.
    const events = data<DesignEventDto[]>(await store.history(id));
    for (const version of [before.version - 1, before.version + 1]) {
      expect(refusal(await store.recordPreflightFailure(id, { version, issues }))).toEqual([
        409,
        "VERSION_CONFLICT",
      ]);
    }
    expect(data<DesignEventDto[]>(await store.history(id))).toEqual(events);

    const pending = await design(store, MOCK_DESIGN_IDS.pending);
    expect(
      refusal(await store.recordPreflightFailure(pending.id, { version: pending.version, issues })),
    ).toEqual([409, "INVALID_STATE"]);
  });

  it("history records RETURNED with the reason, APPROVED with snapshot id, SKU code and checksum, ARCHIVED, and DERIVED_FROM_SNAPSHOT on a revision, oldest first", async () => {
    const storage = createMemoryStorage();
    const store = await makeStore({ storage });
    const id = MOCK_DESIGN_IDS.draft;

    await submitPassing(store, id, "first");
    await store.simulateReturn(id, { reason: "Logo bị mờ" });
    await submitPassing(store, id, "second");
    const approved = data<DesignDto>(await store.simulateApprove(id));
    const { snapshotId, skuCode, bundleChecksum } = approved.approval!;

    const events = data<DesignEventDto[]>(await store.history(id));
    expect(events.map((event) => event.type)).toEqual([
      "CREATED",
      "SUBMITTED_FOR_REVIEW",
      "RETURNED",
      "SUBMITTED_FOR_REVIEW",
      "APPROVED",
    ]);
    expect(events[2]!.note).toBe("Logo bị mờ");
    expect(events[4]!.note).toContain(snapshotId);
    expect(events[4]!.note).toContain(skuCode);
    expect(events[4]!.note).toContain(bundleChecksum);
    expect(events.map((event) => event.at)).toEqual([...events.map((event) => event.at)].sort());

    const revision = data<DesignDto>(await store.revise(id));
    expect(data<DesignEventDto[]>(await store.history(revision.id))).toEqual([
      { type: "DERIVED_FROM_SNAPSHOT", at: revision.createdAt, version: 0, note: snapshotId },
    ]);

    await store.remove(revision.id, { version: 0 });
    // An ARCHIVED design is not found any more, so its last event is read from what was saved.
    const saved = (await storage.load())!.rows.history as Array<
      DesignEventDto & { designId: string }
    >;
    expect(saved.filter((event) => event.designId === revision.id).map((e) => e.type)).toEqual([
      "DERIVED_FROM_SNAPSHOT",
      "ARCHIVED",
    ]);
  });

  it("remove: DRAFT → ARCHIVED (404 afterwards, not listed); PENDING_REVIEW → 409 INVALID_STATE", async () => {
    const store = await makeStore();
    const id = MOCK_DESIGN_IDS.draft;
    const { version } = await design(store, id);

    expect(refusal(await store.remove(id, { version: version + 1 }))).toEqual([
      409,
      "VERSION_CONFLICT",
    ]);
    const pending = await design(store, MOCK_DESIGN_IDS.pending);
    expect(refusal(await store.remove(pending.id, { version: pending.version }))).toEqual([
      409,
      "INVALID_STATE",
    ]);

    const removed = await store.remove(id, { version });
    expect(removed.status).toBe(200);
    expect(data<DesignDto>(removed).status).toBe("ARCHIVED");
    expect(refusal(await store.get(id))).toEqual([404, "NOT_FOUND"]);
    expect(refusal(await store.getDocument(id))).toEqual([404, "NOT_FOUND"]);
    expect(refusal(await store.remove(id, { version: version + 1 }))).toEqual([404, "NOT_FOUND"]);
    const listed = data<{ items: DesignDto[] }>(await store.list({ size: 50 })).items;
    expect(listed.map((d) => d.id)).not.toContain(id);
  });

  it("simulateReturn needs PENDING_REVIEW and a 1–2000 character reason; sets DRAFT and lastReturn", async () => {
    const store = await makeStore();
    const id = MOCK_DESIGN_IDS.pending;
    const before = await design(store, id);

    expect(refusal(await store.simulateReturn(MOCK_DESIGN_IDS.draft, { reason: "x" }))).toEqual([
      409,
      "INVALID_STATE",
    ]);
    expect(refusal(await store.simulateReturn(id, { reason: "   " }))).toEqual([
      422,
      "VALIDATION_FAILED",
    ]);
    expect(refusal(await store.simulateReturn(id, { reason: "x".repeat(2001) }))).toEqual([
      422,
      "VALIDATION_FAILED",
    ]);

    const returned = data<DesignDto>(await store.simulateReturn(id, { reason: "x".repeat(2000) }));
    expect(returned).toMatchObject({
      status: "DRAFT",
      version: before.version + 1,
      lastReturn: { reason: "x".repeat(2000), returnedAt: returned.updatedAt },
    });
    // The seeded returned draft carries its reason too.
    expect((await design(store, MOCK_DESIGN_IDS.returned)).lastReturn).toEqual({
      reason: expect.any(String),
      returnedAt: expect.any(String),
    });
  });

  it("simulateApprove: PENDING_REVIEW → APPROVED with approval { snapshotId, skuCode, bundleChecksum }; skuCode matches /^[A-Z0-9-]+-KH\\d+-\\d{3}$/", async () => {
    const store = await makeStore();
    expect(refusal(await store.simulateApprove(MOCK_DESIGN_IDS.draft))).toEqual([
      409,
      "INVALID_STATE",
    ]);

    const approved = data<DesignDto>(await store.simulateApprove(MOCK_DESIGN_IDS.pending));

    expect(approved).toMatchObject({ status: "APPROVED", approvedAt: approved.updatedAt });
    expect(approved.approval).toEqual({
      snapshotId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      skuCode: expect.stringMatching(/^[A-Z0-9-]+-KH\d+-\d{3}$/),
      bundleChecksum: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(refusal(await store.simulateApprove(MOCK_DESIGN_IDS.pending))).toEqual([
      409,
      "INVALID_STATE",
    ]);
  });

  it("revise from APPROVED → new DRAFT with sourceSnapshotId, same document, image elements pointing to copied assets that resolve; from DRAFT → 409", async () => {
    const store = await makeStore();
    expect(refusal(await store.revise(MOCK_DESIGN_IDS.draft))).toEqual([409, "INVALID_STATE"]);

    // An uploaded image on a design that goes all the way to APPROVED.
    const cup = await createCup(store);
    const asset = data<DesignAssetDto>(await store.uploadAsset(cup.id, png()));
    const record = data<DesignDocumentRecordDto>(await store.getDocument(cup.id));
    const document = {
      ...record.document,
      surfaces: {
        BODY: { background: { kind: "none" }, elements: [image("img-1", asset.assetId)] },
      },
    };
    await store.putDocument(cup.id, { version: record.version, document });
    expect((await submitPassing(store, cup.id)).status).toBe(200);
    const approved = data<DesignDto>(await store.simulateApprove(cup.id));

    for (const source of [approved, await design(store, MOCK_DESIGN_IDS.approved)]) {
      const revised = await store.revise(source.id);
      expect(revised.status).toBe(201);
      const revision = data<DesignDto>(revised);
      expect(revision).toMatchObject({
        status: "DRAFT",
        version: 0,
        name: source.name,
        product: source.product,
        variant: source.variant,
        sourceSnapshotId: source.approval!.snapshotId,
        approval: null,
        previewUrl: null,
      });
      const sourceDocument = data<DesignDocumentRecordDto>(await store.getDocument(source.id));
      const copy = data<DesignDocumentRecordDto>(await store.getDocument(revision.id));
      expect(copy.document).toEqual(sourceDocument.document);

      const images = Object.values(copy.document.surfaces).flatMap((surface) =>
        surface!.elements.filter((el) => el.type === "image"),
      );
      expect(images.length).toBeGreaterThan(0);
      const copied = data<DesignAssetDto[]>(await store.listAssets(revision.id));
      for (const el of images) {
        expect(copied.map((a) => a.assetId)).toContain(el.assetId);
        expect(copied.every((a) => a.designId === revision.id)).toBe(true);
        expect((await store.assetLink(revision.id, el.assetId)).status).toBe(200);
      }
    }
  });

  it("a store created again over the same storage sees the same designs, documents and asset blobs", async () => {
    const storage = createMemoryStorage();
    const first = await makeStore({ storage });
    const cup = await createCup(first);
    await fillDocument(first, cup.id);
    const asset = data<DesignAssetDto>(await first.uploadAsset(cup.id, png(32)));

    const second = await makeStore({ storage });

    expect(await design(second, cup.id)).toEqual(await design(first, cup.id));
    expect(data(await second.getDocument(cup.id))).toEqual(data(await first.getDocument(cup.id)));
    expect(data(await second.listAssets(cup.id))).toEqual([asset]);
    expect((await second.assetLink(cup.id, asset.assetId)).status).toBe(200);
    const blob = await storage.getBlob(`asset/${asset.assetId}`);
    expect(Array.from(new Uint8Array(await blob!.arrayBuffer()))).toEqual(
      Array.from(new Uint8Array(32).fill(7)),
    );
    expect(data<{ items: DesignDto[] }>(await second.list()).items).toHaveLength(5);
  });

  it("two stores over one storage (two tabs) see each other's writes; a stale tab answers 409", async () => {
    const storage = createMemoryStorage();
    const tabA = await makeStore({ storage });
    const tabB = await makeStore({ storage });

    const created = await createCup(tabA);
    expect(await design(tabB, created.id)).toEqual(created);

    // Both tabs look at version 0; A saves first, so B's save of version 0 is stale.
    const seen = data<DesignDocumentRecordDto>(await tabB.getDocument(created.id));
    await fillDocument(tabA, created.id);
    expect(
      refusal(
        await tabB.putDocument(created.id, { version: seen.version, document: seen.document }),
      ),
    ).toEqual([409, "VERSION_CONFLICT"]);

    // A submits while B still edits the version it last read: B learns the state changed.
    const current = data<DesignDocumentRecordDto>(await tabB.getDocument(created.id));
    expect((await submitPassing(tabA, created.id)).status).toBe(200);
    expect(
      refusal(
        await tabB.putDocument(created.id, {
          version: current.version,
          document: current.document,
        }),
      ),
    ).toEqual([409, "INVALID_STATE"]);
    expect((await design(tabB, created.id)).status).toBe("PENDING_REVIEW");
  });

  it("a storage that cannot be read answers 500 and is never seeded over; reset starts again", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const memory = createMemoryStorage();
    await memory.save({ rows: { designs: "not a shape this store knows" } });
    const saves: unknown[] = [];
    const recording: DesignMockStorage = {
      ...memory,
      save: async (snapshot) => {
        saves.push(snapshot);
        await memory.save(snapshot);
      },
    };

    const unreadable = await makeStore({
      storage: { ...recording, load: () => Promise.reject(new Error("disk error")) },
    });
    expect(refusal(await unreadable.list())).toEqual([500, "DESIGN_MOCK_FAILED"]);
    expect(refusal(await unreadable.create({ ...CUP12, name: "A" }))).toEqual([
      500,
      "DESIGN_MOCK_FAILED",
    ]);

    const foreign = await makeStore({ storage: recording });
    expect(refusal(await foreign.get(MOCK_DESIGN_IDS.draft))).toEqual([500, "DESIGN_MOCK_FAILED"]);
    expect(saves).toEqual([]);
    expect(errors).toHaveBeenCalledWith(
      expect.stringContaining("[mock-design]"),
      expect.anything(),
    );

    expect((await foreign.reset()).status).toBe(200);
    expect(data(await foreign.draftCount())).toEqual({ drafts: 2, limit: 50 });
    errors.mockRestore();
  });

  it("an asset row whose blob is gone answers assetLink 404 and list keeps the row", async () => {
    const memory = createMemoryStorage();
    let gone = "";
    const storage: DesignMockStorage = {
      ...memory,
      getBlob: (key) => (key === gone ? Promise.resolve(null) : memory.getBlob(key)),
    };
    const store = await makeStore({ storage });
    const id = MOCK_DESIGN_IDS.draft;
    const asset = data<DesignAssetDto>(await store.uploadAsset(id, png()));
    gone = `asset/${asset.assetId}`;

    expect(refusal(await store.assetLink(id, asset.assetId))).toEqual([404, "NOT_FOUND"]);
    expect(data<DesignAssetDto[]>(await store.listAssets(id))).toContainEqual(asset);

    // A document that places it reads as ASSET_INVALID on submit, not a crash.
    const record = data<DesignDocumentRecordDto>(await store.getDocument(id));
    const document = {
      ...record.document,
      surfaces: {
        ...record.document.surfaces,
        BACK: { background: { kind: "none" }, elements: [image("img-9", asset.assetId)] },
      },
    };
    await store.putDocument(id, { version: record.version, document });
    const refused = await submitPassing(store, id);
    expect(errorOf(refused).details?.issues).toEqual([
      expect.objectContaining({ ruleId: "ASSET_INVALID", elementId: "img-9" }),
    ]);
  });

  it("list: newest updated first, 0-based pages, a status filter, ARCHIVED never listed; reset reseeds", async () => {
    const store = await makeStore();
    const seeded = data<{ items: DesignDto[]; totalElements: number }>(await store.list());
    expect(seeded.totalElements).toBe(4);
    expect(seeded.items.map((d) => d.id)).not.toContain(MOCK_DESIGN_IDS.archived);
    expect(refusal(await store.get(MOCK_DESIGN_IDS.archived))).toEqual([404, "NOT_FOUND"]);
    expect(seeded.items.map((d) => d.updatedAt)).toEqual(
      [...seeded.items.map((d) => d.updatedAt)].sort().reverse(),
    );
    expect(seeded.items.find((d) => d.id === MOCK_DESIGN_IDS.approved)).toMatchObject({
      status: "APPROVED",
      previewUrl: expect.any(String),
    });

    const created = await createCup(store);
    const firstPage = data<{
      items: DesignDto[];
      page: number;
      size: number;
      totalElements: number;
      totalPages: number;
      hasNext: boolean;
      hasPrevious: boolean;
    }>(await store.list({ page: "0", size: "2" }));
    expect(firstPage).toMatchObject({
      page: 0,
      size: 2,
      totalElements: 5,
      totalPages: 3,
      hasNext: true,
      hasPrevious: false,
    });
    expect(firstPage.items[0]!.id).toBe(created.id);
    const drafts = data<{ items: DesignDto[] }>(await store.list({ status: "DRAFT" })).items;
    expect(drafts.map((d) => d.status)).toEqual(["DRAFT", "DRAFT", "DRAFT"]);
    expect(data<{ items: DesignDto[] }>(await store.list({ status: "ARCHIVED" })).items).toEqual(
      [],
    );
    expect(refusal(await store.list({ status: "NOPE" }))).toEqual([400, "UNSUPPORTED_PARAMETER"]);

    expect((await store.reset()).status).toBe(200);
    expect(data<{ totalElements: number }>(await store.list()).totalElements).toBe(4);
    expect(refusal(await store.get(created.id))).toEqual([404, "NOT_FOUND"]);
  });

  it("printConfig answers the variant's configuration or 404", async () => {
    const store = await makeStore();
    expect(data(await store.printConfig(CUP12.productSlug, CUP12.sku))).toEqual(
      MOCK_PRINT_CONFIGS[CUP12.sku],
    );
    expect(
      refusal(
        await store.printConfig(
          slugOf(MOCK_SKU_WITHOUT_PRINT_CONFIG),
          MOCK_SKU_WITHOUT_PRINT_CONFIG,
        ),
      ),
    ).toEqual([404, "NOT_FOUND"]);
  });
});
