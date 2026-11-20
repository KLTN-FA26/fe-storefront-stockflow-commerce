import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MOCK_DESIGN_IDS } from "@/lib/api/mock-fixtures/design-seed";
import { settle } from "@/test/fake-backend";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { DesignStudio } from "../components/studio/design-studio";
import { COLOR_DISCLAIMER } from "../components/color-disclaimer";
import { StudioBodySkeleton } from "../components/studio/studio-skeleton";
import { designKeys } from "../queries";
import { cupWithText, designBackend, submitElsewhere } from "./design-backend";
import { TEST_FONTS } from "./fixtures";

/** jsdom has no WebGL: the engine's viewer is replaced by a fake (as in studio-viewer.test). */
vi.mock("../engine", async (importOriginal) => {
  const engine = await importOriginal<typeof import("../engine")>();
  class FakeViewer {
    readonly focusSurface = vi.fn();
    readonly dispose = vi.fn();
    readonly setModel = vi.fn();
    readonly setSurfaceTexture = vi.fn();
    readonly setAutoRotate = vi.fn();
    readonly resetView = vi.fn();
    readonly pick = vi.fn(() => null);
    on() {
      return () => undefined;
    }
  }
  return { ...engine, isWebGLAvailable: () => true, ProductViewer: FakeViewer };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

// Each test renders the whole studio over the design mock (~0.2 s a request).
vi.setConfig({ testTimeout: 20_000 });
const OPENED = { timeout: 4000 };

beforeEach(() => {
  signIn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});
afterEach(() => {
  vi.restoreAllMocks();
  signOut();
});

async function open(id: string) {
  await designBackend();
  renderWithProviders(<DesignStudio designId={id} fonts={TEST_FONTS} />);
  await screen.findByRole("img", { name: /Mô hình 3D của sản phẩm/ }, OPENED);
}
const viewer = () => screen.getByRole("region", { name: "Xem trước sản phẩm" });
const stage = () => screen.getByRole("region", { name: "Khung thiết kế" });
const swapButton = () => screen.getByRole("button", { name: "Đổi chỗ 2D và 3D" });
const minimiseButton = () => screen.getByRole("button", { name: "Thu nhỏ bản xem trước" });

describe("the 3D corner card", () => {
  it("shows Xem 3D with Đổi chỗ and Thu nhỏ, each named and 44 px, with one tooltip", async () => {
    await open(MOCK_DESIGN_IDS.draft);

    expect(within(viewer()).getByRole("heading", { name: "Xem 3D" })).toBeInTheDocument();
    for (const button of [swapButton(), minimiseButton()]) {
      // The tooltip is the button's own (its label): a native title would show a second one.
      expect(button).not.toHaveAttribute("title");
      expect(button).toHaveClass("size-11");
    }
    expect(within(viewer()).getByText(COLOR_DISCLAIMER)).toBeInTheDocument();
  });

  it("the 2D frame shows the colour disclaimer too, also while the 3D card is minimised", async () => {
    const user = userEvent.setup();
    await open(MOCK_DESIGN_IDS.draft);
    expect(within(stage()).getByText(COLOR_DISCLAIMER)).toBeInTheDocument();

    await user.click(minimiseButton());

    expect(screen.getByRole("button", { name: "Mở lại bản xem trước" })).toBeInTheDocument();
    expect(within(stage()).getByText(COLOR_DISCLAIMER)).toBeInTheDocument();
  });

  it("every control of the card is a button that Tab reaches", async () => {
    const user = userEvent.setup();
    await open(MOCK_DESIGN_IDS.draft);
    const buttons = within(viewer()).getAllByRole("button");
    expect(buttons.length).toBeGreaterThanOrEqual(5);
    for (const button of buttons) expect(button).toHaveAccessibleName();

    // From the stage's last control ("Vừa khung" is disabled at 100 %), one Tab per card button.
    act(() => screen.getByRole("button", { name: "Phóng to" }).focus());
    for (const button of buttons) {
      await user.tab();
      expect(document.activeElement).toBe(button);
    }
  });

  it("swaps and back keeping the same nodes mounted and the zoom as it was", async () => {
    const user = userEvent.setup();
    await open(MOCK_DESIGN_IDS.draft);
    const [sheetNode, viewerNode] = [stage(), viewer()];
    const model = screen.getByRole("img", { name: /Mô hình 3D/ });
    const drawing = screen.getByRole("img", { name: /^Bản thiết kế/ });
    await user.click(screen.getByRole("button", { name: "Phóng to" }));
    const zoom = screen.getByLabelText("Mức phóng").textContent;

    await user.click(swapButton());
    // The 3D view fills the area; the stage is the card.
    expect(viewerNode).toHaveClass("inset-0");
    expect(sheetNode).toHaveClass("right-3", "bottom-3", "w-75", "h-80");
    expect(within(sheetNode).getByRole("heading", { name: "Khung thiết kế" })).toBeInTheDocument();
    expect(within(viewerNode).queryByRole("button", { name: "Đổi chỗ 2D và 3D" })).toBeNull();
    expect(within(viewerNode).getByText(COLOR_DISCLAIMER)).toBeInTheDocument();

    await user.click(swapButton());

    expect(viewer()).toBe(viewerNode);
    expect(stage()).toBe(sheetNode);
    expect(screen.getByRole("img", { name: /Mô hình 3D/ })).toBe(model);
    expect(screen.getByRole("img", { name: /^Bản thiết kế/ })).toBe(drawing);
    expect(screen.getByLabelText("Mức phóng").textContent).toBe(zoom);
    expect(viewerNode).toHaveClass("right-3", "bottom-3");
  });

  it("moves focus to Đổi chỗ of the new card after a swap", async () => {
    const user = userEvent.setup();
    await open(MOCK_DESIGN_IDS.draft);

    await user.click(swapButton());

    expect(swapButton()).toHaveFocus();
    expect(stage()).toContainElement(swapButton());
  });

  it("folds into a 3D pill, focuses it, and restores the same card focusing Thu nhỏ", async () => {
    const user = userEvent.setup();
    await open(MOCK_DESIGN_IDS.draft);
    const viewerNode = viewer();
    const model = screen.getByRole("img", { name: /Mô hình 3D/ });

    await user.click(minimiseButton());

    const pill = screen.getByRole("button", { name: "Mở lại bản xem trước" });
    expect(pill).toHaveAttribute("title", "Mở lại bản xem trước");
    expect(pill).toHaveTextContent("3D");
    expect(pill).toHaveClass("min-h-11");
    expect(pill).toHaveFocus();
    expect(viewerNode).toHaveClass("hidden");
    expect(viewerNode).toBeInTheDocument();

    await user.click(pill);

    expect(screen.queryByRole("button", { name: "Mở lại bản xem trước" })).toBeNull();
    expect(viewer()).toBe(viewerNode);
    expect(viewerNode).not.toHaveClass("hidden");
    expect(screen.getByRole("img", { name: /Mô hình 3D/ })).toBe(model);
    expect(minimiseButton()).toHaveFocus();
  });

  it("names the sheet when it is the card: Thu nhỏ khung thiết kế, and a 2D pill", async () => {
    const user = userEvent.setup();
    await open(MOCK_DESIGN_IDS.draft);
    const sheetNode = stage();

    await user.click(swapButton());
    await user.click(within(sheetNode).getByRole("button", { name: "Thu nhỏ khung thiết kế" }));

    expect(screen.getByRole("button", { name: "Mở lại khung thiết kế" })).toHaveTextContent("2D");
    expect(sheetNode).toHaveClass("hidden");
    expect(viewer()).toHaveClass("inset-0");
  });

  it("as the card, the stage is marked, fits the card and hides its zoom bar; full again restores it", async () => {
    const user = userEvent.setup();
    await open(MOCK_DESIGN_IDS.draft);
    const sheetNode = stage();
    expect(sheetNode).not.toHaveAttribute("data-card");

    await user.click(swapButton());

    expect(sheetNode).toHaveAttribute("data-card");
    // CanvasStage's viewport (role group) loses its lg:min-h-80; its zoom bar (the box holding the
    // Mức phóng readout) is hidden. Both go through descendant selectors on the section.
    expect(sheetNode.className).toContain("[&_[role=group]]:min-h-0");
    expect(sheetNode.className).toContain("hidden");

    await user.click(swapButton());

    expect(sheetNode).not.toHaveAttribute("data-card");
    expect(sheetNode.className).not.toContain("[role=group]");
    expect(screen.getByRole("button", { name: "Phóng to" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Vừa khung" })).toBeInTheDocument();
  });

  it("in card mode the 3D view has no title bar, and keeps its own controls", async () => {
    await open(MOCK_DESIGN_IDS.draft);
    const card = viewer();

    expect(within(card).queryByRole("heading", { name: "Xem trước 3D" })).toBeNull();
    expect(within(card).getAllByRole("heading")).toHaveLength(1);
    for (const name of ["Tự xoay", "Nhìn thẳng", "Toàn màn hình"]) {
      expect(within(card).getByRole("button", { name })).toBeInTheDocument();
    }
    // Floating over the model, not in a title bar.
    const tools = within(card).getByRole("button", { name: "Nhìn thẳng" });
    expect(tools.closest(".absolute")).toContainElement(
      screen.getByRole("img", { name: /Mô hình 3D/ }).nextElementSibling as HTMLElement,
    );
  });

  it("leaves full screen before Thu nhỏ or Đổi chỗ changes the card", async () => {
    const user = userEvent.setup();
    await open(MOCK_DESIGN_IDS.draft);
    const exit = vi.fn(async () => undefined);
    Object.defineProperty(document, "fullscreenElement", { configurable: true, get: viewer });
    Object.defineProperty(document, "exitFullscreen", { configurable: true, value: exit });
    try {
      await user.click(minimiseButton());
      expect(exit).toHaveBeenCalledTimes(1);
      await user.click(screen.getByRole("button", { name: "Mở lại bản xem trước" }));
      await user.click(swapButton());
      expect(exit).toHaveBeenCalledTimes(2);
    } finally {
      Reflect.deleteProperty(document, "fullscreenElement");
      Reflect.deleteProperty(document, "exitFullscreen");
    }
  });

  it("turning read-only puts the preview beside the stage, and a returned draft starts unswapped", async () => {
    const user = userEvent.setup();
    const { store } = await designBackend();
    const id = await cupWithText(store);
    const { client } = renderWithProviders(<DesignStudio designId={id} fonts={TEST_FONTS} />);
    const model = await screen.findByRole("img", { name: /Mô hình 3D/ }, OPENED);
    const [sheetNode, viewerNode] = [stage(), viewer()];
    await user.click(swapButton());
    await user.click(within(sheetNode).getByRole("button", { name: "Thu nhỏ khung thiết kế" }));

    // Another tab submits it; the studio reads it again, as its status poll would.
    await submitElsewhere(store, id);
    await act(() => client.invalidateQueries({ queryKey: designKeys.detail(id) }));
    await screen.findByRole("group", { name: "Bảng" }, OPENED);

    expect([stage(), viewer()]).toEqual([sheetNode, viewerNode]);
    expect(screen.getByRole("img", { name: /Mô hình 3D/ })).toBe(model);
    expect(viewerNode).not.toHaveClass("hidden");
    expect(viewerNode).not.toHaveClass("absolute");
    expect(sheetNode).not.toHaveAttribute("data-card");
    expect(screen.queryByRole("button", { name: /^Mở lại/ })).toBeNull();

    // The review returns it: a draft again, with the 3D view as the open corner card.
    settle(await store.simulateReturn(id, { reason: "Logo quá nhỏ" }));
    await act(() => client.invalidateQueries({ queryKey: designKeys.detail(id) }));
    await screen.findByRole("group", { name: "Công cụ" }, OPENED);

    expect(viewer()).toBe(viewerNode);
    expect(viewerNode).toHaveClass("right-3", "bottom-3");
    expect(viewerNode).not.toHaveClass("hidden");
    expect(sheetNode).not.toHaveAttribute("data-card");
    expect(screen.getByRole("img", { name: /Mô hình 3D/ })).toBe(model);
  });

  it("read-only: no card, no swap, no minimise", async () => {
    await open(MOCK_DESIGN_IDS.approved);

    expect(screen.queryByRole("button", { name: "Đổi chỗ 2D và 3D" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Thu nhỏ bản xem trước" })).toBeNull();
    expect(viewer()).not.toHaveClass("absolute");
    expect(within(viewer()).getByText(COLOR_DISCLAIMER)).toBeInTheDocument();
  });
});

describe("StudioBodySkeleton", () => {
  it("has the bar strip, the rail, the stage and a 300 x 320 card in its corner", () => {
    renderWithProviders(<StudioBodySkeleton />);

    expect(screen.getByTestId("skeleton-context-bar")).toBeInTheDocument();
    expect(screen.getByTestId("skeleton-rail")).toHaveClass("w-18");
    const stageBox = screen.getByTestId("skeleton-stage");
    const card = screen.getByTestId("skeleton-card");
    expect(stageBox).toContainElement(card);
    expect(card).toHaveClass("right-3", "bottom-3", "w-75", "h-80");
  });
});
