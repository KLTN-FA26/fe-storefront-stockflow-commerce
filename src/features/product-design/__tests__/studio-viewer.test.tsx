import { QueryClientProvider } from "@tanstack/react-query";
import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { printConfigFor } from "@/lib/api/mock-fixtures/design-print-configs";
import { MOCK_DESIGN_IDS } from "@/lib/api/mock-fixtures/design-seed";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { DesignStudio } from "../components/studio/design-studio";
import type { StudioServices } from "../components/studio/studio-context";
import { COLOR_DISCLAIMER } from "../components/color-disclaimer";
import { designKeys } from "../queries";
import { cupWithText, designBackend, submitElsewhere } from "./design-backend";
import { TEST_FONTS } from "./fixtures";

/** The viewers the studio built: jsdom has no WebGL, so the engine's viewer is replaced by a fake. */
const built = vi.hoisted(
  () =>
    [] as {
      focusSurface: ReturnType<typeof vi.fn>;
      dispose: ReturnType<typeof vi.fn>;
      setModel: ReturnType<typeof vi.fn>;
      whenModelReady: ReturnType<typeof vi.fn>;
      screenshot: ReturnType<typeof vi.fn>;
      lose(): void;
      fail(): void;
      /** Says what the real viewer's `model3d` event says. */
      emit(state: { status: "loading" | "ready" | "failed"; code?: string }): void;
      /** How many `model3d` listeners are registered right now. */
      listening(): number;
    }[],
);

vi.mock("../engine", async (importOriginal) => {
  const engine = await importOriginal<typeof import("../engine")>();
  class FakeViewer {
    private onLost: (() => void) | undefined;
    private onError: ((error?: unknown) => void) | undefined;
    private readonly onModel3d = new Set<(state?: unknown) => void>();
    readonly focusSurface = vi.fn();
    readonly dispose = vi.fn();
    /** Like the real viewer: a file to load says "loading" at once, inside the call. */
    readonly setModel = vi.fn((_template: unknown, _surfaces: unknown, model3d?: unknown) => {
      if (model3d) this.emit({ status: "loading" });
    });
    readonly whenModelReady = vi.fn(async () => undefined);
    readonly screenshot = vi.fn(async () => new Blob([new Uint8Array([5])]));
    readonly setSurfaceTexture = vi.fn();
    readonly setAutoRotate = vi.fn();
    readonly resetView = vi.fn();
    readonly pick = vi.fn(() => null);
    constructor() {
      built.push(this);
    }
    on(event: string, listener: (value?: unknown) => void) {
      if (event === "contextlost") this.onLost = listener;
      if (event === "error") this.onError = listener;
      if (event === "model3d") {
        this.onModel3d.add(listener);
        return () => void this.onModel3d.delete(listener);
      }
      return () => undefined;
    }
    emit(state: { status: string; code?: string }) {
      for (const listener of [...this.onModel3d]) listener(state);
    }
    listening() {
      return this.onModel3d.size;
    }
    lose() {
      this.onLost?.();
    }
    fail() {
      this.onError?.(new Error("A render failed"));
    }
  }
  return { ...engine, isWebGLAvailable: () => true, ProductViewer: FakeViewer };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

// Each test renders the whole studio over the design mock (~0.2 s a request).
vi.setConfig({ testTimeout: 20_000 });
const OPENED = { timeout: 4000 };

const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "requestFullscreen");
const requestFullscreen = vi.fn(async () => undefined);

beforeEach(() => {
  built.length = 0;
  signIn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  // jsdom has no Fullscreen API.
  Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
    configurable: true,
    value: requestFullscreen,
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  requestFullscreen.mockClear();
  if (original) Object.defineProperty(HTMLElement.prototype, "requestFullscreen", original);
  else delete (HTMLElement.prototype as { requestFullscreen?: unknown }).requestFullscreen;
  signOut();
});

async function openBag() {
  await designBackend();
  renderWithProviders(<DesignStudio designId={MOCK_DESIGN_IDS.draft} fonts={TEST_FONTS} />);
  return screen.findByRole("img", { name: /Mô hình 3D của sản phẩm/ }, OPENED);
}

describe("ViewerHost with WebGL", () => {
  it("puts the whole preview in full screen, colour disclaimer included", async () => {
    const model = await openBag();

    await userEvent.click(screen.getByRole("button", { name: "Toàn màn hình" }));

    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    const shown = requestFullscreen.mock.contexts[0] as HTMLElement;
    expect(shown).toContainElement(model);
    expect(shown).toContainElement(within(shown).getByText(COLOR_DISCLAIMER));
  });

  it("turns the camera to the face chosen in the Mặt in group", async () => {
    await openBag();

    await userEvent.click(screen.getByRole("radio", { name: "Hông trái" }));

    expect(built.at(-1)?.focusSurface).toHaveBeenCalledWith("LEFT");
  });

  it("keeps the viewer it built when the design turns read-only: no new WebGL context", async () => {
    const { store } = await designBackend();
    const id = await cupWithText(store);
    const { client } = renderWithProviders(<DesignStudio designId={id} fonts={TEST_FONTS} />);
    await screen.findByRole("img", { name: /Mô hình 3D của sản phẩm/ }, OPENED);
    const count = built.length;
    const viewer = built.at(-1)!;

    // Another tab submits it; the studio reads it again, as its status poll would.
    await submitElsewhere(store, id);
    await act(() => client.invalidateQueries({ queryKey: designKeys.detail(id) }));
    await screen.findByRole("group", { name: "Bảng" }, OPENED);

    expect(built).toHaveLength(count);
    expect(viewer.dispose).not.toHaveBeenCalled();
  });

  it("falls back to the flat preview when the WebGL context is lost for good", async () => {
    await openBag();
    const viewer = built.at(-1)!;

    act(() => viewer.lose());

    expect(screen.getByText("Preview 3D không khả dụng")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Mô hình 3D/ })).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Xem trước sản phẩm" })).getByText(
        COLOR_DISCLAIMER,
      ),
    ).toBeInTheDocument();
    expect(viewer.dispose).toHaveBeenCalled();
  });

  it("falls back to the flat preview when a render fails", async () => {
    await openBag();
    const viewer = built.at(-1)!;

    act(() => viewer.fail());

    expect(screen.getByText("Preview 3D không khả dụng")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Mô hình 3D/ })).not.toBeInTheDocument();
    expect(viewer.dispose).toHaveBeenCalled();
  });
});

const LOADING = "Đang tải mô hình 3D…";
const FAILED = "Không tải được mô hình 3D, đang dùng mẫu thay thế";
const SAMPLE_MODEL = printConfigFor("ly-giay-2-lop-12oz", "CUP-PAPER-12OZ-WHT")!.model3d;

/** The live region of the 3D card: always there, with the line's text in it only while there is one. */
const previewStatus = () =>
  within(screen.getByRole("region", { name: "Xem trước sản phẩm" })).getByRole("status");

async function openCupWithModel() {
  const { store } = await designBackend();
  const id = await cupWithText(store);
  const view = renderWithProviders(<DesignStudio designId={id} fonts={TEST_FONTS} />);
  await screen.findByRole("img", { name: /Mô hình 3D của sản phẩm/ }, OPENED);
  return { store, id, ...view };
}

/** The studio of another design in the same providers (what a route change renders). */
const studioOf = (client: ReturnType<typeof renderWithProviders>["client"], id: string) => (
  <QueryClientProvider client={client}>
    <NuqsTestingAdapter hasMemory searchParams="">
      <DesignStudio designId={id} fonts={TEST_FONTS} />
    </NuqsTestingAdapter>
  </QueryClientProvider>
);

describe("the status line of a .glb model", () => {
  it("hands the print configuration's file to the viewer, and shows the loading line", async () => {
    await openCupWithModel();
    const viewer = built.at(-1)!;

    expect(SAMPLE_MODEL).toEqual({
      url: "/models/sample-cup-12oz.glb",
      surfaces: [{ printAreaCode: "BODY", meshName: "print:BODY" }],
    });
    expect(viewer.setModel).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      SAMPLE_MODEL,
    );
    expect(previewStatus()).toHaveTextContent(LOADING);
    expect(screen.getByText(LOADING)).toBe(previewStatus());
  });

  it("clears the line when the model is ready, says so when it failed, and again when it reloads", async () => {
    await openCupWithModel();
    const viewer = built.at(-1)!;

    act(() => viewer.emit({ status: "ready" }));
    expect(previewStatus()).toBeEmptyDOMElement(); // the region stays, with nothing in it
    expect(screen.queryByText(LOADING)).not.toBeInTheDocument();
    expect(screen.queryByText(FAILED)).not.toBeInTheDocument();

    act(() => viewer.emit({ status: "failed", code: "LOAD_FAILED" }));
    expect(previewStatus()).toHaveTextContent(FAILED);
    expect(screen.queryByText(LOADING)).not.toBeInTheDocument();

    act(() => viewer.emit({ status: "loading" }));
    expect(screen.getByText(LOADING)).toBeInTheDocument();
    expect(screen.queryByText(FAILED)).not.toBeInTheDocument();
  });

  it("shows no line and gives the viewer no file for a print configuration without one", async () => {
    await openBag();
    const viewer = built.at(-1)!;

    expect(viewer.setModel).toHaveBeenCalledWith(expect.anything(), expect.anything(), null);
    expect(previewStatus()).toBeEmptyDOMElement();
    expect(screen.queryByText(LOADING)).not.toBeInTheDocument();
    expect(screen.queryByText(FAILED)).not.toBeInTheDocument();
  });

  it("does not carry a failure over to a design with no file", async () => {
    const { client, rerender } = await openCupWithModel();
    act(() => built.at(-1)!.emit({ status: "failed" }));
    expect(screen.getByText(FAILED)).toBeInTheDocument();

    rerender(studioOf(client, MOCK_DESIGN_IDS.draft)); // the bag
    await vi.waitFor(() => expect(screen.queryByText(FAILED)).not.toBeInTheDocument(), OPENED);
    await screen.findByRole("img", { name: /Mô hình 3D của sản phẩm/ }, OPENED);
    expect(screen.queryByText(FAILED)).not.toBeInTheDocument();
    expect(screen.queryByText(LOADING)).not.toBeInTheDocument();
  });

  it("starts at loading, not failed, for the next design that has a file", async () => {
    const { store, client, rerender } = await openCupWithModel();
    act(() => built.at(-1)!.emit({ status: "failed" }));
    const next = await cupWithText(store);

    rerender(studioOf(client, next));

    await screen.findByText(LOADING, undefined, OPENED);
    expect(screen.queryByText(FAILED)).not.toBeInTheDocument();
  });

  it("shows the line in a read-only design too", async () => {
    const { store } = await designBackend();
    const id = await cupWithText(store);
    await submitElsewhere(store, id);
    renderWithProviders(<DesignStudio designId={id} fonts={TEST_FONTS} />);
    await screen.findByRole("img", { name: /Mô hình 3D của sản phẩm/ }, OPENED);
    const viewer = built.at(-1)!;

    expect(screen.getByText(LOADING)).toBeInTheDocument();
    act(() => viewer.emit({ status: "failed" }));
    expect(screen.getByText(FAILED)).toBeInTheDocument();
  });

  it("keeps the line through Đổi chỗ, Thu nhỏ and back, on the same viewer", async () => {
    await openCupWithModel();
    const viewer = built.at(-1)!;
    const count = built.length;
    act(() => viewer.emit({ status: "failed" }));

    await userEvent.click(screen.getByRole("button", { name: "Thu nhỏ bản xem trước" }));
    act(() => viewer.emit({ status: "loading" })); // changes while the card is folded
    await userEvent.click(screen.getByRole("button", { name: "Mở lại bản xem trước" }));
    expect(screen.getByText(LOADING)).toBeInTheDocument();

    act(() => viewer.emit({ status: "failed" }));
    await userEvent.click(screen.getByRole("button", { name: "Đổi chỗ 2D và 3D" }));
    expect(screen.getByText(FAILED)).toBeInTheDocument();
    expect(built).toHaveLength(count);
  });

  it("stops listening when the studio goes: nothing is set on an unmounted view", async () => {
    const { unmount } = await openCupWithModel();
    const viewer = built.at(-1)!;
    expect(viewer.listening()).toBe(1);
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);

    unmount();

    expect(viewer.listening()).toBe(0);
    expect(viewer.dispose).toHaveBeenCalled();
    act(() => viewer.emit({ status: "failed" }));
    expect(errors).not.toHaveBeenCalled();
  });
});

describe("the studio's export renderer and the .glb", () => {
  async function servicesOf(open: () => Promise<string>) {
    const id = await open();
    let services: StudioServices | undefined;
    renderWithProviders(
      <DesignStudio
        designId={id}
        fonts={TEST_FONTS}
        onServices={(next) => void (services = next)}
      />,
    );
    await screen.findByRole("img", { name: /Mô hình 3D của sản phẩm/ }, OPENED);
    return services!;
  }

  it("makes its preview wait for the model in the viewer on screen", async () => {
    const { store } = await designBackend();
    const services = await servicesOf(() => cupWithText(store));
    const viewer = built.at(-1)!;
    let swap!: () => void;
    viewer.whenModelReady.mockReturnValue(new Promise<void>((done) => (swap = done)));

    const pending = services.exportRenderer.preview(1024);
    await vi.waitFor(() => expect(viewer.whenModelReady).toHaveBeenCalled());
    expect(viewer.screenshot).not.toHaveBeenCalled();
    swap();

    expect([...(await pending)]).toEqual([5]);
  });

  it("does not wait when the print configuration has no file", async () => {
    await designBackend();
    const services = await servicesOf(async () => MOCK_DESIGN_IDS.draft);
    const viewer = built.at(-1)!;

    await services.exportRenderer.preview(1024);

    expect(viewer.whenModelReady).not.toHaveBeenCalled();
    expect(viewer.screenshot).toHaveBeenCalled();
  });
});
