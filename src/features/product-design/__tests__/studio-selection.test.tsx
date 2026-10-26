import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { seedMockCatalog } from "@/lib/api/mock-fixtures/catalog";
import { MOCK_DESIGN_IDS, type MockDesignStudio } from "@/lib/api/mock-fixtures/designs";
import { settle } from "@/test/fake-backend";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { DesignStudio } from "../components/studio/design-studio";
import type { StudioServices } from "../components/studio/studio-context";
import {
  addElement,
  emptyDocument,
  surfaceSnapTargets,
  type DesignElement,
  type PrintAreaCode,
} from "../engine";
import { cup12oz, imageEl, textEl } from "../engine/__tests__/fixtures";
import { fakeDesignBackend, mockStudio } from "./design-backend";
import { TEST_FONTS } from "./fixtures";

const env = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: env.push, replace: vi.fn() }),
}));
vi.mock("@/providers/app-providers", () => ({ useIsMock: () => true }));

// Each test renders the whole studio and drives it with userEvent: over 5 s in a loaded full run.
vi.setConfig({ testTimeout: 15_000 });

beforeEach(() => {
  env.push.mockReset();
  signIn();
  // jsdom has no canvas: `getContext` logs "not implemented" before answering null.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 404 })),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  signOut();
});

const CUP_SLUG = "ly-giay-2-lop-12oz";

/** On the 12oz cup body: `u` across the band, half-way down it. */
const at = (u: number, v = 55) => ({ placement: { u, v, rotationDeg: 0, scale: 1 } });
const logo = (overrides: Partial<Parameters<typeof imageEl>[1]> = {}) =>
  imageEl("logo", { ...at(100), widthMm: 30, heightMm: 30, ...overrides });
const coffee = (overrides: Partial<Parameters<typeof textEl>[1]> = {}) =>
  textEl("text", { content: "Cà phê", ...at(170), ...overrides });

/** A new 12oz cup draft whose body holds `elements` (bottom first). */
async function cupDraft(studio: MockDesignStudio, elements: DesignElement[]) {
  const product = seedMockCatalog().find((p) => p.slug === CUP_SLUG)!;
  const created = settle(
    await studio.create({
      productId: product.productId,
      sku: "CUP-PAPER-12OZ-WHT",
      templateCode: "CUP12-BODY",
      name: "Ly thử",
    }),
  );
  const { id } = created.data as { id: string };
  const document = {
    ...emptyDocument(cup12oz),
    surfaces: { BODY: { background: { kind: "none" as const }, elements } },
  };
  settle(await studio.putDocument(id, { version: 0, document }));
  return id;
}

/** Renders the studio of `designId`; resolves once it is laid out, with its latest services. */
async function openStudio(designId: string) {
  const seen: { current?: StudioServices } = {};
  renderWithProviders(
    <DesignStudio
      designId={designId}
      fonts={TEST_FONTS}
      onServices={(services) => {
        seen.current = services;
      }}
    />,
  );
  await screen.findByRole("tab", { name: "Lớp" });
  return seen;
}

const elementOf = (
  services: { current?: StudioServices },
  id: string,
  code: PrintAreaCode = "BODY",
) =>
  services
    .current!.editor.store.getState()
    .document.surfaces[code]?.elements.find((element) => element.id === id);

const showTab = (user: UserEvent, name: "Thuộc tính" | "Lớp") =>
  user.click(screen.getByRole("tab", { name }));
const option = (name: string | RegExp) => screen.getByRole("option", { name });
const layerNames = () => screen.getAllByRole("option").map((o) => o.textContent);
const stage = () => screen.getByRole("group", { name: "Khung vẽ Thân ly" });
const undoButton = () => screen.getByRole("button", { name: "Hoàn tác (Ctrl+Z)" });
const numberIn = (label: string) =>
  Number((screen.getByLabelText(label) as HTMLInputElement).value);

describe("selection, layers and properties", () => {
  it("selects from the layers list and deletes with the keyboard", async () => {
    const user = userEvent.setup();
    const studio = mockStudio();
    fakeDesignBackend(studio);
    await openStudio(await cupDraft(studio, [logo(), coffee()]));
    await showTab(user, "Lớp");

    expect(screen.getByRole("tabpanel", { name: "Lớp" })).toHaveClass("focus-visible:ring-2");
    expect(layerNames()).toEqual(["Chữ: Cà phê", "Ảnh"]); // topmost first
    await user.click(option(/Chữ: Cà phê/));
    expect(option(/Chữ: Cà phê/)).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Delete}");

    expect(screen.queryByRole("option", { name: /Chữ: Cà phê/ })).not.toBeInTheDocument();
    expect(screen.getByText("Đã xoá phần tử")).toBeInTheDocument();
  });

  it("undoes a deletion with Ctrl+Z and redoes it with Ctrl+Shift+Z", async () => {
    const user = userEvent.setup();
    const studio = mockStudio();
    fakeDesignBackend(studio);
    await openStudio(await cupDraft(studio, [logo(), coffee()]));
    await showTab(user, "Lớp");

    await user.click(option("Ảnh"));
    await user.keyboard("{Delete}");
    expect(screen.queryByRole("option", { name: "Ảnh" })).not.toBeInTheDocument();

    await user.keyboard("{Control>}z{/Control}");
    expect(layerNames()).toEqual(["Chữ: Cà phê", "Ảnh"]);
    await user.keyboard("{Control>}{Shift>}z{/Shift}{/Control}");
    expect(layerNames()).toEqual(["Chữ: Cà phê"]);
  });

  it("nudges with arrows but never past the surface edge", async () => {
    const user = userEvent.setup();
    const studio = mockStudio();
    fakeDesignBackend(studio);
    const services = await openStudio(await cupDraft(studio, [logo(at(8))]));
    await showTab(user, "Lớp");
    await user.click(option("Ảnh"));
    act(() => stage().focus());

    await user.keyboard("{Shift>}{ArrowLeft}{/Shift}");
    // 5 mm along the cup at the logo's radius: a little less than 5 mm of `u` (arc at mid radius).
    const once = elementOf(services, "logo")!.placement.u;
    expect(once).toBeGreaterThan(2.9);
    expect(once).toBeLessThan(3.1);
    await user.keyboard("{Shift>}{ArrowLeft}{ArrowLeft}{/Shift}");
    await user.keyboard("{ArrowDown}");

    await showTab(user, "Thuộc tính");
    expect(screen.getByLabelText("X (mm)")).toHaveValue(0);
    expect(screen.getByLabelText("Y (mm)")).toHaveValue(55.5);
    // One history step per key press: the step down, then the press that reached the edge.
    await user.click(undoButton());
    await user.click(undoButton());
    expect(numberIn("X (mm)")).toBeCloseTo(once, 1);
  });

  it("edits rotation and opacity from the properties panel, one undo step per field", async () => {
    const user = userEvent.setup();
    const studio = mockStudio();
    fakeDesignBackend(studio);
    const services = await openStudio(await cupDraft(studio, [logo(), coffee()]));
    await showTab(user, "Lớp");
    await user.click(option(/Chữ: Cà phê/));
    await showTab(user, "Thuộc tính");

    const rotation = screen.getByLabelText("Góc xoay (°)");
    await user.clear(rotation);
    await user.type(rotation, "15");
    await user.tab();
    expect(elementOf(services, "text")!.placement.rotationDeg).toBe(15);

    const opacity = screen.getByLabelText("Độ mờ đục (%)");
    await user.clear(opacity);
    await user.type(opacity, "50");
    await user.tab();
    expect(elementOf(services, "text")!.opacity).toBe(0.5);
    expect(opacity).toHaveValue(50);

    await user.click(undoButton());
    expect(opacity).toHaveValue(100);
    expect(rotation).toHaveValue(15);
  });

  it("centres, duplicates and restacks the selection", async () => {
    const user = userEvent.setup();
    const studio = mockStudio();
    fakeDesignBackend(studio);
    const services = await openStudio(await cupDraft(studio, [logo(), coffee()]));
    const { surfaces } = services.current!;
    const [centreU, centreV] = surfaceSnapTargets(surfaces.byCode.BODY!, []);
    await showTab(user, "Lớp");
    await user.click(option("Ảnh"));

    await user.click(
      within(screen.getByRole("group", { name: "Ảnh" })).getByRole("button", { name: "Đưa lên" }),
    );
    expect(layerNames()).toEqual(["Ảnh", "Chữ: Cà phê"]);
    await user.click(option("Ảnh")); // back in the list: its keys include the shortcuts
    await user.keyboard("{Control>}[[{/Control}");
    expect(layerNames()).toEqual(["Chữ: Cà phê", "Ảnh"]);

    await showTab(user, "Thuộc tính");
    await user.click(screen.getByRole("button", { name: "Căn giữa ngang" }));
    await user.click(screen.getByRole("button", { name: "Căn giữa dọc" }));
    expect(elementOf(services, "logo")!.placement).toMatchObject({
      u: centreU!.u,
      v: centreV!.v,
    });

    await user.click(screen.getByRole("button", { name: "Nhân bản" }));
    const { selectedId } = services.current!.editor.store.getState();
    expect(selectedId).not.toBe("logo");
    expect(elementOf(services, selectedId!)).toMatchObject({ type: "image" });
    await showTab(user, "Lớp");
    expect(layerNames()).toEqual(["Chữ: Cà phê", "Ảnh", "Ảnh"]);
  });

  it("hides and locks a layer; a locked element is neither nudged nor deleted", async () => {
    const user = userEvent.setup();
    const studio = mockStudio();
    fakeDesignBackend(studio);
    const services = await openStudio(await cupDraft(studio, [logo(), coffee()]));
    await showTab(user, "Lớp");
    const row = () => within(screen.getByRole("group", { name: "Chữ: Cà phê" }));

    await user.click(row().getByRole("button", { name: "Ẩn" }));
    expect(elementOf(services, "text")!.hidden).toBe(true);
    await user.click(row().getByRole("button", { name: "Hiện" }));
    expect(elementOf(services, "text")!.hidden).toBe(false);

    await user.click(row().getByRole("button", { name: "Khoá" }));
    expect(row().getByRole("button", { name: "Mở khoá" })).toBeInTheDocument();
    await user.click(option(/Chữ: Cà phê/));
    await user.keyboard("{Delete}");
    act(() => stage().focus());
    await user.keyboard("{ArrowRight}");
    expect(elementOf(services, "text")!.placement.u).toBe(170);
    expect(option(/Chữ: Cà phê/)).toBeInTheDocument();
    await showTab(user, "Thuộc tính");
    expect(screen.getByLabelText("X (mm)")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Xoá" })).toBeDisabled();
  });

  it("switches tools from the rail and with tool keys on the stage", async () => {
    const user = userEvent.setup();
    const studio = mockStudio();
    fakeDesignBackend(studio);
    await openStudio(await cupDraft(studio, []));

    expect(screen.getByRole("button", { name: "Chọn (V)" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "Vẽ (B)" }));
    expect(screen.getByRole("button", { name: "Vẽ (B)" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Chọn (V)" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    act(() => stage().focus());
    await user.keyboard("t");
    expect(screen.getByRole("button", { name: "Chữ (T)" })).toHaveAttribute("aria-pressed", "true");
    await user.keyboard("v");
    expect(screen.getByRole("button", { name: "Chọn (V)" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("copies a bag face to another face, keeping each element's place across the width", async () => {
    const user = userEvent.setup();
    fakeDesignBackend(mockStudio());
    const services = await openStudio(MOCK_DESIGN_IDS.draftBag);
    // The seeded front holds "Tiệm Bánh Hoa" centred at u = 130; add a logo near its left edge.
    act(() =>
      services.current!.editor.apply((doc) =>
        addElement(
          doc,
          "FRONT",
          imageEl("front-logo", { placement: { ...at(20).placement, v: 140 } }),
        ),
      ),
    );

    await user.click(screen.getByRole("button", { name: "Sao chép sang mặt khác" }));
    await user.click(await screen.findByRole("button", { name: "Hông trái" }));

    const left = services.current!.editor.store.getState().document.surfaces.LEFT!;
    const [text, image] = left.elements;
    expect(text).toMatchObject({ type: "text", content: "Tiệm Bánh Hoa" });
    expect(image).toMatchObject({ type: "image" });
    expect(text!.id).not.toBe("el-bag-1");
    expect(image!.id).not.toBe("front-logo");
    // The front is 260 mm wide, the gusset 120 mm: `u` is scaled across, `v` is kept (R55).
    expect(text!.placement).toMatchObject({ u: 60, v: 140 });
    expect(image!.placement.u).toBeCloseTo((20 * 120) / 260, 6);
    expect(screen.getByText("Đã sao chép sang Hông trái")).toBeInTheDocument();
  });
});

describe("read-only designs", () => {
  it("disables editing tools when read-only", async () => {
    const user = userEvent.setup();
    fakeDesignBackend(mockStudio());
    await openStudio(MOCK_DESIGN_IDS.approvedCup);

    expect(screen.getByRole("button", { name: "Chữ (T)" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Chọn (V)" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Tạo phiên bản mới" })).toBeInTheDocument();

    await showTab(user, "Lớp");
    await user.click(option("Chữ: Nhà Mình"));
    await user.keyboard("{Delete}");
    expect(option("Chữ: Nhà Mình")).toBeInTheDocument();
    const row = within(screen.getByRole("group", { name: "Chữ: Nhà Mình" }));
    expect(row.getByRole("button", { name: "Ẩn" })).toBeDisabled();
    expect(row.getByRole("button", { name: "Đưa xuống" })).toBeDisabled();

    act(() => stage().focus());
    await user.keyboard("t");
    expect(screen.getByRole("button", { name: "Chữ (T)" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await showTab(user, "Thuộc tính");
    expect(screen.getByLabelText("Góc xoay (°)")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Nhân bản" })).toBeDisabled();
  });

  it("withdraws a pending confirmation to edit again", async () => {
    const user = userEvent.setup();
    const studio = mockStudio();
    const { post } = fakeDesignBackend(studio);
    const id = await cupDraft(studio, [coffee()]);
    const preview = new File([new Uint8Array(8).fill(7)], "preview.png", { type: "image/png" });
    settle(await studio.uploadArtifact(id, "CUSTOMER_PREVIEW", preview, "preview-key-1"));
    settle(studio.completeReview(id, true, "OK"));
    const { version } = settle(studio.get(id)).data as { version: number };
    settle(studio.submit(id, { version }));
    await openStudio(id);

    expect(screen.getByRole("button", { name: "Chữ (T)" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Rút yêu cầu để chỉnh sửa" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/Lý do/), "Muốn đổi màu chữ");
    await user.click(within(dialog).getByRole("button", { name: "Rút yêu cầu" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Chữ (T)" })).toBeEnabled());
    expect(post).toHaveBeenCalledWith(`/designs/${id}/confirmation-withdrawals`, {
      version: version + 1,
      reason: "Muốn đổi màu chữ",
    });
    expect(
      screen.queryByRole("button", { name: "Rút yêu cầu để chỉnh sửa" }),
    ).not.toBeInTheDocument();
  });
});

/**
 * jsdom lays nothing out: give the stage viewport a size (and a ResizeObserver that reports it)
 * so the stage has a scale and the overlay is drawn in screen px from the top-left at (0, 0).
 */
function sizeTheStage(width = 900, height = 700) {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe() {
        this.callback([], this as unknown as ResizeObserver);
      }
      unobserve() {}
      disconnect() {}
    },
  );
  vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(width);
  vi.spyOn(Element.prototype, "clientHeight", "get").mockReturnValue(height);
}

/** The overlay and a mapper from surface (u, v) to the screen px pointer events carry. */
function overlayOf(services: { current?: StudioServices }) {
  const svg = document.querySelector<SVGSVGElement>("svg[data-stage-overlay]");
  if (!svg) throw new Error("No stage overlay");
  const surface = services.current!.surfaces.byCode.BODY!;
  const width = Number(svg.getAttribute("viewBox")!.split(" ")[2]);
  const k = width / surface.flatBounds.width;
  const toScreen = (u: number, v: number) => {
    const { x, y } = surface.toFlat(u, v);
    return { clientX: (x - surface.flatBounds.x) * k, clientY: (y - surface.flatBounds.y) * k };
  };
  const handles = (kind: string) => svg.querySelectorAll(`[data-handle="${kind}"]`);
  /** Where a handle is drawn (its last shape: the visible square or dot), in screen px. */
  const handleAt = (kind: "scale" | "rotate", index = 0) => {
    const shape = handles(kind)[index]!.lastElementChild!;
    const attr = (name: string) => Number(shape.getAttribute(name));
    return shape.tagName === "rect"
      ? { clientX: attr("x") + attr("width") / 2, clientY: attr("y") + attr("height") / 2 }
      : { clientX: attr("cx"), clientY: attr("cy") };
  };
  /**
   * What a browser's hit test would hand the press at `coords`: the topmost painted shape there
   * (the transparent handle hit circles are drawn over the element), else the layer itself.
   */
  const targetAt = ({ clientX: x, clientY: y }: { clientX: number; clientY: number }) => {
    const shapes = [...svg.querySelectorAll("circle, rect")].reverse();
    const num = (el: Element, name: string) => Number(el.getAttribute(name));
    const hit = shapes.find((el) =>
      el.tagName === "circle"
        ? Math.hypot(x - num(el, "cx"), y - num(el, "cy")) <= num(el, "r")
        : x >= num(el, "x") &&
          x <= num(el, "x") + num(el, "width") &&
          y >= num(el, "y") &&
          y <= num(el, "y") + num(el, "height"),
    );
    return hit ?? svg;
  };
  return { svg, surface, k, toScreen, handles, handleAt, targetAt };
}

const nextFrame = () =>
  act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

describe("on the stage", () => {
  beforeEach(() => sizeTheStage());

  it("drags an element, snapping to the surface centre, as one undo step", async () => {
    const user = userEvent.setup();
    const studio = mockStudio();
    fakeDesignBackend(studio);
    const services = await openStudio(await cupDraft(studio, [logo(at(100, 30))]));
    const { surface, toScreen, targetAt } = overlayOf(services);
    const centreU = surfaceSnapTargets(surface, [])[0]!.u!;

    await user.pointer({
      keys: "[MouseLeft>]",
      target: targetAt(toScreen(100, 30)),
      coords: toScreen(100, 30),
    });
    expect(services.current!.editor.store.getState().selectedId).toBe("logo");
    await user.pointer({ coords: toScreen(150, 30) });
    await nextFrame(); // a move is applied on the next animation frame
    expect(elementOf(services, "logo")!.placement.u).toBeCloseTo(150, 6);
    await user.pointer({ coords: toScreen(centreU + 1.2, 30) });
    await nextFrame();
    await user.pointer({ keys: "[/MouseLeft]" });

    expect(elementOf(services, "logo")!.placement.u).toBeCloseTo(centreU, 6);
    expect(elementOf(services, "logo")!.placement.v).toBeCloseTo(30, 6);
    await user.click(undoButton());
    expect(elementOf(services, "logo")!.placement.u).toBe(100);
  });

  it("rotates with the rotate handle, snapping to 15° with Shift", async () => {
    const user = userEvent.setup();
    const studio = mockStudio();
    fakeDesignBackend(studio);
    const services = await openStudio(await cupDraft(studio, [logo()]));
    act(() => services.current!.editor.select("logo"));
    const { toScreen, handleAt, targetAt } = overlayOf(services);
    const pivot = toScreen(100, 55);
    const grab = handleAt("rotate");
    // The handle swept 20° clockwise about the logo's centre.
    const turn = (20 * Math.PI) / 180;
    const [dx, dy] = [grab.clientX - pivot.clientX, grab.clientY - pivot.clientY];
    const swept = {
      clientX: pivot.clientX + dx * Math.cos(turn) - dy * Math.sin(turn),
      clientY: pivot.clientY + dx * Math.sin(turn) + dy * Math.cos(turn),
    };

    await user.keyboard("{Shift>}");
    await user.pointer([
      { keys: "[MouseLeft>]", target: targetAt(grab), coords: grab },
      { coords: swept },
      { keys: "[/MouseLeft]" },
    ]);
    await user.keyboard("{/Shift}");

    expect(elementOf(services, "logo")!.placement.rotationDeg).toBe(15);
  });

  it("scales from a corner keeping the ratio", async () => {
    const user = userEvent.setup();
    const studio = mockStudio();
    fakeDesignBackend(studio);
    const services = await openStudio(await cupDraft(studio, [logo()]));
    act(() => services.current!.editor.select("logo"));
    const { toScreen, handleAt, targetAt } = overlayOf(services);
    const pivot = toScreen(100, 55);
    const corner = handleAt("scale", 2);
    // Twice as far from the centre as the bottom-right corner.
    const twice = {
      clientX: 2 * corner.clientX - pivot.clientX,
      clientY: 2 * corner.clientY - pivot.clientY,
    };

    await user.pointer([
      { keys: "[MouseLeft>]", target: targetAt(corner), coords: corner },
      { coords: twice },
      { keys: "[/MouseLeft]" },
    ]);

    expect(elementOf(services, "logo")).toMatchObject({
      widthMm: 30,
      heightMm: 30,
      placement: { scale: expect.closeTo(2, 6) },
    });
  });

  it("offers no rotation for an element wrapped around the cup", async () => {
    const user = userEvent.setup();
    const studio = mockStudio();
    fakeDesignBackend(studio);
    const services = await openStudio(await cupDraft(studio, [coffee({ wrap: true })]));
    act(() => services.current!.editor.select("text"));
    const { handles } = overlayOf(services);

    expect(handles("scale")).toHaveLength(4);
    expect(handles("rotate")).toHaveLength(0);
    await showTab(user, "Thuộc tính");
    expect(screen.getByLabelText("Góc xoay (°)")).toBeDisabled();
    expect(
      screen.getByText("Phần tử uốn theo thân ly luôn nằm ngang nên không xoay được."),
    ).toBeInTheDocument();
  });

  it("outlines a locked element without handles", async () => {
    const studio = mockStudio();
    fakeDesignBackend(studio);
    const services = await openStudio(await cupDraft(studio, [logo({ locked: true })]));
    act(() => services.current!.editor.select("logo"));
    const { svg, handles } = overlayOf(services);

    expect(svg.querySelector("polygon")).not.toBeNull();
    expect(handles("scale")).toHaveLength(0);
    expect(handles("rotate")).toHaveLength(0);
  });
});

describe("on a small touch stage", () => {
  beforeEach(() => {
    // A 375 px wide touch stage at "Vừa khung": about 1.1 px per mm on the cup, handles for touch.
    sizeTheStage(375, 480);
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(pointer: coarse)",
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
  });

  /** A small 20 × 8 mm image on the cup body, selected. */
  async function smallSelected() {
    const studio = mockStudio();
    fakeDesignBackend(studio);
    const small = logo({ widthMm: 20, heightMm: 8 });
    const services = await openStudio(await cupDraft(studio, [small]));
    act(() => services.current!.editor.select("logo"));
    return { services, ...overlayOf(services) };
  }

  it("moves a small selected element pressed inside it, though its handles reach over it", async () => {
    const user = userEvent.setup();
    const { services, k, toScreen, handles, targetAt } = await smallSelected();
    expect(k).toBeLessThan(1.5);
    expect(handles("scale")).toHaveLength(4);
    const centre = toScreen(100, 55);

    await user.pointer([
      { keys: "[MouseLeft>]", target: targetAt(centre), coords: centre },
      { coords: { clientX: centre.clientX + 30, clientY: centre.clientY } },
      { keys: "[/MouseLeft]" },
    ]);

    const { placement } = elementOf(services, "logo")!;
    expect(placement.scale).toBe(1);
    expect(placement.u).toBeGreaterThan(100 + 20);
  });

  it("scales smoothly from a press just outside a corner", async () => {
    const user = userEvent.setup();
    const { services, toScreen, handleAt, targetAt } = await smallSelected();
    const pivot = toScreen(100, 55);
    const corner = handleAt("scale", 2);
    // Outwards along the centre → corner diagonal, in screen px.
    const [dx, dy] = [corner.clientX - pivot.clientX, corner.clientY - pivot.clientY];
    const reach = Math.hypot(dx, dy);
    const out = (px: number) => ({
      clientX: corner.clientX + (dx / reach) * px,
      clientY: corner.clientY + (dy / reach) * px,
    });

    await user.pointer({ keys: "[MouseLeft>]", target: targetAt(out(4)), coords: out(4) });
    await user.pointer({ coords: out(6) });
    await nextFrame();
    // The corner followed the pointer 2 px outwards: the reference is the corner, not the press.
    const first = elementOf(services, "logo")!.placement.scale;
    expect(first).toBeCloseTo((reach + 2) / reach, 6);
    expect(first).toBeLessThan(1.25);
    await user.pointer({ coords: out(4 + reach) });
    await user.pointer({ keys: "[/MouseLeft]" });

    expect(elementOf(services, "logo")!.placement.scale).toBeCloseTo(2, 6);
  });
});
