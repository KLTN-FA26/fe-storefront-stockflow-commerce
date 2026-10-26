import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { activateMockAdapter } from "@/lib/api/mock-adapter";
import { seedMockCatalog } from "@/lib/api/mock-fixtures/catalog";
import { MOCK_DESIGN_IDS } from "@/lib/api/mock-fixtures/designs";

import {
  createDesign,
  forkDesign,
  getArtifactDownloadUrl,
  getAssetDownloadUrl,
  getCustomization,
  getDesign,
  getDesignDocument,
  getDesignHistory,
  getDesignSnapshot,
  listArtifacts,
  listDesignAssets,
  listDesigns,
} from "../api";
import { designPageDtoSchema } from "../schemas";

// What `pnpm dev` with USE_MOCK=true serves for the design studio: the routes `registerAllMockRoutes`
// registers (the default studio, wired to the mock catalogue), read through the feature's own API
// layer, so a contract drift between the mock backend and the zod schemas fails here, not in a screen.
const originalAdapter = api.defaults.adapter;

beforeAll(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(Math, "random").mockReturnValue(0.06); // no simulated 5% error, shortest latency
  activateMockAdapter();
});
afterAll(() => {
  vi.restoreAllMocks();
  if (originalAdapter) api.defaults.adapter = originalAdapter;
});

const product = (slug: string) => seedMockCatalog().find((p) => p.slug === slug)!;

describe("registered mock design routes satisfy the design contract", () => {
  it("answers GET /designs with a page designPageDtoSchema accepts (UUID owner, newest first)", async () => {
    const { data } = await api.get<unknown>("/designs", { params: { page: 0, size: 12 } });
    const page = designPageDtoSchema.parse(data);
    expect(page).toMatchObject({ page: 0, size: 12, totalElements: 2 });
    expect(page.items.map((d) => d.id)).toEqual([
      MOCK_DESIGN_IDS.draftBag,
      MOCK_DESIGN_IDS.approvedCup,
    ]);

    // Through the API layer: the BE's 0-based page is shifted to the screens' 1-based one.
    const approved = await listDesigns({ page: 1, size: 12, status: "APPROVED" });
    expect(approved).toMatchObject({ page: 1, totalElements: 1 });
    expect(approved.items[0]?.id).toBe(MOCK_DESIGN_IDS.approvedCup);
  });

  it("serves a designer's journey: templates of a product, a new design, its document", async () => {
    const cup = product("ly-giay-2-lop-12oz");
    const customization = await getCustomization(cup.slug);
    expect(customization).toMatchObject({ productId: cup.productId, kind: "CUSTOMIZABLE" });
    const template = customization.templates.find((t) => t.sku === "CUP-PAPER-12OZ-WHT")!;

    const draft = await createDesign({
      productId: customization.productId,
      sku: template.sku,
      templateCode: template.code,
      name: "Ly quán A",
    });
    expect(draft).toMatchObject({ status: "DRAFT", productSlug: cup.slug, version: 0 });

    const [loaded, record, list] = await Promise.all([
      getDesign(draft.id),
      getDesignDocument(draft.id),
      listDesigns({ page: 1, size: 12 }),
    ]);
    expect(loaded.id).toBe(draft.id);
    expect(record).toMatchObject({ designId: draft.id, version: 0 });
    expect(list.items[0]?.id).toBe(draft.id);
  });

  it("refuses a standard product the way the catalogue's `kind` says", async () => {
    const lid = product("nap-ly-90mm");
    await expect(getCustomization(lid.slug)).rejects.toMatchObject({
      status: 409,
      code: "PRODUCT_NOT_CUSTOMIZABLE",
    });
    await expect(
      createDesign({
        productId: lid.productId,
        sku: "LID-90MM-BLK",
        templateCode: "LID",
        name: "Nắp",
      }),
    ).rejects.toMatchObject({ status: 409, code: "PRODUCT_NOT_CUSTOMIZABLE" });
  });

  it("serves a confirmed design's history, snapshot, artifacts and download link", async () => {
    const id = MOCK_DESIGN_IDS.approvedCup;
    const [history, snapshot, artifacts, link] = await Promise.all([
      getDesignHistory(id, { page: 1, size: 20 }),
      getDesignSnapshot(id),
      listArtifacts(id),
      getArtifactDownloadUrl(id, MOCK_DESIGN_IDS.preview),
    ]);
    expect(history.items.map((d) => d.decision)).toEqual([
      "CUSTOMER_CONFIRMED",
      "SENT_TO_CUSTOMER",
      "TECHNICAL_ACCEPTED",
    ]);
    expect(snapshot.id).toBe(MOCK_DESIGN_IDS.snapshot);
    expect(artifacts.map((a) => a.artifactId)).toEqual([MOCK_DESIGN_IDS.preview]);
    expect(link.url).toBeTruthy();
  });

  it("forks the confirmed cup with its logo: the forked document's image resolves in the new design", async () => {
    const fork = await forkDesign(MOCK_DESIGN_IDS.approvedCup);
    expect(fork).toMatchObject({ status: "DRAFT", parentSnapshotId: MOCK_DESIGN_IDS.snapshot });

    const [record, assets] = await Promise.all([
      getDesignDocument(fork.id),
      listDesignAssets(fork.id),
    ]);
    const images = Object.values(record.document.surfaces).flatMap((surface) =>
      surface.elements.flatMap((element) => (element.type === "image" ? [element] : [])),
    );
    expect(images.map((image) => image.assetId)).toEqual([MOCK_DESIGN_IDS.logoAsset]);
    expect(assets.map((asset) => [asset.assetId, asset.designId])).toEqual([
      [MOCK_DESIGN_IDS.logoAsset, fork.id],
    ]);
    const link = await getAssetDownloadUrl(fork.id, images[0]!.assetId);
    expect(link.url).toBeTruthy();
  });
});
