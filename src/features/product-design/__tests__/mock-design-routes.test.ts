import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { activateMockAdapter } from "@/lib/api/mock-adapter";
import { MOCK_PRINT_CONFIGS } from "@/lib/api/mock-fixtures/design-print-configs";
import { MOCK_DESIGN_IDS } from "@/lib/api/mock-fixtures/design-seed";

import {
  getDesign,
  getDesignDocument,
  getDesignHistory,
  getDraftCount,
  getPrintConfig,
  listDesignAssets,
  listDesignFiles,
  listDesigns,
} from "../api";

// What the app serves with the design mock on: the route table `registerAllMockRoutes` sets up
// (its own seeded store; memory storage in jsdom), read through the feature's API layer, so a
// drift between the app's mock wiring and the zod schemas fails here, not in a screen.
const originalAdapter = api.defaults.adapter;

beforeAll(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(Math, "random").mockReturnValue(0.06); // no simulated 5% error, the shortest latency
  activateMockAdapter();
});
afterAll(() => {
  vi.restoreAllMocks();
  if (originalAdapter) api.defaults.adapter = originalAdapter;
});

describe("the app's design mock, read through the feature's API layer", () => {
  it("serves every seeded design with its history, document, images and files", async () => {
    const [page, count] = await Promise.all([listDesigns({ page: 1, size: 20 }), getDraftCount()]);
    expect(page).toMatchObject({ page: 1, totalElements: 4 });
    expect(count).toEqual({ drafts: 2, limit: 50 });

    const ids = page.items.map((d) => d.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        MOCK_DESIGN_IDS.draft,
        MOCK_DESIGN_IDS.returned,
        MOCK_DESIGN_IDS.pending,
        MOCK_DESIGN_IDS.approved,
      ]),
    );
    const reads = await Promise.all(
      ids.map(async (id) => {
        const [design, history, record, assets, files] = await Promise.all([
          getDesign(id),
          getDesignHistory(id),
          getDesignDocument(id),
          listDesignAssets(id),
          listDesignFiles(id),
        ]);
        return { design, history, record, assets, files };
      }),
    );
    for (const { design, history, record } of reads) {
      expect(record.designId).toBe(design.id);
      expect(history[0]?.type).toMatch(/^(CREATED|DERIVED_FROM_SNAPSHOT)$/);
    }
    const approved = reads.find((r) => r.design.id === MOCK_DESIGN_IDS.approved)!;
    expect(approved.assets.map((a) => a.assetId)).toEqual([MOCK_DESIGN_IDS.logoAsset]);
    expect(approved.files.map((f) => f.role)).toEqual([
      "CUSTOMER_PREVIEW",
      "PRINT_READY",
      "TECHNICAL_SPEC",
    ]);
  });

  it("serves a print configuration for every variant the mock can design", async () => {
    const configs = await Promise.all(
      Object.values(MOCK_PRINT_CONFIGS).map((c) => getPrintConfig(c.product.slug, c.sku)),
    );
    expect(configs.map((c) => c.sku)).toEqual(Object.keys(MOCK_PRINT_CONFIGS));
  });

  it("says through GET /__mock/storage whether the mock's data survives a reload", async () => {
    // Memory storage in jsdom (no IndexedDB): the simulation panel warns the data is lost on reload.
    const { data } = await api.get<unknown>("/__mock/storage");
    expect(data).toEqual({ persistent: false });
  });
});
