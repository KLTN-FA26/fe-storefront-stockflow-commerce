import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { printConfigFor } from "@/lib/api/mock-fixtures/design-print-configs";

import { loadDesignSession } from "../components/studio/load-design-session";
import { recordingCtx } from "../engine/__tests__/fixtures";
import { designBackend, draftIn, STUDIO_PRODUCTS } from "./design-backend";
import { TEST_FONTS } from "./fixtures";

/** The offscreen viewers the session's renderer built: there is no WebGL in jsdom. */
const made = vi.hoisted(
  () =>
    [] as {
      setModel: ReturnType<typeof vi.fn>;
      whenModelReady: ReturnType<typeof vi.fn>;
      screenshot: ReturnType<typeof vi.fn>;
      dispose: ReturnType<typeof vi.fn>;
    }[],
);

/** What a new viewer's `whenModelReady` answers (the viewer is built inside `preview`). */
const control = vi.hoisted(() => ({ ready: (): Promise<void> => Promise.resolve() }));

vi.mock("../engine", async (importOriginal) => {
  const engine = await importOriginal<typeof import("../engine")>();
  class FakeViewer {
    readonly setModel = vi.fn();
    readonly setSurfaceTexture = vi.fn();
    readonly resetView = vi.fn();
    readonly dispose = vi.fn();
    readonly whenModelReady = vi.fn(() => control.ready());
    readonly screenshot = vi.fn(async () => new Blob([new Uint8Array([7])]));
    constructor() {
      made.push(this);
    }
  }
  return { ...engine, isWebGLAvailable: () => true, ProductViewer: FakeViewer };
});

vi.setConfig({ testTimeout: 20_000 });

const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const SAMPLE = printConfigFor("ly-giay-2-lop-12oz", "CUP-PAPER-12OZ-WHT")!.model3d;

beforeEach(() => {
  made.length = 0;
  control.ready = () => Promise.resolve();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((id: string) =>
    id === "2d" ? (recordingCtx().ctx as unknown as CanvasRenderingContext2D) : null,
  );
});
afterEach(() => vi.restoreAllMocks());

describe("a design session and the .glb of its print configuration", () => {
  it("carries the file into the preview, which waits for the model before the screenshot", async () => {
    const { store } = await designBackend();
    const id = await draftIn(store, STUDIO_PRODUCTS.cup);
    const session = await loadDesignSession(newClient(), id, TEST_FONTS);
    expect(SAMPLE).not.toBeNull();
    expect(session.model3d).toEqual(SAMPLE);

    let swap!: () => void;
    control.ready = () => new Promise<void>((done) => (swap = done));
    const pending = session.exportRenderer.preview(1024);
    const viewer = made[0]!;
    // The viewer was built and `setModel` called synchronously with the file.
    expect(viewer.setModel).toHaveBeenCalledWith(expect.anything(), expect.anything(), SAMPLE);
    await vi.waitFor(() => expect(viewer.whenModelReady).toHaveBeenCalled());
    expect(viewer.screenshot).not.toHaveBeenCalled();

    swap();
    expect([...(await pending)]).toEqual([7]);
    expect(viewer.dispose).toHaveBeenCalled();
  });

  it("has no file and no wait for a variant without one", async () => {
    const { store } = await designBackend();
    const id = await draftIn(store, STUDIO_PRODUCTS.bag);
    const session = await loadDesignSession(newClient(), id, TEST_FONTS);

    expect(session.model3d ?? null).toBeNull();
    await session.exportRenderer.preview(1024);

    const viewer = made[0]!;
    expect(viewer.setModel).toHaveBeenCalledWith(expect.anything(), expect.anything(), null);
    expect(viewer.whenModelReady).not.toHaveBeenCalled();
    expect(viewer.screenshot).toHaveBeenCalled();
  });

  it("an abort ends the wait at once and disposes the offscreen viewer", async () => {
    const { store } = await designBackend();
    const id = await draftIn(store, STUDIO_PRODUCTS.cup);
    const session = await loadDesignSession(newClient(), id, TEST_FONTS);
    const cancel = new AbortController();

    control.ready = () => new Promise<void>(() => undefined); // never settles
    const pending = session.exportRenderer.preview(1024, cancel.signal);
    const viewer = made[0]!;
    await vi.waitFor(() => expect(viewer.whenModelReady).toHaveBeenCalled());
    expect(viewer.dispose).not.toHaveBeenCalled();

    cancel.abort();

    await expect(pending).rejects.toBe(cancel.signal.reason);
    expect(viewer.dispose).toHaveBeenCalled();
    expect(viewer.screenshot).not.toHaveBeenCalled();
  });
});
