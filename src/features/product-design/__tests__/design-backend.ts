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

import { settle } from "@/test/fake-backend";

import { readImageDimensions } from "../engine/assets/image-header";
import { emptyDocument } from "../engine/document/factory";
import type { DesignDocument } from "../engine/document/schema";
import { sha256Hex } from "../engine/export/checksum";
import { cup12oz, PNG_1x1, textEl } from "../engine/__tests__/fixtures";

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

/** A variant of the mock catalogue that has a print configuration. */
export type StudioProduct = { productSlug: string; sku: string };

/** The variants the studio tests start drafts of. */
export const STUDIO_PRODUCTS = {
  /** The 12oz paper cup: one print area, the body (`CUP12-BODY`). */
  cup: { productSlug: "ly-giay-2-lop-12oz", sku: "CUP-PAPER-12OZ-WHT" },
  /** The kraft bag M: four faces (`BAGM-4F`). */
  bag: { productSlug: "tui-giay-kraft", sku: "BAG-KRAFT-M" },
} as const satisfies Record<string, StudioProduct>;

/**
 * A new draft of `product` made in `store` itself (no request, no latency); with `document`, its
 * stored document becomes that one (the draft is then at version 1). Answers the draft's id.
 */
export async function draftIn(
  store: DesignMockStore,
  product: StudioProduct,
  document?: DesignDocument,
  name = "Thiết kế thử",
): Promise<string> {
  const created = settle(await store.create({ ...product, name }));
  const { id } = created.data as { id: string };
  if (document) settle(await store.putDocument(id, { version: 0, document }));
  return id;
}

/** A cup draft whose body holds the text "Cà phê" (version 1): one that passes the preflight. */
export function cupWithText(store: DesignMockStore): Promise<string> {
  const document: DesignDocument = emptyDocument(cup12oz);
  document.surfaces.BODY = {
    background: { kind: "none" },
    elements: [
      textEl("text", {
        content: "Cà phê",
        placement: { u: 170, v: 55, rotationDeg: 0, scale: 1 },
      }),
    ],
  };
  return draftIn(store, STUDIO_PRODUCTS.cup, document);
}

/**
 * Another tab submits the design: a complete bundle with matching checksums, written in the store
 * itself, so the studio's next read of the design agrees with what a test puts in its cache.
 */
export async function submitElsewhere(store: DesignMockStore, id: string): Promise<void> {
  const { version } = settle(await store.get(id)).data as { version: number };
  const files = {
    CUSTOMER_PREVIEW: new File([PNG_1x1.slice()], "preview.png", { type: "image/png" }),
    PRINT_READY: new File([new Uint8Array([1, 2])], "print-ready.pdf", {
      type: "application/pdf",
    }),
    TECHNICAL_SPEC: new File([new Uint8Array([3, 4])], "technical-spec.pdf", {
      type: "application/pdf",
    }),
  };
  const checksums: Record<string, string> = {};
  for (const [role, file] of Object.entries(files)) {
    checksums[role] = await sha256Hex(new Uint8Array(await file.arrayBuffer()));
  }
  settle(
    await store.submit(id, {
      version,
      preflight: { result: "Pass", issues: [] },
      checksums,
      files,
    }),
  );
}
