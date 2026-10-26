import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MOCK_DESIGN_IDS } from "@/lib/api/mock-fixtures/designs";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { DesignStudio } from "../components/studio/design-studio";
import { COLOR_DISCLAIMER } from "../components/studio/viewer-host";
import { fakeDesignBackend, mockStudio } from "./design-backend";
import { TEST_FONTS } from "./fixtures";

/** The viewers the studio built: jsdom has no WebGL, so the engine's viewer is replaced by a fake. */
const built = vi.hoisted(
  () =>
    [] as {
      focusSurface: ReturnType<typeof vi.fn>;
      dispose: ReturnType<typeof vi.fn>;
      lose(): void;
      fail(): void;
    }[],
);

vi.mock("../engine", async (importOriginal) => {
  const engine = await importOriginal<typeof import("../engine")>();
  class FakeViewer {
    private onLost: (() => void) | undefined;
    private onError: ((error?: unknown) => void) | undefined;
    readonly focusSurface = vi.fn();
    readonly dispose = vi.fn();
    readonly setModel = vi.fn();
    readonly setSurfaceTexture = vi.fn();
    readonly setAutoRotate = vi.fn();
    readonly resetView = vi.fn();
    readonly pick = vi.fn(() => null);
    constructor() {
      built.push(this);
    }
    on(event: string, listener: () => void) {
      if (event === "contextlost") this.onLost = listener;
      if (event === "error") this.onError = listener;
      return () => undefined;
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
vi.mock("@/providers/app-providers", () => ({ useIsMock: () => true }));

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
  fakeDesignBackend(mockStudio());
  renderWithProviders(<DesignStudio designId={MOCK_DESIGN_IDS.draftBag} fonts={TEST_FONTS} />);
  return screen.findByRole("img", { name: /Mô hình 3D của sản phẩm/ });
}

describe("ViewerHost with WebGL", () => {
  it("puts the whole preview in full screen, colour disclaimer included", async () => {
    const model = await openBag();

    await userEvent.click(screen.getByRole("button", { name: "Toàn màn hình" }));

    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    const shown = requestFullscreen.mock.contexts[0] as HTMLElement;
    expect(shown).toContainElement(model);
    expect(shown).toContainElement(screen.getByText(COLOR_DISCLAIMER));
  });

  it("turns the camera to the face chosen in the tabs", async () => {
    await openBag();

    await userEvent.click(screen.getByRole("tab", { name: "Hông trái" }));

    expect(built.at(-1)?.focusSurface).toHaveBeenCalledWith("LEFT");
  });

  it("falls back to the flat preview when the WebGL context is lost for good", async () => {
    await openBag();
    const viewer = built.at(-1)!;

    act(() => viewer.lose());

    expect(screen.getByText("Preview 3D không khả dụng")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Mô hình 3D/ })).not.toBeInTheDocument();
    expect(screen.getByText(COLOR_DISCLAIMER)).toBeInTheDocument();
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
