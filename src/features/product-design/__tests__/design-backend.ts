import { vi } from "vitest";

import { api } from "@/lib/api/client";
import { activateMockAdapter } from "@/lib/api/mock-adapter";
import { registerDesignMockRoutes } from "@/lib/api/mock-design";
import { createMemoryStorage } from "@/lib/api/mock-fixtures/design-storage";
import {
  createDesignMockStore,
  type DesignMockDeps,
  type DesignMockStore,
} from "@/lib/api/mock-fixtures/design-store";

import { readImageDimensions } from "../engine/assets/image-header";

/**
 * The size of an uploaded image as its header says: jsdom has no `createImageBitmap`, which the
 * mock store would use, and the fixtures (`pngBytes`, …) are headers, not decodable pictures.
 */
async function sizeFromHeader(blob: Blob) {
  const header = readImageDimensions(new Uint8Array(await blob.arrayBuffer()));
  if (!header) throw new Error("Not a readable image");
  return { widthPx: header.width, heightPx: header.height };
}

export type DesignBackend = {
  /**
   * The store behind the routes: a test can read or seed it directly, e.g.
   * `settle(await store.getDocument(id)).data` with `settle` from `@/test/fake-backend`.
   */
  store: DesignMockStore;
  /** Pass-through spies on the client: a test can say which calls were (not) made, and how. */
  get: ReturnType<typeof spyOnGet>;
  post: ReturnType<typeof spyOnPost>;
  put: ReturnType<typeof spyOnPut>;
  patch: ReturnType<typeof spyOnPatch>;
  delete: ReturnType<typeof spyOnDelete>;
};

const spyOnGet = () => vi.spyOn(api, "get");
const spyOnPost = () => vi.spyOn(api, "post");
const spyOnPut = () => vi.spyOn(api, "put");
const spyOnPatch = () => vi.spyOn(api, "patch");
const spyOnDelete = () => vi.spyOn(api, "delete");

/**
 * The design API as the screens get it with the design mock on: the real client and its
 * interceptors, the mock adapter and the app's design route table, over a fresh seeded store in
 * memory (spec 2026-11-09 §5). Uploaded images are sized by their header and linked as
 * `blob:mock/{key}`. Call it in each test (or `beforeEach`): it re-installs the spies an
 * `afterEach(vi.restoreAllMocks)` removed. The mock adapter answers after ~0.2 s of simulated
 * latency, with its 5% random error switched off.
 */
export async function designBackend(
  deps: Omit<DesignMockDeps, "storage"> = {},
): Promise<DesignBackend> {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(Math, "random").mockReturnValue(0.06); // no simulated 5% error, the shortest latency
  activateMockAdapter();
  // An unknown path settles only once `registerAllMockRoutes()` has run, so the routes registered
  // below replace its design routes instead of being replaced by them.
  vi.spyOn(console, "warn").mockImplementationOnce(() => {});
  await api.get("/routes-ready-probe").catch(() => undefined);

  const store = await createDesignMockStore({
    storage: createMemoryStorage(),
    readImageSize: sizeFromHeader,
    toUrl: (key) => `blob:mock/${key}`,
    ...deps,
  });
  registerDesignMockRoutes(store);
  return {
    store,
    get: spyOnGet(),
    post: spyOnPost(),
    put: spyOnPut(),
    patch: spyOnPatch(),
    delete: spyOnDelete(),
  };
}
