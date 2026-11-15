import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MOCK_PRINT_CONFIGS,
  MOCK_SKU_WITHOUT_CARTON_SPEC,
  printConfigFor,
} from "@/lib/api/mock-fixtures/design-print-configs";
import { MOCK_DESIGN_IDS } from "@/lib/api/mock-fixtures/design-seed";
import type { DesignMockStore } from "@/lib/api/mock-fixtures/design-store";
import { settle } from "@/test/fake-backend";

import type { ExportRenderer } from "../components/studio/export-renderer";
import {
  loadDesignSession,
  SESSION_LOAD_DEADLINE_MS,
} from "../components/studio/load-design-session";
import { buildSessionBundle, checkSession } from "../components/studio/run-submission";
import type { BundleStep } from "../components/studio/submission-bundle";
import { DocumentChangedError } from "../components/studio/submission-checks";
import {
  emptyDocument,
  mmToPx,
  printDpi,
  type DesignDocument,
  type DesignElement,
} from "../engine";
import { cup12oz, PNG_1x1, recordingCtx, textEl } from "../engine/__tests__/fixtures";
import { designKeys, printConfigKeys } from "../queries";
import type { DesignDocumentRecord } from "../types";
import { cupWithText, designBackend, draftIn, STUDIO_PRODUCTS } from "./design-backend";
import { TEST_FONTS } from "./fixtures";

// These tests prove the runner's steps, not the PDFs: the bundle builder still runs every step,
// but the two PDFs are stand-in bytes (pdf-lib loaded cold is slow under a loaded run). The real
// PDFs are built by `submission-bundle.test.ts` and the engine's tests.
vi.mock("../engine", async (importOriginal) => {
  const engine = await importOriginal<typeof import("../engine")>();
  const pdf = async () => new TextEncoder().encode("%PDF-1.7 stand-in");
  return { ...engine, buildPrintPdf: pdf, buildSheetPdf: pdf };
});

// Each load reads the design mock a few times (~0.2 s a request).
vi.setConfig({ testTimeout: 20_000 });

beforeEach(() => {
  // jsdom has no canvas: `getContext` logs "not implemented" before answering null (no 2D, no WebGL).
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, "fonts");
});

/** Export rendering stands in for the canvases jsdom lacks: every picture is a 1 × 1 PNG. */
const fakeRenderer = () => ({
  preview: vi.fn<ExportRenderer["preview"]>(async () => PNG_1x1),
  printSurface: vi.fn<ExportRenderer["printSurface"]>(async () => [{ png: PNG_1x1, heightPx: 1 }]),
  specSheet: vi.fn<ExportRenderer["specSheet"]>(async () => PNG_1x1),
  release: vi.fn<ExportRenderer["release"]>(),
});

const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

/** The session of `designId` over a fresh cache, drawing with `renderer`. */
const load = (designId: string, renderer: ExportRenderer = fakeRenderer(), client = newClient()) =>
  loadDesignSession(client, designId, TEST_FONTS, { exportRenderer: renderer });

/** On the 12oz cup body: `u` across the band, half-way down it. */
const textAt = (id: string, u: number, content = "Cà phê", fontCode = "be-vietnam-pro") =>
  textEl(id, { content, fontCode, placement: { u, v: 55, rotationDeg: 0, scale: 1 } });

/** A 12oz cup document whose body holds `elements`. */
function cupDocument(elements: DesignElement[]): DesignDocument {
  const document = emptyDocument(cup12oz);
  document.surfaces.BODY = { background: { kind: "none" }, elements };
  return document;
}

const storedOf = async (store: DesignMockStore, id: string) =>
  settle(await store.getDocument(id)).data as DesignDocumentRecord;

/** Another tab stores a new document of the draft (at `version`). */
const storeElsewhere = async (store: DesignMockStore, id: string, version: number) =>
  settle(
    await store.putDocument(id, { version, document: cupDocument([textAt("x", 120, "Trà")]) }),
  );

/** A draft of the approved 12oz cup, its logo image placed on the body. */
async function cupWithLogo(store: DesignMockStore) {
  const revision = settle(await store.revise(MOCK_DESIGN_IDS.approved));
  return (revision.data as { id: string }).id;
}

/** Image files answer as `response` says; a decoder that answers a 600 px bitmap. */
function stubImages(response: () => Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => response()),
  );
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({ width: 600, height: 600, close: vi.fn() })),
  );
}

/** Image files that never arrive: each request hangs until its signal aborts it, as `fetch` does. */
function stallImages() {
  const fetchFile = vi.fn(
    (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        signal?.addEventListener("abort", () => reject(signal.reason));
      }),
  );
  vi.stubGlobal("fetch", fetchFile);
  return fetchFile;
}

/** A `document.fonts` whose `load` answers as `loads` says. */
function stubFontSet(loads: (css: string) => Promise<unknown>) {
  const load = vi.fn((css: string, _sample?: string) => loads(css));
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: { load, addEventListener: vi.fn(), removeEventListener: vi.fn() },
  });
  return load;
}

describe("a submission without the studio", () => {
  it("loads a stored design by itself, checks it and draws its three files", async () => {
    const { store } = await designBackend();
    const id = await cupWithText(store);
    const renderer = fakeRenderer();
    const client = newClient();

    const session = await load(id, renderer, client);
    const checked = await checkSession(session);

    const stored = await storedOf(store, id);
    expect(checked.report.result).toBe("Pass");
    expect(checked.document).toEqual(stored.document);
    expect(checked.checksum).toBe(stored.checksum);
    expect(session.editor.store.getState().document).toBe(checked.document);
    expect(session.viewerRef.current).toBeNull(); // no viewer on screen
    // Read through the feature's queries, under their own keys.
    expect(client.getQueryData(designKeys.document(id))).toMatchObject({
      checksum: stored.checksum,
    });
    expect(client.getQueryData(designKeys.detail(id))).toMatchObject({ id, status: "DRAFT" });
    expect(client.getQueryData(designKeys.assets(id))).toEqual([]);
    expect(
      client.getQueryData(printConfigKeys.detail(STUDIO_PRODUCTS.cup.productSlug, cup12oz.sku)),
    ).toMatchObject({ sku: cup12oz.sku });

    const steps: BundleStep[] = [];
    const bundle = await buildSessionBundle(session, checked, (step) => {
      if (steps.at(-1) !== step) steps.push(step);
    });

    expect(Object.keys(bundle).toSorted()).toEqual([
      "CUSTOMER_PREVIEW",
      "PRINT_READY",
      "TECHNICAL_SPEC",
    ]);
    expect(steps).toEqual(["preview", "print", "spec"]);
    expect(renderer.preview).toHaveBeenCalledWith(1600);
    expect(renderer.printSurface).toHaveBeenCalledWith(
      "BODY",
      checked.document,
      mmToPx(1, printDpi(cup12oz.minDpi)),
    );
  });

  it("answers the issues of a failing preflight, and draws nothing", async () => {
    const { store } = await designBackend();
    const id = await draftIn(store, STUDIO_PRODUCTS.cup);
    const renderer = fakeRenderer();

    const { report } = await checkSession(await load(id, renderer));

    expect(report.result).toBe("Fail");
    const fails = report.issues.filter((issue) => issue.level === "fail");
    expect(fails.map((issue) => issue.ruleId)).toEqual(["EMPTY_DESIGN"]);
    expect(renderer.preview).not.toHaveBeenCalled();
  });

  it("checks the variant as its print configuration says (NO_CARTON_SPEC)", async () => {
    const { store } = await designBackend();
    const { product } = MOCK_PRINT_CONFIGS[MOCK_SKU_WITHOUT_CARTON_SPEC]!;
    const id = await draftIn(store, {
      productSlug: product.slug,
      sku: MOCK_SKU_WITHOUT_CARTON_SPEC,
    });

    const { report } = await checkSession(await load(id));

    expect(report.issues.map((issue) => issue.ruleId)).toContain("NO_CARTON_SPEC");
  });

  it("waits until each face of its text loaded or failed; a failed face fails the check", async () => {
    const { store } = await designBackend();
    const id = await draftIn(
      store,
      STUDIO_PRODUCTS.cup,
      cupDocument([textAt("a", 170), textAt("b", 120, "Trà", "lobster")]),
    );
    let finishLobster = () => {};
    const loadFace = stubFontSet((css) =>
      css.includes("Lobster")
        ? new Promise<unknown>((resolve) => (finishLobster = () => resolve([])))
        : Promise.reject(new Error("offline")),
    );

    let loaded = false;
    const loading = load(id).then((session) => {
      loaded = true;
      return session;
    });
    await vi.waitFor(() => expect(loadFace).toHaveBeenCalledTimes(2), { timeout: 3000 });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(loaded).toBe(false); // Lobster has not answered yet

    finishLobster();
    const session = await loading;

    expect(loadFace).toHaveBeenCalledWith(expect.stringContaining("Be Vietnam Pro"), "Tiếng Việt");
    expect(session.fontStatus).toEqual({ "be-vietnam-pro": "error", lobster: "ready" });
    const { report } = await checkSession(session);
    expect(report.result).toBe("Fail");
    const fonts = report.issues.filter((issue) => issue.ruleId === "FONT_NOT_ALLOWED");
    expect(fonts.map((issue) => issue.elementId)).toEqual(["a"]);
  });

  it("loads the images its document places", async () => {
    const { store } = await designBackend();
    const id = await cupWithLogo(store);
    stubImages(() => new Response("png"));
    const logo = MOCK_DESIGN_IDS.logoAsset;

    const session = await load(id);

    expect(session.images.get(logo, "proxy")).toBeDefined();
    expect(session.assetStatus[logo]).toMatchObject({ contentType: "image/png", status: "ready" });
  });

  it("fails the check of an image that does not load (ASSET_INVALID)", async () => {
    const { store } = await designBackend();
    const id = await cupWithLogo(store);
    stubImages(() => new Response(null, { status: 404 }));
    const logo = MOCK_DESIGN_IDS.logoAsset;

    const session = await load(id);
    const { report } = await checkSession(session);

    expect(session.assetStatus[logo]?.status).toBe("error");
    expect(report.issues.map((issue) => issue.ruleId)).toContain("ASSET_INVALID");
  });

  it("release() lets go of the renderer, the decoded images and the layers", async () => {
    const { store } = await designBackend();
    const id = await cupWithLogo(store);
    stubImages(() => new Response("png"));
    const renderer = fakeRenderer();
    const session = await load(id, renderer);
    session.layerCache.set("layer", document.createElement("canvas"));

    session.release();

    expect(renderer.release).toHaveBeenCalledTimes(1);
    expect(session.images.get(MOCK_DESIGN_IDS.logoAsset, "proxy")).toBeUndefined();
    expect(session.layerCache.size).toBe(0);
  });

  it("a released session neither checks nor draws; releasing it again is harmless", async () => {
    const { store } = await designBackend();
    const id = await cupWithText(store);
    const renderer = fakeRenderer();
    const session = await load(id, renderer);
    const checked = await checkSession(session);

    session.release();
    session.release();

    expect(session.released).toBe(true);
    expect(renderer.release).toHaveBeenCalledTimes(1);
    await expect(checkSession(session)).rejects.toThrow("released");
    await expect(buildSessionBundle(session, checked)).rejects.toThrow("released");
    expect(renderer.preview).not.toHaveBeenCalled();
    expect(renderer.printSurface).not.toHaveBeenCalled();
  });

  it("checks only what is stored: a document stored since the load is refused", async () => {
    const { store } = await designBackend();
    const id = await cupWithText(store);
    const session = await load(id);

    await storeElsewhere(store, id, 1);

    await expect(checkSession(session)).rejects.toBeInstanceOf(DocumentChangedError);
  });

  it("draws nothing once the stored document is no longer the checked one", async () => {
    const { store } = await designBackend();
    const id = await cupWithText(store);
    const renderer = fakeRenderer();
    const session = await load(id, renderer);
    const checked = await checkSession(session);

    await storeElsewhere(store, id, 1);

    await expect(buildSessionBundle(session, checked)).rejects.toBeInstanceOf(DocumentChangedError);
    expect(renderer.preview).not.toHaveBeenCalled();
    expect(renderer.printSurface).not.toHaveBeenCalled();
  });

  it("draws only from its own check", async () => {
    const { store } = await designBackend();
    const id = await cupWithText(store);
    const checked = await checkSession(await load(id));
    const renderer = fakeRenderer();

    await expect(buildSessionBundle(await load(id, renderer), checked)).rejects.toThrow();
    expect(renderer.preview).not.toHaveBeenCalled();
  });

  it("refuses a design whose variant has no print configuration any more", async () => {
    let withdrawn = false;
    const { store } = await designBackend({
      printConfigFor: (slug, sku) => (withdrawn ? null : printConfigFor(slug, sku)),
    });
    const id = await cupWithText(store);
    withdrawn = true;

    await expect(load(id)).rejects.toThrow("Quy cách này chưa nhận thiết kế.");
  });

  it("draws on canvases by default: no viewer on screen, so without WebGL the flat front", async () => {
    const { store } = await designBackend();
    const id = await draftIn(store, STUDIO_PRODUCTS.cup);
    const encoded: { width: number; height: number }[] = [];
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((contextId: string) =>
      contextId === "2d" ? (recordingCtx().ctx as unknown as CanvasRenderingContext2D) : null,
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (
      this: HTMLCanvasElement,
      done: BlobCallback,
    ) {
      encoded.push({ width: this.width, height: this.height });
      done(new Blob([PNG_1x1.slice()], { type: "image/png" }));
    });

    const session = await loadDesignSession(newClient(), id, TEST_FONTS);
    const bytes = await session.exportRenderer.preview(1600);

    expect([...bytes]).toEqual([...PNG_1x1]);
    expect(encoded).toEqual([{ width: 1600, height: 1600 }]);
  });

  it("a cancel stops the load at once: it rejects with the abort and stops the downloads", async () => {
    const { store } = await designBackend();
    const id = await cupWithLogo(store);
    const fetchFile = stallImages();
    const cancel = new AbortController();

    const loading = loadDesignSession(newClient(), id, TEST_FONTS, {
      exportRenderer: fakeRenderer(),
      signal: cancel.signal,
    });
    await vi.waitFor(() => expect(fetchFile).toHaveBeenCalled(), { timeout: 3000 });
    cancel.abort();

    expect(await loading.catch((error: unknown) => error)).toBe(cancel.signal.reason);
    expect(fetchFile.mock.calls[0]![1]?.signal?.aborted).toBe(true);
    expect(fetchFile).toHaveBeenCalledTimes(1); // stopped, not tried again with a fresh link
  });

  describe("past the deadline", () => {
    beforeEach(() => {
      // The mock still answers in real time; the test jumps over the deadline.
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("a face that never answers counts as failed, and fails the check (FONT_NOT_ALLOWED)", async () => {
      const { store } = await designBackend();
      const id = await draftIn(store, STUDIO_PRODUCTS.cup, cupDocument([textAt("a", 170)]));
      const loadFace = stubFontSet(() => new Promise<unknown>(() => {}));

      let loaded = false;
      const loading = load(id).then((session) => {
        loaded = true;
        return session;
      });
      await vi.waitFor(() => expect(loadFace).toHaveBeenCalled(), { timeout: 3000 });
      await vi.advanceTimersByTimeAsync(SESSION_LOAD_DEADLINE_MS - 1000);
      expect(loaded).toBe(false); // still waiting for it

      await vi.advanceTimersByTimeAsync(1000);
      const session = await loading;

      expect(session.fontStatus).toEqual({ "be-vietnam-pro": "error" });
      const { report } = await checkSession(session);
      const fonts = report.issues.filter((issue) => issue.ruleId === "FONT_NOT_ALLOWED");
      expect(fonts.map((issue) => issue.elementId)).toEqual(["a"]);
    });

    it("an image whose download never ends counts as failed, its download stopped (ASSET_INVALID)", async () => {
      const { store } = await designBackend();
      const id = await cupWithLogo(store);
      const fetchFile = stallImages();

      const loading = load(id);
      await vi.waitFor(() => expect(fetchFile).toHaveBeenCalled(), { timeout: 3000 });
      await vi.advanceTimersByTimeAsync(SESSION_LOAD_DEADLINE_MS);
      const session = await loading;

      expect(session.assetStatus[MOCK_DESIGN_IDS.logoAsset]?.status).toBe("error");
      expect(fetchFile.mock.calls[0]![1]?.signal?.aborted).toBe(true);
      expect(fetchFile).toHaveBeenCalledTimes(1);
      const { report } = await checkSession(session);
      expect(report.issues.map((issue) => issue.ruleId)).toContain("ASSET_INVALID");
    });
  });
});
