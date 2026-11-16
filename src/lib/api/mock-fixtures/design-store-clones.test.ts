import { describe, expect, it } from "vitest";

import { emptyDocument } from "@/features/product-design/engine/document/factory";
import type { DesignDocument } from "@/features/product-design/engine/document/schema";

import type { DesignDto, MockResult } from "./design-rows";
import {
  MOCK_BLOCKED_SKU,
  MOCK_SKU_WITHOUT_PRINT_CONFIG,
  printConfigFor,
  type PrintConfigRow,
} from "./design-print-configs";
import { createMemoryStorage } from "./design-storage";
import { createDesignMockStore, type DesignMockDeps } from "./design-store";

const uuid = (n: number) => `c10e0000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const T0 = Date.UTC(2026, 10, 12, 8, 0, 0);
const CUP8 = { productSlug: "ly-giay-2-lop-8oz", sku: "CUP-PAPER-8OZ-WHT" };
const KRAFT8 = "CUP-PAPER-8OZ-KRAFT";

function makeStore(extra: Partial<DesignMockDeps> = {}) {
  let ids = 0;
  let clock = T0;
  return createDesignMockStore({
    storage: createMemoryStorage(),
    now: () => new Date((clock += 1000)),
    newId: () => uuid(0x4000 + ids++),
    readImageSize: async () => ({ widthPx: 1200, heightPx: 800 }),
    toUrl: (key) => `blob:test/${key}`,
    ...extra,
  });
}
type Store = Awaited<ReturnType<typeof makeStore>>;

interface Asset {
  assetId: string;
  originalName: string;
  designId: string;
}
interface CloneResult {
  design: DesignDto;
  notInProject: string | null;
}

const data = <T>(result: MockResult) => (result.data as { data: T }).data;
const refusal = (result: MockResult) => [
  result.status,
  (result.data as { errorCode: string }).errorCode,
];

const imageElement = (assetId: string, id = "img-1") => ({
  type: "image" as const,
  id,
  name: "Logo",
  hidden: false,
  locked: false,
  opacity: 1,
  placement: { u: 60, v: 20, rotationDeg: 0, scale: 1 },
  assetId,
  naturalWidthPx: 1200,
  naturalHeightPx: 800,
  widthMm: 30,
  heightMm: 20,
  flipX: false,
  flipY: false,
});

/** The document of `sku`'s template, with `assetIds` placed on its first surface. */
function documentFor(slug: string, sku: string, assetIds: string[] = []): DesignDocument {
  const document = emptyDocument(printConfigFor(slug, sku)!.template);
  const [code] = Object.keys(document.surfaces) as (keyof DesignDocument["surfaces"])[];
  document.surfaces[code!]!.elements = assetIds.map((assetId, i) =>
    imageElement(assetId, `img-${i}`),
  );
  return document;
}

async function draft(store: Store, projectId?: string, config = CUP8) {
  const result = await store.create({ ...config, name: "Ly", ...(projectId ? { projectId } : {}) });
  expect(result.status).toBe(201);
  return data<DesignDto>(result);
}

async function upload(store: Store, designId: string, name = "logo.png") {
  const file = new File([new Uint8Array(64).fill(7)], name, { type: "image/png" });
  const result = await store.uploadAsset(designId, file, name, `key-${name}`);
  expect(result.status).toBe(201);
  return data<Asset>(result);
}

const clone = (store: Store, id: string, variantSku: string, document: unknown, key?: string) =>
  store.clone(id, { variantSku, document }, key);

const assetsOf = async (store: Store, designId: string) =>
  data<Asset[]>(await store.listAssets(designId));

describe("POST /designs/{id}/clones", () => {
  it("makes a DRAFT of the other variant with the sent document and its history", async () => {
    const store = await makeStore();
    const source = await draft(store);
    const result = await clone(store, source.id, KRAFT8, documentFor(CUP8.productSlug, KRAFT8));
    expect(result.status).toBe(201);
    const { design, notInProject } = data<CloneResult>(result);
    expect(design).toMatchObject({
      status: "DRAFT",
      version: 0,
      variant: { sku: KRAFT8 },
      product: { slug: CUP8.productSlug },
      projectId: null,
      sourceSnapshotId: null,
    });
    expect(design.id).not.toBe(source.id);
    expect(notInProject).toBeNull();
    const record = data<{ document: DesignDocument }>(await store.getDocument(design.id));
    expect(record.document.sku).toBe(KRAFT8);
    expect(data<{ type: string }[]>(await store.history(design.id)).map((e) => e.type)).toEqual([
      "CREATED",
    ]);
    // The source is untouched.
    expect(data<DesignDto>(await store.get(source.id))).toMatchObject({ version: source.version });
  });

  it("refuses another product, the same variant, one without a print config, or a blocked one", async () => {
    const blocked = (slug: string, sku: string): PrintConfigRow | null => {
      const config = printConfigFor(slug, sku);
      return config && sku === KRAFT8 ? { ...config, variantStatus: "BLOCKED" } : config;
    };
    const store = await makeStore({ printConfigFor: blocked });
    const cup = await draft(store);
    const bag = await draft(store, undefined, {
      productSlug: "tui-giay-kraft",
      sku: "BAG-KRAFT-M",
    });

    const otherProduct = documentFor("ly-giay-2-lop-12oz", "CUP-PAPER-12OZ-WHT");
    expect(refusal(await clone(store, cup.id, "CUP-PAPER-12OZ-WHT", otherProduct))).toEqual([
      422,
      "VARIANT_NOT_ELIGIBLE",
    ]);
    expect(
      refusal(await clone(store, cup.id, CUP8.sku, documentFor(CUP8.productSlug, CUP8.sku))),
    ).toEqual([422, "VARIANT_NOT_ELIGIBLE"]);
    const bagDocument = documentFor("tui-giay-kraft", "BAG-KRAFT-M");
    expect(refusal(await clone(store, bag.id, MOCK_SKU_WITHOUT_PRINT_CONFIG, bagDocument))).toEqual(
      [422, "VARIANT_NOT_ELIGIBLE"],
    );
    expect(
      refusal(await clone(store, cup.id, KRAFT8, documentFor(CUP8.productSlug, KRAFT8))),
    ).toEqual([422, "VARIANT_NOT_ELIGIBLE"]);
    expect(refusal(await clone(store, cup.id, MOCK_BLOCKED_SKU, {}))).toEqual([
      422,
      "VARIANT_NOT_ELIGIBLE",
    ]);
    // Nothing was made: the two seeded drafts and these two.
    expect(data<{ drafts: number }>(await store.draftCount()).drafts).toBe(4);
  });

  it("an unknown source is 404; a blank variant or a foreign document is 422", async () => {
    const store = await makeStore();
    const source = await draft(store);
    const doc = documentFor(CUP8.productSlug, KRAFT8);
    expect(refusal(await clone(store, "nope", KRAFT8, doc))).toEqual([404, "NOT_FOUND"]);
    expect(refusal(await clone(store, source.id, "  ", doc))).toEqual([422, "VALIDATION_FAILED"]);
    // The document must be the target template's, like a saved one.
    expect(
      refusal(await clone(store, source.id, KRAFT8, documentFor(CUP8.productSlug, CUP8.sku))),
    ).toEqual([422, "VALIDATION_FAILED"]);
    expect(refusal(await clone(store, source.id, KRAFT8, { nonsense: true }))).toEqual([
      422,
      "VALIDATION_FAILED",
    ]);
  });

  it("copies the images the document uses and points the new document at the copies", async () => {
    const store = await makeStore();
    const source = await draft(store);
    const logo = await upload(store, source.id, "logo.png");
    const other = await upload(store, source.id, "unused.png");

    const result = await clone(
      store,
      source.id,
      KRAFT8,
      documentFor(CUP8.productSlug, KRAFT8, [logo.assetId, logo.assetId]),
    );
    const { design } = data<CloneResult>(result);

    const copies = await assetsOf(store, design.id);
    expect(copies.map((a) => a.originalName)).toEqual(["logo.png"]); // used twice, copied once
    expect(copies[0]!.assetId).not.toBe(logo.assetId);
    expect(copies[0]!.designId).toBe(design.id);

    const { document } = data<{ document: DesignDocument }>(await store.getDocument(design.id));
    const ids = Object.values(document.surfaces).flatMap((s) =>
      (s?.elements ?? []).flatMap((e) => (e.type === "image" ? [e.assetId] : [])),
    );
    expect(ids).toEqual([copies[0]!.assetId, copies[0]!.assetId]);
    // The copy has its own bytes: a link can be made for it.
    expect((await store.assetLink(design.id, copies[0]!.assetId)).status).toBe(200);

    // The source keeps its images, under their own ids.
    expect((await assetsOf(store, source.id)).map((a) => a.assetId).sort()).toEqual(
      [logo.assetId, other.assetId].sort(),
    );
  });

  it("refuses an image that belongs to another design", async () => {
    const store = await makeStore();
    const source = await draft(store);
    const elsewhere = await draft(store);
    const foreign = await upload(store, elsewhere.id);
    const document = documentFor(CUP8.productSlug, KRAFT8, [foreign.assetId]);
    expect(refusal(await clone(store, source.id, KRAFT8, document))).toEqual([
      422,
      "VALIDATION_FAILED",
    ]);
    expect(await assetsOf(store, elsewhere.id)).toHaveLength(1);
  });

  it("joins the project of the source when it is ACTIVE and has room", async () => {
    const store = await makeStore();
    const project = data<{ id: string }>(await store.createProject({ name: "Quán Hoa" }));
    const source = await draft(store, project.id);
    const { design, notInProject } = data<CloneResult>(
      await clone(store, source.id, KRAFT8, documentFor(CUP8.productSlug, KRAFT8)),
    );
    expect(notInProject).toBeNull();
    expect(design.projectId).toBe(project.id);
    expect(design.project).toMatchObject({ id: project.id, status: "ACTIVE" });
    expect(data<{ type: string }[]>(await store.history(design.id)).map((e) => e.type)).toEqual([
      "CREATED",
      "ADDED_TO_PROJECT",
    ]);
    expect(data<{ designCount: number }>(await store.getProject(project.id)).designCount).toBe(2);
  });

  it("stays out of a full project and says PROJECT_FULL", async () => {
    const store = await makeStore();
    const project = data<{ id: string }>(await store.createProject({ name: "Quán Hoa" }));
    const source = await draft(store, project.id);
    for (let i = 1; i < 20; i += 1) await draft(store, project.id);
    const { design, notInProject } = data<CloneResult>(
      await clone(store, source.id, KRAFT8, documentFor(CUP8.productSlug, KRAFT8)),
    );
    expect(notInProject).toBe("PROJECT_FULL");
    expect(design.projectId).toBeNull();
    expect(data<{ designCount: number }>(await store.getProject(project.id)).designCount).toBe(20);
  });

  it("stays out of a closed project and says PROJECT_ARCHIVED", async () => {
    const store = await makeStore();
    const project = data<{ id: string; version: number }>(
      await store.createProject({ name: "Quán Hoa" }),
    );
    const source = await draft(store, project.id);
    expect((await store.archiveProject(project.id, { version: project.version })).status).toBe(200);
    const { design, notInProject } = data<CloneResult>(
      await clone(store, source.id, KRAFT8, documentFor(CUP8.productSlug, KRAFT8)),
    );
    expect(notInProject).toBe("PROJECT_ARCHIVED");
    expect(design.projectId).toBeNull();
  });

  it("is 409 DRAFT_LIMIT at 50 drafts", async () => {
    const store = await makeStore();
    const source = await draft(store);
    const drafts = data<{ drafts: number }>(await store.draftCount()).drafts;
    for (let i = drafts; i < 50; i += 1) await draft(store);
    expect(
      refusal(await clone(store, source.id, KRAFT8, documentFor(CUP8.productSlug, KRAFT8))),
    ).toEqual([409, "DRAFT_LIMIT"]);
  });

  it("refuses a document of another template even when its sku is right", async () => {
    const store = await makeStore();
    const source = await draft(store);
    const document = { ...documentFor(CUP8.productSlug, KRAFT8), templateCode: "OTHER-TEMPLATE" };
    expect(refusal(await clone(store, source.id, KRAFT8, document))).toEqual([
      422,
      "VALIDATION_FAILED",
    ]);
  });

  describe("Idempotency-Key (R-E7)", () => {
    it("answers a replay with the first copy: no second draft, no second set of images", async () => {
      const store = await makeStore();
      const project = data<{ id: string }>(await store.createProject({ name: "Quán Hoa" }));
      const source = await draft(store, project.id);
      const logo = await upload(store, source.id);
      const document = documentFor(CUP8.productSlug, KRAFT8, [logo.assetId]);
      const drafts = data<{ drafts: number }>(await store.draftCount()).drafts;

      const first = await clone(store, source.id, KRAFT8, document, "key-1");
      const again = await clone(store, source.id, KRAFT8, document, " key-1 ");

      expect(again.status).toBe(201);
      expect(data<CloneResult>(again)).toEqual(data<CloneResult>(first));
      expect(data<{ drafts: number }>(await store.draftCount()).drafts).toBe(drafts + 1);
      const { design } = data<CloneResult>(first);
      expect(await assetsOf(store, design.id)).toHaveLength(1);
      expect(data<{ designCount: number }>(await store.getProject(project.id)).designCount).toBe(2);
      // The key stays in the store, not in the answer.
      expect(design).not.toHaveProperty("clone");
    });

    it("repeats why the copy is in no project", async () => {
      const store = await makeStore();
      const project = data<{ id: string; version: number }>(
        await store.createProject({ name: "Quán Hoa" }),
      );
      const source = await draft(store, project.id);
      await store.archiveProject(project.id, { version: project.version });
      const document = documentFor(CUP8.productSlug, KRAFT8);
      await clone(store, source.id, KRAFT8, document, "key-1");
      const again = data<CloneResult>(await clone(store, source.id, KRAFT8, document, "key-1"));
      expect(again.notInProject).toBe("PROJECT_ARCHIVED");
    });

    it("refuses the key of another variant (422), and makes a copy per request without a key", async () => {
      const store = await makeStore();
      const source = await draft(store);
      const document = documentFor(CUP8.productSlug, KRAFT8);
      await clone(store, source.id, KRAFT8, document, "key-1");
      expect(
        refusal(await clone(store, source.id, "CUP-PAPER-8OZ-WHT", document, "key-1")),
      ).toEqual([422, "IDEMPOTENCY_KEY_REUSED"]);

      const a = data<CloneResult>(await clone(store, source.id, KRAFT8, document));
      const b = data<CloneResult>(await clone(store, source.id, KRAFT8, document));
      expect(a.design.id).not.toBe(b.design.id);
    });
  });
});
