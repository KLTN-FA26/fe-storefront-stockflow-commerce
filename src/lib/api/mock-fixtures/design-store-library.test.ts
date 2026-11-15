import { describe, expect, it } from "vitest";

import type { DesignDto, MockResult } from "./design-rows";
import { printConfigFor } from "./design-print-configs";
import { MOCK_DESIGN_IDS } from "./design-seed";
import { createMemoryStorage } from "./design-storage";
import { createDesignMockStore, type DesignMockDeps } from "./design-store";

const uuid = (n: number) => `1b1b0000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const T0 = Date.UTC(2026, 10, 12, 8, 0, 0);
const CUP12 = { productSlug: "ly-giay-2-lop-12oz", sku: "CUP-PAPER-12OZ-WHT" };

function makeStore(extra: Partial<DesignMockDeps> = {}) {
  let ids = 0;
  let clock = T0;
  return createDesignMockStore({
    storage: createMemoryStorage(),
    now: () => new Date((clock += 1000)),
    newId: () => uuid(0x3000 + ids++),
    readImageSize: async () => ({ widthPx: 1200, heightPx: 800 }),
    toUrl: (key) => `blob:test/${key}`,
    ...extra,
  });
}
type Store = Awaited<ReturnType<typeof makeStore>>;

interface Asset {
  designId: string;
  assetId: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
}
interface LibraryItem {
  id: string;
  kind: "IMAGE" | "TEXT";
  name: string;
  createdAt: string;
  asset?: Omit<Asset, "designId" | "assetId"> & { checksum: string };
  previewUrl?: string | null;
  text?: string;
  style?: Record<string, unknown>;
}

const data = <T>(result: MockResult) => (result.data as { data: T }).data;
const errorOf = (result: MockResult) =>
  result.data as { errorCode: string; details?: Record<string, unknown> };
const refusal = (result: MockResult) => [result.status, errorOf(result).errorCode];

const png = (bytes = 64, name = "logo.png", type = "image/png") =>
  new File([new Uint8Array(bytes).fill(7)], name, { type });

const STYLE = {
  fontCode: "be-vietnam-pro",
  sizePt: 24,
  color: "#112233",
  bold: true,
  italic: false,
  align: "center",
  letterSpacingEm: 0.05,
  lineHeight: 1.2,
  outline: { color: "#FFFFFF", widthMm: 0.5 },
};

async function newProject(store: Store) {
  return data<{ id: string; version: number }>(await store.createProject({ name: "Quán Hoa" }));
}
/** A draft of its own; with `projectId` it joins that project (a library serves its members). */
async function newDraft(store: Store, projectId?: string) {
  const design = data<DesignDto>(await store.create({ ...CUP12, name: "Ly" }));
  if (projectId)
    expect((await store.addToProject(projectId, { designId: design.id })).status).toBe(200);
  return design;
}
async function addImage(store: Store, projectId: string, file = png(), key?: string) {
  const result = await store.uploadLibraryImage(projectId, file, undefined, key);
  expect(result.status).toBe(201);
  return data<LibraryItem>(result);
}
const library = async (store: Store, projectId: string) =>
  data<LibraryItem[]>(await store.listLibrary(projectId));
const projectEvents = async (store: Store, projectId: string) =>
  data<{ type: string; note: string | null }[]>(await store.projectHistory(projectId));

describe("the project library: images", () => {
  it("lists an empty library, then an uploaded image with its asset facts and a preview link", async () => {
    const store = await makeStore();
    const project = await newProject(store);
    expect(await library(store, project.id)).toEqual([]);

    const item = await addImage(store, project.id, png(64, "logo.png"));

    expect(item).toMatchObject({
      kind: "IMAGE",
      name: "logo.png",
      asset: { originalName: "logo.png", contentType: "image/png", sizeBytes: 64 },
      previewUrl: expect.stringContaining("blob:test/"),
    });
    expect(item.asset).toMatchObject({ widthPx: 1200, heightPx: 800 });
    expect(item.asset).not.toHaveProperty("designId");
    expect(await library(store, project.id)).toEqual([item]);
  });

  it("lists the newest item first", async () => {
    const store = await makeStore();
    const project = await newProject(store);
    const first = await addImage(store, project.id, png(8, "a.png"));
    const second = await addImage(store, project.id, png(9, "b.png"));
    const text = data<LibraryItem>(
      await store.saveLibraryText(project.id, { text: "Xin chào", style: STYLE }),
    );

    expect((await library(store, project.id)).map((i) => i.id)).toEqual([
      text.id,
      second.id,
      first.id,
    ]);
  });

  it("answers the same Idempotency-Key and file again, without a second item or event", async () => {
    const store = await makeStore();
    const project = await newProject(store);
    const first = await addImage(store, project.id, png(64), "key-1");
    const again = await addImage(store, project.id, png(64), "key-1");

    expect(again.id).toBe(first.id);
    expect(await library(store, project.id)).toHaveLength(1);
    expect(
      (await projectEvents(store, project.id)).filter((e) => e.type === "ASSET_ADDED"),
    ).toHaveLength(1);
    const other = await store.uploadLibraryImage(project.id, png(65), undefined, "key-1");
    expect(refusal(other)).toEqual([422, "IDEMPOTENCY_KEY_REUSED"]);
  });

  it("refuses a file outside the default rules (PNG or JPEG, 50 MB) and stores nothing", async () => {
    const store = await makeStore({ readImageSize: async () => ({ widthPx: 10, heightPx: 10 }) });
    const project = await newProject(store);

    const gif = png(64, "a.gif", "image/gif");
    expect(refusal(await store.uploadLibraryImage(project.id, gif))).toEqual([
      422,
      "FILE_REJECTED",
    ]);
    const huge = new File([new Uint8Array(50 * 1024 * 1024 + 1)], "big.png", { type: "image/png" });
    expect(refusal(await store.uploadLibraryImage(project.id, huge))).toEqual([
      422,
      "FILE_REJECTED",
    ]);
    const broken = await makeStore({
      readImageSize: async () => {
        throw new Error("not an image");
      },
    });
    const home = await newProject(broken);
    expect(refusal(await broken.uploadLibraryImage(home.id, png()))).toEqual([
      422,
      "FILE_REJECTED",
    ]);

    expect(await library(store, project.id)).toEqual([]);
    expect(await projectEvents(store, project.id)).toHaveLength(1); // PROJECT_CREATED only
  });

  it("is 404 for an unknown project", async () => {
    const store = await makeStore();
    expect(refusal(await store.listLibrary("nope"))).toEqual([404, "NOT_FOUND"]);
    expect(refusal(await store.uploadLibraryImage("nope", png()))).toEqual([404, "NOT_FOUND"]);
  });

  it("copies an image of a design into the library, a second copy of its own", async () => {
    const store = await makeStore();
    const project = await newProject(store);
    const design = await newDraft(store, project.id);
    const asset = data<Asset>(await store.uploadAsset(design.id, png(64, "photo.png")));

    const saved = await store.saveLibraryImageFromDesign(project.id, {
      designId: design.id,
      assetId: asset.assetId,
    });

    expect(saved.status).toBe(201);
    const item = data<LibraryItem>(saved);
    expect(item).toMatchObject({
      kind: "IMAGE",
      name: "photo.png",
      asset: { contentType: "image/png", sizeBytes: 64 },
    });
    expect(item.id).not.toBe(asset.assetId);
  });

  it("copies a seeded image that has a link instead of bytes", async () => {
    const store = await makeStore();
    const project = await newProject(store);
    const approved = MOCK_DESIGN_IDS.approved;
    expect((await store.addToProject(project.id, { designId: approved })).status).toBe(200);
    const [seeded] = data<Asset[]>(await store.listAssets(approved));

    const saved = await store.saveLibraryImageFromDesign(project.id, {
      designId: approved,
      assetId: seeded!.assetId,
    });

    expect(saved.status).toBe(201);
    expect(data<LibraryItem>(saved).previewUrl).toEqual(expect.any(String));
  });

  it("refuses to copy from an unknown design or asset, and a blank body", async () => {
    const store = await makeStore();
    const project = await newProject(store);
    const design = await newDraft(store, project.id);

    expect(
      refusal(await store.saveLibraryImageFromDesign(project.id, { designId: "x", assetId: "y" })),
    ).toEqual([404, "NOT_FOUND"]);
    expect(
      refusal(
        await store.saveLibraryImageFromDesign(project.id, { designId: design.id, assetId: "y" }),
      ),
    ).toEqual([404, "NOT_FOUND"]);
    expect(refusal(await store.saveLibraryImageFromDesign(project.id, {}))).toEqual([
      422,
      "VALIDATION_FAILED",
    ]);
  });
});

describe("the project library: text styles", () => {
  it("saves a text with exactly the style of a text element and names it by its content", async () => {
    const store = await makeStore();
    const project = await newProject(store);

    const saved = await store.saveLibraryText(project.id, {
      text: "  Cà phê Sáng nay có gì mới để thử hôm nay không nhỉ  ",
      style: STYLE,
    });

    expect(saved.status).toBe(201);
    const item = data<LibraryItem>(saved);
    expect(item).toMatchObject({ kind: "TEXT", style: STYLE });
    expect(item.text).toBe("Cà phê Sáng nay có gì mới để thử hôm nay không nhỉ");
    expect(item.name.length).toBeLessThanOrEqual(40);
    expect(item.name.startsWith("Cà phê Sáng")).toBe(true);
  });

  it("refuses a blank text, a missing style field and a style with a field of another shape", async () => {
    const store = await makeStore();
    const project = await newProject(store);
    const { fontCode: _font, ...noFont } = STYLE;

    for (const body of [
      { text: "   ", style: STYLE },
      { style: STYLE },
      { text: "x", style: noFont },
      { text: "x", style: { ...STYLE, sizePt: 0 } },
      { text: "x", style: { ...STYLE, color: "red" } },
      { text: "x" },
    ]) {
      expect(refusal(await store.saveLibraryText(project.id, body))).toEqual([
        422,
        "VALIDATION_FAILED",
      ]);
    }
    expect(await library(store, project.id)).toEqual([]);
  });

  it("keeps no field the style does not define", async () => {
    const store = await makeStore();
    const project = await newProject(store);

    const item = data<LibraryItem>(
      await store.saveLibraryText(project.id, {
        text: "x",
        style: { ...STYLE, id: "t1", content: "other" },
      }),
    );

    expect(Object.keys(item.style!).sort()).toEqual(Object.keys(STYLE).sort());
  });
});

describe("the project library: limits (A-E1)", () => {
  it("takes 30 images and refuses the 31st with LIBRARY_FULL, while a text still fits", async () => {
    const store = await makeStore();
    const project = await newProject(store);
    for (let n = 0; n < 30; n += 1) await addImage(store, project.id, png(10 + n, `i${n}.png`));

    expect(refusal(await store.uploadLibraryImage(project.id, png(99, "extra.png")))).toEqual([
      422,
      "LIBRARY_FULL",
    ]);
    const design = await newDraft(store, project.id);
    const asset = data<Asset>(await store.uploadAsset(design.id, png(64)));
    expect(
      refusal(
        await store.saveLibraryImageFromDesign(project.id, {
          designId: design.id,
          assetId: asset.assetId,
        }),
      ),
    ).toEqual([422, "LIBRARY_FULL"]);
    expect(
      (await store.saveLibraryText(project.id, { text: "còn chỗ", style: STYLE })).status,
    ).toBe(201);
    expect(await library(store, project.id)).toHaveLength(31);
  });

  it("takes 30 text styles and refuses the 31st, while an image still fits", async () => {
    const store = await makeStore();
    const project = await newProject(store);
    for (let n = 0; n < 30; n += 1) {
      expect(
        (await store.saveLibraryText(project.id, { text: `m${n}`, style: STYLE })).status,
      ).toBe(201);
    }

    expect(refusal(await store.saveLibraryText(project.id, { text: "31", style: STYLE }))).toEqual([
      422,
      "LIBRARY_FULL",
    ]);
    expect((await store.uploadLibraryImage(project.id, png())).status).toBe(201);
  });

  it("frees a place when an item is deleted", async () => {
    const store = await makeStore();
    const project = await newProject(store);
    const items: LibraryItem[] = [];
    for (let n = 0; n < 30; n += 1) items.push(await addImage(store, project.id, png(10 + n)));

    expect((await store.deleteLibraryItem(project.id, items[0]!.id)).status).toBe(200);

    expect((await store.uploadLibraryImage(project.id, png(200, "new.png"))).status).toBe(201);
  });

  it("does not count another project's items", async () => {
    const store = await makeStore();
    const one = await newProject(store);
    const two = await newProject(store);
    for (let n = 0; n < 30; n += 1) await addImage(store, one.id, png(10 + n));

    expect((await store.uploadLibraryImage(two.id, png(5))).status).toBe(201);
    expect(await library(store, two.id)).toHaveLength(1);
  });
});

describe("placing a library image into a design", () => {
  it("copies it as a design image of its own, with the library item's facts", async () => {
    const store = await makeStore();
    const project = await newProject(store);
    const design = await newDraft(store, project.id);
    const item = await addImage(store, project.id, png(64, "logo.png"));

    const placed = await store.placeFromLibrary(design.id, { libraryItemId: item.id });

    expect(placed.status).toBe(201);
    const asset = data<Asset>(placed);
    expect(asset).toMatchObject({
      designId: design.id,
      originalName: "logo.png",
      contentType: "image/png",
      sizeBytes: 64,
    });
    expect(asset.assetId).not.toBe(item.id);
    expect(data<Asset[]>(await store.listAssets(design.id)).map((a) => a.assetId)).toEqual([
      asset.assetId,
    ]);
    const link = data<{ url: string }>(await store.assetLink(design.id, asset.assetId));
    expect(link.url).toContain(`asset/${asset.assetId}`);
  });

  it("places the same item twice as two images", async () => {
    const store = await makeStore();
    const project = await newProject(store);
    const design = await newDraft(store, project.id);
    const item = await addImage(store, project.id);

    const a = data<Asset>(await store.placeFromLibrary(design.id, { libraryItemId: item.id }));
    const b = data<Asset>(await store.placeFromLibrary(design.id, { libraryItemId: item.id }));

    expect(a.assetId).not.toBe(b.assetId);
  });

  it("checks the rules of the design's variant: FILE_RULE names the rule that failed", async () => {
    const strict = (slug: string, sku: string) => {
      const config = printConfigFor(slug, sku);
      return config
        ? { ...config, fileRules: { minDpi: 300, formats: ["image/png"], maxFileSizeMb: 1 } }
        : null;
    };
    const store = await makeStore({ printConfigFor: strict });
    const project = await newProject(store);
    const design = await newDraft(store, project.id);
    const jpeg = await addImage(store, project.id, png(64, "photo.jpg", "image/jpeg"));
    const big = await addImage(store, project.id, png(2 * 1024 * 1024, "big.png"));
    const fine = await addImage(store, project.id, png(64, "ok.png"));

    const byFormat = await store.placeFromLibrary(design.id, { libraryItemId: jpeg.id });
    expect(refusal(byFormat)).toEqual([422, "FILE_RULE"]);
    expect(errorOf(byFormat).details).toMatchObject({
      rule: "FORMAT",
      contentType: "image/jpeg",
      formats: ["image/png"],
    });
    const bySize = await store.placeFromLibrary(design.id, { libraryItemId: big.id });
    expect(refusal(bySize)).toEqual([422, "FILE_RULE"]);
    expect(errorOf(bySize).details).toMatchObject({
      rule: "FILE_SIZE",
      sizeBytes: 2 * 1024 * 1024,
      maxFileSizeMb: 1,
    });
    expect(data<Asset[]>(await store.listAssets(design.id))).toEqual([]); // nothing was placed

    expect((await store.placeFromLibrary(design.id, { libraryItemId: fine.id })).status).toBe(201);
  });

  it("is refused for a design that is not a DRAFT, an unknown design, an unknown or text item", async () => {
    const store = await makeStore();
    const project = await newProject(store);
    const item = await addImage(store, project.id);
    const text = data<LibraryItem>(
      await store.saveLibraryText(project.id, { text: "x", style: STYLE }),
    );
    const design = await newDraft(store, project.id);

    expect(
      refusal(await store.placeFromLibrary(MOCK_DESIGN_IDS.pending, { libraryItemId: item.id })),
    ).toEqual([409, "INVALID_STATE"]);
    expect(refusal(await store.placeFromLibrary("nope", { libraryItemId: item.id }))).toEqual([
      404,
      "NOT_FOUND",
    ]);
    expect(refusal(await store.placeFromLibrary(design.id, { libraryItemId: "nope" }))).toEqual([
      404,
      "NOT_FOUND",
    ]);
    expect(refusal(await store.placeFromLibrary(design.id, { libraryItemId: text.id }))).toEqual([
      422,
      "VALIDATION_FAILED",
    ]);
    expect(refusal(await store.placeFromLibrary(design.id, {}))).toEqual([
      422,
      "VALIDATION_FAILED",
    ]);
  });
});

describe("a library serves the designs of its own project (R-E6)", () => {
  it("refuses to place into a design outside the project, or in another one, and places nothing", async () => {
    const store = await makeStore();
    const project = await newProject(store);
    const other = await newProject(store);
    const item = await addImage(store, project.id);
    const loose = await newDraft(store);
    const elsewhere = await newDraft(store, other.id);

    for (const design of [loose, elsewhere]) {
      const refused = await store.placeFromLibrary(design.id, { libraryItemId: item.id });
      expect(refusal(refused)).toEqual([422, "NOT_IN_PROJECT"]);
      expect(data<Asset[]>(await store.listAssets(design.id))).toEqual([]);
    }
  });

  it("places again once the design joins the project, and refuses once it leaves", async () => {
    const store = await makeStore();
    const project = await newProject(store);
    const item = await addImage(store, project.id);
    const design = await newDraft(store);

    await store.addToProject(project.id, { designId: design.id });
    expect((await store.placeFromLibrary(design.id, { libraryItemId: item.id })).status).toBe(201);
    await store.removeFromProject(project.id, design.id);
    expect(refusal(await store.placeFromLibrary(design.id, { libraryItemId: item.id }))).toEqual([
      422,
      "NOT_IN_PROJECT",
    ]);
  });

  it("refuses to copy an image of a design outside the project into the library", async () => {
    const store = await makeStore();
    const project = await newProject(store);
    const loose = await newDraft(store);
    const asset = data<Asset>(await store.uploadAsset(loose.id, png(64)));

    const refused = await store.saveLibraryImageFromDesign(project.id, {
      designId: loose.id,
      assetId: asset.assetId,
    });

    expect(refusal(refused)).toEqual([422, "NOT_IN_PROJECT"]);
    expect(await library(store, project.id)).toEqual([]);
  });
});

describe("retries", () => {
  it("answers an idempotent upload again while the library is full, and refuses a new image", async () => {
    const store = await makeStore();
    const project = await newProject(store);
    const first = await addImage(store, project.id, png(10, "i0.png"), "k-0");
    for (let n = 1; n < 30; n += 1) await addImage(store, project.id, png(10 + n), `k-${n}`);

    const replay = await store.uploadLibraryImage(project.id, png(10, "i0.png"), undefined, "k-0");

    expect(replay.status).toBe(201);
    expect(data<LibraryItem>(replay).id).toBe(first.id);
    expect(await library(store, project.id)).toHaveLength(30);
    expect(
      refusal(await store.uploadLibraryImage(project.id, png(99), undefined, "k-new")),
    ).toEqual([422, "LIBRARY_FULL"]);
  });

  it("places an item twice when a placement is retried: placing is not idempotent", async () => {
    const store = await makeStore();
    const project = await newProject(store);
    const design = await newDraft(store, project.id);
    const item = await addImage(store, project.id);

    const first = data<Asset>(await store.placeFromLibrary(design.id, { libraryItemId: item.id }));
    const retry = data<Asset>(await store.placeFromLibrary(design.id, { libraryItemId: item.id }));

    expect(retry.assetId).not.toBe(first.assetId);
    expect(data<Asset[]>(await store.listAssets(design.id))).toHaveLength(2);
  });
});

describe("deleting a library item (BR-18)", () => {
  it("leaves the image already placed in a design, its bytes and its link", async () => {
    const store = await makeStore();
    const project = await newProject(store);
    const design = await newDraft(store, project.id);
    const item = await addImage(store, project.id);
    const placed = data<Asset>(await store.placeFromLibrary(design.id, { libraryItemId: item.id }));

    const removed = await store.deleteLibraryItem(project.id, item.id);

    expect(removed.status).toBe(200);
    expect(data<LibraryItem>(removed)).toMatchObject({ id: item.id, kind: "IMAGE" });
    expect(await library(store, project.id)).toEqual([]);
    expect(data<Asset[]>(await store.listAssets(design.id)).map((a) => a.assetId)).toEqual([
      placed.assetId,
    ]);
    expect((await store.assetLink(design.id, placed.assetId)).status).toBe(200);
    expect(refusal(await store.placeFromLibrary(design.id, { libraryItemId: item.id }))).toEqual([
      404,
      "NOT_FOUND",
    ]);
  });

  it("leaves a design image the library item was copied from", async () => {
    const store = await makeStore();
    const project = await newProject(store);
    const design = await newDraft(store, project.id);
    const asset = data<Asset>(await store.uploadAsset(design.id, png(64)));
    const item = data<LibraryItem>(
      await store.saveLibraryImageFromDesign(project.id, {
        designId: design.id,
        assetId: asset.assetId,
      }),
    );

    await store.deleteLibraryItem(project.id, item.id);

    expect((await store.assetLink(design.id, asset.assetId)).status).toBe(200);
  });

  it("is 404 for an unknown item or one of another project, and removes a text style", async () => {
    const store = await makeStore();
    const one = await newProject(store);
    const two = await newProject(store);
    const image = await addImage(store, one.id);
    const text = data<LibraryItem>(
      await store.saveLibraryText(one.id, { text: "x", style: STYLE }),
    );

    expect(refusal(await store.deleteLibraryItem(one.id, "nope"))).toEqual([404, "NOT_FOUND"]);
    expect(refusal(await store.deleteLibraryItem(two.id, image.id))).toEqual([404, "NOT_FOUND"]);
    expect(refusal(await store.deleteLibraryItem("nope", image.id))).toEqual([404, "NOT_FOUND"]);
    expect((await store.deleteLibraryItem(one.id, text.id)).status).toBe(200);
    expect((await library(store, one.id)).map((i) => i.id)).toEqual([image.id]);
  });
});

describe("a closed project's library (A-E2)", () => {
  async function closedWithImage() {
    const store = await makeStore();
    const project = await newProject(store);
    const item = await addImage(store, project.id);
    const design = await newDraft(store, project.id); // a member, made before the project closes
    const closed = await store.archiveProject(project.id, { version: project.version });
    expect(closed.status).toBe(200);
    return { store, project, item, design };
  }

  it("refuses adding an image, a copy from a design and a text style", async () => {
    const { store, project, design } = await closedWithImage();
    const asset = data<Asset>(await store.uploadAsset(design.id, png(64)));

    expect(refusal(await store.uploadLibraryImage(project.id, png(70)))).toEqual([
      422,
      "PROJECT_ARCHIVED",
    ]);
    expect(
      refusal(
        await store.saveLibraryImageFromDesign(project.id, {
          designId: design.id,
          assetId: asset.assetId,
        }),
      ),
    ).toEqual([422, "PROJECT_ARCHIVED"]);
    expect(refusal(await store.saveLibraryText(project.id, { text: "x", style: STYLE }))).toEqual([
      422,
      "PROJECT_ARCHIVED",
    ]);
  });

  it("refuses deleting an item, and still lists the library", async () => {
    const { store, project, item } = await closedWithImage();

    expect(refusal(await store.deleteLibraryItem(project.id, item.id))).toEqual([
      409,
      "PROJECT_ARCHIVED",
    ]);
    expect((await library(store, project.id)).map((i) => i.id)).toEqual([item.id]);
  });

  it("still places an item into a design", async () => {
    const { store, item, design } = await closedWithImage();

    const placed = await store.placeFromLibrary(design.id, { libraryItemId: item.id });

    expect(placed.status).toBe(201);
  });
});

describe("the project's history of the library", () => {
  it("records ASSET_ADDED for an image, a copy and a text, and ASSET_REMOVED for a deletion", async () => {
    const store = await makeStore();
    const project = await newProject(store);
    const design = await newDraft(store, project.id);
    const asset = data<Asset>(await store.uploadAsset(design.id, png(64, "photo.png")));

    const image = await addImage(store, project.id, png(64, "logo.png"));
    await store.saveLibraryImageFromDesign(project.id, {
      designId: design.id,
      assetId: asset.assetId,
    });
    const text = data<LibraryItem>(
      await store.saveLibraryText(project.id, { text: "Xin chào", style: STYLE }),
    );
    await store.deleteLibraryItem(project.id, image.id);
    await store.deleteLibraryItem(project.id, text.id);

    const events = await projectEvents(store, project.id);
    expect(events.map((e) => [e.type, e.note])).toEqual([
      ["PROJECT_CREATED", null],
      ["ASSET_ADDED", "logo.png"],
      ["ASSET_ADDED", "photo.png"],
      ["ASSET_ADDED", "Xin chào"],
      ["ASSET_REMOVED", "logo.png"],
      ["ASSET_REMOVED", "Xin chào"],
    ]);
  });

  it("records nothing for a refused add or a placement", async () => {
    const store = await makeStore();
    const project = await newProject(store);
    const design = await newDraft(store, project.id);
    const item = await addImage(store, project.id);
    await store.uploadLibraryImage(project.id, png(5, "a.gif", "image/gif"));
    await store.placeFromLibrary(design.id, { libraryItemId: item.id });

    expect((await projectEvents(store, project.id)).map((e) => e.type)).toEqual([
      "PROJECT_CREATED",
      "ASSET_ADDED",
    ]);
  });
});

describe("a snapshot stored before the library existed", () => {
  it("loads with an empty library", async () => {
    const storage = createMemoryStorage();
    const first = await makeStore({ storage });
    const project = data<{ id: string }>(await first.createProject({ name: "Cũ" }));
    const rows = { ...(await storage.load())!.rows };
    delete rows.library;
    await storage.save({ rows });

    const store = await makeStore({ storage });

    expect(data<unknown[]>(await store.listLibrary(project.id))).toEqual([]);
    expect((await store.uploadLibraryImage(project.id, png())).status).toBe(201);
  });
});
