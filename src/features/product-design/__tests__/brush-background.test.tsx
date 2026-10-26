import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { seedMockCatalog } from "@/lib/api/mock-fixtures/catalog";
import { MOCK_DESIGN_IDS, type MockDesignStudio } from "@/lib/api/mock-fixtures/designs";
import { settle } from "@/test/fake-backend";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { useRecentColors } from "../components/studio/color-field";
import { DesignStudio } from "../components/studio/design-studio";
import type { StudioServices } from "../components/studio/studio-context";
import {
  addElement,
  applyToPoint,
  elementMatrix,
  emptyDocument,
  type DesignDocument,
  updateElement,
  type DesignElement,
  type DrawingElement,
  type PrintAreaCode,
} from "../engine";
import {
  bagM,
  cup12oz,
  drawingEl,
  imageEl,
  recordingCtx,
  type RecordingCtx,
} from "../engine/__tests__/fixtures";
import { fakeDesignBackend, mockStudio } from "./design-backend";
import { TEST_FONTS } from "./fixtures";

/** The 3D viewers the studio built: jsdom has no WebGL, so the engine's viewer is a fake that keeps its textures. */
const built = vi.hoisted(() => [] as { setSurfaceTexture: ReturnType<typeof vi.fn> }[]);

vi.mock("../engine", async (importOriginal) => {
  const engine = await importOriginal<typeof import("../engine")>();
  class FakeViewer {
    readonly setSurfaceTexture = vi.fn();
    readonly setModel = vi.fn();
    readonly focusSurface = vi.fn();
    readonly dispose = vi.fn();
    readonly setAutoRotate = vi.fn();
    readonly resetView = vi.fn();
    readonly pick = vi.fn(() => null);
    constructor() {
      built.push(this);
    }
    on() {
      return () => undefined;
    }
  }
  return { ...engine, isWebGLAvailable: () => true, ProductViewer: FakeViewer };
});

const env = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: env.push, replace: vi.fn() }),
}));
vi.mock("@/providers/app-providers", () => ({ useIsMock: () => true }));

// Each test renders the whole studio: well over 5 s in a loaded full run.
vi.setConfig({ testTimeout: 15_000 });

beforeEach(() => {
  built.length = 0;
  signIn();
  useRecentColors.setState({ colors: [] });
  // jsdom has no canvas: `getContext` logs "not implemented" before answering null.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 404 })),
  );
  sizeTheStage();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  signOut();
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

type Seen = { current?: StudioServices };

async function openStudio(designId: string): Promise<Seen> {
  const seen: Seen = {};
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

/** A new draft of a seeded product whose document is `document`. */
async function newDraft(
  studio: MockDesignStudio,
  { slug, sku, templateCode }: { slug: string; sku: string; templateCode: string },
  document: DesignDocument,
) {
  const product = seedMockCatalog().find((p) => p.slug === slug)!;
  const created = settle(
    await studio.create({ productId: product.productId, sku, templateCode, name: "Thiết kế thử" }),
  );
  const { id } = created.data as { id: string };
  settle(await studio.putDocument(id, { version: 0, document }));
  return id;
}

/** A new 12oz cup draft whose body holds `elements` (bottom first). */
async function openCup(elements: DesignElement[] = []) {
  const studio = mockStudio();
  fakeDesignBackend(studio);
  const document = {
    ...emptyDocument(cup12oz),
    surfaces: { BODY: { background: { kind: "none" as const }, elements } },
  };
  const cup = { slug: "ly-giay-2-lop-12oz", sku: "CUP-PAPER-12OZ-WHT", templateCode: "CUP12-BODY" };
  return openStudio(await newDraft(studio, cup, document));
}

/** A new kraft bag draft with four empty faces. */
async function openBag() {
  const studio = mockStudio();
  fakeDesignBackend(studio);
  const bag = { slug: "tui-giay-kraft", sku: "BAG-KRAFT-M", templateCode: "BAGM-4F" };
  return openStudio(await newDraft(studio, bag, emptyDocument(bagM)));
}

async function openDesign(designId: string) {
  fakeDesignBackend(mockStudio());
  return openStudio(designId);
}

const editorOf = (seen: Seen) => seen.current!.editor;
const stateOf = (seen: Seen) => editorOf(seen).store.getState();
const elementsOf = (seen: Seen, code: PrintAreaCode = stateOf(seen).activeSurface) =>
  stateOf(seen).document.surfaces[code]?.elements ?? [];
const drawingsOf = (seen: Seen, code?: PrintAreaCode) =>
  elementsOf(seen, code).filter((el): el is DrawingElement => el.type === "drawing");

/** The overlay of the active surface and a mapper from its (u, v) mm to the screen px pointer events carry. */
function stageOf(seen: Seen) {
  const svg = document.querySelector<SVGSVGElement>("svg[data-stage-overlay]");
  if (!svg) throw new Error("No stage overlay");
  const surface = seen.current!.surfaces.byCode[stateOf(seen).activeSurface]!;
  const k = Number(svg.getAttribute("viewBox")!.split(" ")[2]) / surface.flatBounds.width;
  const toScreen = (u: number, v: number) => {
    const { x, y } = surface.toFlat(u, v);
    return { clientX: (x - surface.flatBounds.x) * k, clientY: (y - surface.flatBounds.y) * k };
  };
  return { svg, surface, toScreen };
}

/** Presses the mouse at the first point of `path` (surface mm), drags through the others and, with `release`, lets go. */
async function drag(
  user: UserEvent,
  seen: Seen,
  path: [number, number][],
  { release = true }: { release?: boolean } = {},
) {
  const { svg, toScreen } = stageOf(seen);
  const [first, ...rest] = path.map(([u, v]) => toScreen(u, v));
  await user.pointer([
    { keys: "[MouseLeft>]", target: svg, coords: first! },
    ...rest.map((coords) => ({ coords })),
    ...(release ? [{ keys: "[/MouseLeft]" }] : []),
  ]);
}

const nextFrame = () =>
  act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

const pickTool = (user: UserEvent, name: string) =>
  user.click(screen.getByRole("button", { name }));
const showTab = (user: UserEvent, name: "Thuộc tính" | "Lớp") =>
  user.click(screen.getByRole("tab", { name }));
const slider = (name: string) => screen.getByRole("slider", { name });
const undoButton = () => screen.getByRole("button", { name: "Hoàn tác (Ctrl+Z)" });
const undo = (user: UserEvent) => user.click(undoButton());
const focusStage = () => act(() => screen.getByRole("group", { name: /^Khung vẽ/ }).focus());

/** A drawing of one red stroke 20 mm long, at (u, 55) on the cup body. */
const ink = (id: string, u: number, overrides: Partial<DrawingElement> = {}) =>
  drawingEl(id, {
    placement: { u, v: 55, rotationDeg: 0, scale: 1 },
    strokes: [
      {
        mode: "draw",
        color: "#DC2626",
        sizeMm: 4,
        points: [
          [0, 0, 0.5],
          [20, 0, 0.5],
        ],
      },
    ],
    ...overrides,
  });
const logo = (id = "logo") =>
  imageEl(id, {
    placement: { u: 100, v: 55, rotationDeg: 0, scale: 1 },
    widthMm: 30,
    heightMm: 30,
  });

describe("the brush", () => {
  it("draws a stroke into a new drawing layer as one undo step", async () => {
    const user = userEvent.setup();
    const seen = await openBag();
    await pickTool(user, "Vẽ (B)");

    await drag(user, seen, [
      [80, 100],
      [120, 120],
      [160, 160],
    ]);

    const [drawing] = drawingsOf(seen);
    expect(drawing).toMatchObject({ name: "Nét vẽ 1", opacity: 1, hidden: false, locked: false });
    // Placed where the pen went down, upright and unscaled; its points are local to that.
    expect(drawing!.placement).toMatchObject({ rotationDeg: 0, scale: 1 });
    expect(drawing!.placement.u).toBeCloseTo(80, 6);
    expect(drawing!.placement.v).toBeCloseTo(100, 6);
    expect(drawing!.strokes).toHaveLength(1);
    const [stroke] = drawing!.strokes;
    expect(stroke).toMatchObject({ mode: "draw", color: "#000000", sizeMm: 2 });
    expect(stroke!.points.map(([x, y]) => [Math.round(x), Math.round(y)])).toEqual([
      [0, 0],
      [40, 20],
      [80, 60],
    ]);
    expect(stroke!.points.every(([, , pressure]) => pressure === 0.5)).toBe(true);
    // The new layer is selected, so the next stroke joins it, and the brush stays the tool.
    expect(stateOf(seen).selectedId).toBe(drawing!.id);
    expect(stateOf(seen).tool).toBe("brush");
    expect(screen.getByText("Đã thêm lớp nét vẽ")).toBeInTheDocument();

    // The press focused the stage, so Ctrl+Z works straight away: the layer and its stroke go together.
    await showTab(user, "Lớp");
    expect(screen.getByRole("option", { name: "Nét vẽ 1" })).toBeInTheDocument();
    focusStage();
    await user.keyboard("{Control>}z{/Control}");
    expect(screen.queryByRole("option", { name: "Nét vẽ 1" })).not.toBeInTheDocument();
    expect(stateOf(seen).canUndo).toBe(false);
    await user.keyboard("{Control>}{Shift>}z{/Shift}{/Control}");
    expect(screen.getByRole("option", { name: "Nét vẽ 1" })).toBeInTheDocument();
  });

  it("focuses the stage, so Ctrl+Z undoes a stroke right after it is drawn", async () => {
    const user = userEvent.setup();
    const seen = await openBag();
    await pickTool(user, "Vẽ (B)");

    await drag(user, seen, [
      [80, 100],
      [120, 100],
    ]);
    expect(drawingsOf(seen)).toHaveLength(1);
    await user.keyboard("{Control>}z{/Control}");

    expect(drawingsOf(seen)).toHaveLength(0);
  });

  it("draws the next strokes into the same layer, one undo step each", async () => {
    const user = userEvent.setup();
    const seen = await openBag();
    await pickTool(user, "Vẽ (B)");

    await drag(user, seen, [
      [80, 100],
      [120, 100],
    ]);
    await drag(user, seen, [
      [80, 150],
      [120, 190],
    ]);

    expect(drawingsOf(seen)).toHaveLength(1);
    expect(drawingsOf(seen)[0]!.strokes).toHaveLength(2);
    await undo(user);
    expect(drawingsOf(seen)[0]!.strokes).toHaveLength(1);
    await undo(user);
    expect(drawingsOf(seen)).toHaveLength(0);
  });

  it("starts a new layer, numbered after the others, when the selection is let go", async () => {
    const user = userEvent.setup();
    const seen = await openBag();
    await pickTool(user, "Vẽ (B)");
    await drag(user, seen, [
      [80, 100],
      [120, 100],
    ]);

    await user.click(screen.getByRole("button", { name: "Tạo lớp vẽ mới" }));
    expect(stateOf(seen).selectedId).toBeNull();
    await drag(user, seen, [
      [80, 150],
      [120, 150],
    ]);

    expect(drawingsOf(seen).map((d) => d.name)).toEqual(["Nét vẽ 1", "Nét vẽ 2"]);
    await showTab(user, "Lớp");
    expect(screen.getByRole("option", { name: "Nét vẽ 2" })).toBeInTheDocument();
  });

  it("uses the brush's size, colour and opacity", async () => {
    const user = userEvent.setup();
    const seen = await openBag();
    await pickTool(user, "Vẽ (B)");
    act(() => editorOf(seen).setBrush({ sizeMm: 6, color: "#DC2626", opacity: 0.5 }));

    await drag(user, seen, [
      [80, 100],
      [120, 100],
    ]);

    const [drawing] = drawingsOf(seen);
    expect(drawing).toMatchObject({ opacity: 0.5 });
    expect(drawing!.strokes[0]).toMatchObject({ mode: "draw", color: "#DC2626", sizeMm: 6 });
  });

  it("reads the pen's pressure, and takes 0.5 where the device reports none", async () => {
    const seen = await openBag();
    act(() => editorOf(seen).setTool("brush"));
    const { svg, toScreen } = stageOf(seen);
    const pen = { pointerId: 7, pointerType: "pen", button: 0 };

    fireEvent.pointerDown(svg, { ...pen, pressure: 0.8, ...toScreen(80, 100) });
    fireEvent.pointerMove(svg, { ...pen, pressure: 0.3, ...toScreen(120, 100) });
    fireEvent.pointerMove(svg, { ...pen, pressure: 0, ...toScreen(160, 140) });
    fireEvent.pointerUp(svg, { ...pen, pressure: 0, ...toScreen(160, 140) });

    // A pointer's pressure is a single-precision float.
    const pressures = drawingsOf(seen)[0]!.strokes[0]!.points.map(([, , p]) => p);
    expect(pressures).toHaveLength(3);
    expect(pressures[0]).toBeCloseTo(0.8, 5);
    expect(pressures[1]).toBeCloseTo(0.3, 5);
    expect(pressures[2]).toBe(0.5);
  });

  it("puts a tap down as a dot", async () => {
    const user = userEvent.setup();
    const seen = await openBag();
    await pickTool(user, "Vẽ (B)");
    const { svg, toScreen } = stageOf(seen);

    await user.pointer({ keys: "[MouseLeft]", target: svg, coords: toScreen(100, 100) });

    const [drawing] = drawingsOf(seen);
    expect(drawing!.strokes[0]!.points).toHaveLength(1);
    expect(drawing!.strokes[0]!.points[0]!.slice(0, 2)).toEqual([0, 0]);
  });

  it("simplifies a straight run to its ends but keeps a corner", async () => {
    const user = userEvent.setup();
    const seen = await openBag();
    await pickTool(user, "Vẽ (B)");

    await drag(user, seen, [
      ...Array.from({ length: 11 }, (_, i): [number, number] => [60 + i * 10, 100]),
      [160, 140],
    ]);

    const points = drawingsOf(seen)[0]!.strokes[0]!.points;
    expect(points.map(([x, y]) => [Math.round(x), Math.round(y)])).toEqual([
      [0, 0],
      [100, 0],
      [100, 40],
    ]);
  });

  it("reads points through the drawing's own matrix: turned, scaled, and on the cup", async () => {
    const user = userEvent.setup();
    const seen = await openBag();
    act(() => {
      editorOf(seen).apply((doc) =>
        addElement(
          doc,
          "FRONT",
          drawingEl("d", { placement: { u: 100, v: 100, rotationDeg: 90, scale: 2 } }),
        ),
      );
      editorOf(seen).select("d");
      editorOf(seen).setTool("brush");
    });

    await drag(user, seen, [
      [100, 100],
      [100, 110],
    ]);

    // 10 mm down the face is 5 local mm along the turned, doubled x axis; the 2 mm brush is 1 local mm.
    const [stroke] = drawingsOf(seen)[0]!.strokes;
    expect(stroke!.sizeMm).toBeCloseTo(1, 6);
    expect(stroke!.points[0]!.slice(0, 2)).toEqual([0, 0]);
    expect(stroke!.points[1]![0]).toBeCloseTo(5, 6);
    expect(stroke!.points[1]![1]).toBeCloseTo(0, 6);
  });

  it("puts the ink under the pointer on the cup, whose upright turns across the band", async () => {
    const user = userEvent.setup();
    const seen = await openCup();
    await pickTool(user, "Vẽ (B)");
    const { surface } = stageOf(seen);
    expect(Math.abs(surface.toFlat(230, 55).uprightRad)).toBeGreaterThan(0.1);

    await drag(user, seen, [
      [230, 55],
      [240, 70],
    ]);

    const [drawing] = drawingsOf(seen);
    const matrix = elementMatrix(drawing!, surface);
    const ends = drawing!.strokes[0]!.points.map(([x, y]) => applyToPoint(matrix, { x, y }));
    for (const [point, [u, v]] of [
      [ends[0]!, [230, 55]],
      [ends[1]!, [240, 70]],
    ] as const) {
      const flat = surface.toFlat(u, v);
      expect(point.x).toBeCloseTo(flat.x, 6);
      expect(point.y).toBeCloseTo(flat.y, 6);
    }
  });

  it("leaves the elements under it alone: the brush draws, it does not select or drag", async () => {
    const user = userEvent.setup();
    const seen = await openCup([logo()]);
    await pickTool(user, "Vẽ (B)");

    await drag(user, seen, [
      [100, 55],
      [140, 55],
    ]);

    const [picture] = elementsOf(seen);
    expect(picture).toMatchObject({ id: "logo", placement: { u: 100, v: 55 } });
    expect(drawingsOf(seen)).toHaveLength(1);
    expect(stateOf(seen).selectedId).toBe(drawingsOf(seen)[0]!.id);
  });

  it("does not start a stroke outside the printable area", async () => {
    const user = userEvent.setup();
    const seen = await openBag();
    await pickTool(user, "Vẽ (B)");
    const { svg } = stageOf(seen);

    await user.pointer([
      { keys: "[MouseLeft>]", target: svg, coords: { clientX: -40, clientY: 20 } },
      { coords: { clientX: 40, clientY: 40 } },
      { keys: "[/MouseLeft]" },
    ]);

    expect(drawingsOf(seen)).toHaveLength(0);
    expect(stateOf(seen).canUndo).toBe(false);
    // The same drag from inside the face draws.
    await drag(user, seen, [
      [20, 20],
      [60, 40],
    ]);
    expect(drawingsOf(seen)).toHaveLength(1);
  });

  it("draws nothing while the design is read-only", async () => {
    const user = userEvent.setup();
    const seen = await openDesign(MOCK_DESIGN_IDS.approvedCup);
    expect(screen.getByRole("button", { name: "Vẽ (B)" })).toBeDisabled();
    act(() => editorOf(seen).setTool("brush"));

    await drag(user, seen, [
      [100, 55],
      [140, 55],
    ]);

    expect(drawingsOf(seen)).toHaveLength(0);
    expect(stateOf(seen).canUndo).toBe(false);
    // The same drag draws once the design can be edited.
    act(() => editorOf(seen).setReadOnly(false));
    await drag(user, seen, [
      [100, 55],
      [140, 55],
    ]);
    expect(drawingsOf(seen)).toHaveLength(1);
  });
});

describe("a stroke under way", () => {
  it("is shown by the live preview and is not an edit until it is let go", async () => {
    const user = userEvent.setup();
    const seen = await openBag();
    await pickTool(user, "Vẽ (B)");
    const { repaint, livePreview } = seen.current!;
    const repaints: [readonly PrintAreaCode[], string][] = [];
    repaint.subscribe((codes, cause) => repaints.push([codes, cause]));
    const revision = stateOf(seen).revision;

    await drag(
      user,
      seen,
      [
        [80, 100],
        [120, 120],
      ],
      { release: false },
    );
    await nextFrame();

    const shown = livePreview.document?.surfaces.FRONT?.elements.at(-1);
    expect(shown).toMatchObject({ type: "drawing", name: "Nét vẽ 1" });
    expect((shown as DrawingElement).strokes[0]!.points.length).toBeGreaterThan(1);
    expect(repaints).toContainEqual([["FRONT"], "edit"]);
    // Nothing of it is in the document: no undo step, no autosave, no new layer.
    expect(stateOf(seen).revision).toBe(revision);
    expect(drawingsOf(seen)).toHaveLength(0);
    expect(stateOf(seen).canUndo).toBe(false);

    await user.pointer({ keys: "[/MouseLeft]" });
    expect(livePreview.document).toBeNull();
    expect(drawingsOf(seen)).toHaveLength(1);
    expect(stateOf(seen).revision).toBe(revision + 1);
  });

  it("repaints the stage and the 1024 px texture each frame, then the sharp 2048 px one", async () => {
    const user = userEvent.setup();
    const seen = await openBag();
    await pickTool(user, "Vẽ (B)");
    const recorded = recordingCtx();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      recorded.ctx as unknown as CanvasRenderingContext2D,
    );
    act(() => editorOf(seen).setBrush({ color: "#7C3AED" }));
    // The height of the front's texture each time the 3D model is handed one.
    const heights: number[] = [];
    built
      .at(-1)!
      .setSurfaceTexture.mockImplementation((code: string, canvas: HTMLCanvasElement) => {
        if (code === "FRONT") heights.push(canvas.height);
      });

    await drag(
      user,
      seen,
      [
        [80, 100],
        [120, 120],
      ],
      { release: false },
    );
    await nextFrame();
    await nextFrame();

    expect(recorded.sets.fillStyle).toContain("#7C3AED");
    expect(heights).toContain(1024);
    expect(drawingsOf(seen)).toHaveLength(0);

    await user.pointer({ keys: "[/MouseLeft]" });
    await waitFor(() => expect(heights.at(-1)).toBe(2048), { timeout: 2000 });
    expect(drawingsOf(seen)).toHaveLength(1);
  });

  it("is dropped without a trace by a second finger, and by pointercancel", async () => {
    const seen = await openBag();
    act(() => editorOf(seen).setTool("brush"));
    const { svg, toScreen } = stageOf(seen);
    const finger = (pointerId: number) => ({ pointerId, pointerType: "touch", button: 0 });

    fireEvent.pointerDown(svg, { ...finger(1), ...toScreen(80, 100) });
    fireEvent.pointerMove(svg, { ...finger(1), ...toScreen(120, 100) });
    await nextFrame();
    expect(seen.current!.livePreview.document).not.toBeNull();
    fireEvent.pointerDown(svg, { ...finger(2), ...toScreen(160, 160) });
    fireEvent.pointerMove(svg, { ...finger(1), ...toScreen(130, 100) });
    fireEvent.pointerUp(svg, finger(1));
    fireEvent.pointerUp(svg, finger(2));

    expect(seen.current!.livePreview.document).toBeNull();
    expect(drawingsOf(seen)).toHaveLength(0);
    expect(stateOf(seen).canUndo).toBe(false);

    fireEvent.pointerDown(svg, { ...finger(3), ...toScreen(80, 100) });
    fireEvent.pointerMove(svg, { ...finger(3), ...toScreen(120, 100) });
    fireEvent.pointerCancel(svg, finger(3));
    expect(seen.current!.livePreview.document).toBeNull();
    expect(drawingsOf(seen)).toHaveLength(0);
    expect(stateOf(seen).canUndo).toBe(false);

    // One finger draws as before.
    fireEvent.pointerDown(svg, { ...finger(4), ...toScreen(80, 100) });
    fireEvent.pointerMove(svg, { ...finger(4), ...toScreen(120, 100) });
    fireEvent.pointerUp(svg, finger(4));
    expect(drawingsOf(seen)).toHaveLength(1);
  });
});

describe("the eraser", () => {
  /** The strokes of drawing `id` by mode, in order. */
  const modesOf = (seen: Seen, id: string) =>
    drawingsOf(seen)
      .find((d) => d.id === id)!
      .strokes.map((s) => s.mode);

  it("cuts the topmost drawing, and only it, when no drawing is selected", async () => {
    const user = userEvent.setup();
    const seen = await openCup([logo(), ink("low", 100), ink("high", 170)]);
    const before = elementsOf(seen);
    await pickTool(user, "Tẩy (E)");

    await drag(user, seen, [
      [175, 55],
      [180, 55],
    ]);

    expect(modesOf(seen, "high")).toEqual(["draw", "erase"]);
    expect(modesOf(seen, "low")).toEqual(["draw"]);
    expect(elementsOf(seen)[0]).toBe(before[0]); // the logo is the very same element
    expect(elementsOf(seen)[1]).toBe(before[1]);
    const erase = drawingsOf(seen).find((d) => d.id === "high")!.strokes[1]!;
    expect(erase).toMatchObject({ mode: "erase", sizeMm: 5 });
    expect(stateOf(seen).selectedId).toBeNull(); // the eraser never changes the selection
    await undo(user);
    expect(modesOf(seen, "high")).toEqual(["draw"]);
  });

  it("cuts the selected drawing even when another is above it", async () => {
    const user = userEvent.setup();
    const seen = await openCup([ink("low", 100), ink("high", 170)]);
    act(() => editorOf(seen).select("low"));
    await pickTool(user, "Tẩy (E)");

    await drag(user, seen, [
      [105, 55],
      [110, 55],
    ]);

    expect(modesOf(seen, "low")).toEqual(["draw", "erase"]);
    expect(modesOf(seen, "high")).toEqual(["draw"]);
  });

  it("takes the topmost drawing when something else is selected, and skips a hidden one", async () => {
    const user = userEvent.setup();
    const seen = await openCup([logo(), ink("low", 100), ink("high", 170, { hidden: true })]);
    act(() => editorOf(seen).select("logo"));
    await pickTool(user, "Tẩy (E)");

    await drag(user, seen, [
      [105, 55],
      [110, 55],
    ]);

    expect(modesOf(seen, "low")).toEqual(["draw", "erase"]);
    expect(modesOf(seen, "high")).toEqual(["draw"]);
    expect(stateOf(seen).selectedId).toBe("logo");
  });

  it("does nothing on a surface with no drawing, and says why", async () => {
    const user = userEvent.setup();
    const seen = await openCup([logo()]);
    const before = stateOf(seen).document;
    await pickTool(user, "Tẩy (E)");
    expect(screen.getByText(/chưa có nét vẽ nào để tẩy/)).toBeInTheDocument();

    await drag(user, seen, [
      [100, 55],
      [110, 55],
    ]);

    expect(stateOf(seen).document).toBe(before);
    expect(stateOf(seen).canUndo).toBe(false);
  });

  it("does nothing to a locked drawing", async () => {
    const user = userEvent.setup();
    const seen = await openCup([ink("shut", 100, { locked: true })]);
    act(() => editorOf(seen).select("shut"));
    await pickTool(user, "Tẩy (E)");

    await drag(user, seen, [
      [105, 55],
      [110, 55],
    ]);

    expect(modesOf(seen, "shut")).toEqual(["draw"]);
    expect(stateOf(seen).canUndo).toBe(false);
    // Unlocked, the same drag cuts it.
    act(() => editorOf(seen).apply((doc) => updateElement(doc, "BODY", "shut", { locked: false })));
    await drag(user, seen, [
      [105, 55],
      [110, 55],
    ]);
    expect(modesOf(seen, "shut")).toEqual(["draw", "erase"]);
  });
});

describe("the tool panels", () => {
  it("name no tool as coming later", async () => {
    const user = userEvent.setup();
    await openBag();

    for (const tool of ["Vẽ (B)", "Tẩy (E)", "Nền (G)"]) {
      await pickTool(user, tool);
      expect(screen.queryByText(/bản cập nhật tới/)).not.toBeInTheDocument();
    }
  });

  it("set the brush's size, colour and opacity, and warn about white on kraft", async () => {
    const user = userEvent.setup();
    const seen = await openBag();
    await pickTool(user, "Vẽ (B)");

    const size = slider("Cỡ bút");
    expect(size).toHaveAttribute("aria-valuetext", "2 mm");
    act(() => size.focus());
    await user.keyboard("{ArrowRight}");
    expect(stateOf(seen).brush.sizeMm).toBe(2.5);
    expect(size).toHaveAttribute("aria-valuetext", "2,5 mm");

    const colours = screen.getByRole("group", { name: "Màu bút" });
    await user.click(within(colours).getByRole("button", { name: "Đỏ #DC2626" }));
    expect(stateOf(seen).brush.color).toBe("#DC2626");
    expect(screen.queryByText("Giấy kraft không in được màu trắng.")).not.toBeInTheDocument();
    await user.click(within(colours).getByRole("button", { name: "Trắng #FFFFFF" }));
    expect(screen.getByText("Giấy kraft không in được màu trắng.")).toBeInTheDocument();

    act(() => slider("Độ mờ đục").focus());
    await user.keyboard("{Home}");
    expect(stateOf(seen).brush.opacity).toBe(0.05);
  });

  it("show the selected drawing's opacity and set it, one undo step per change", async () => {
    const user = userEvent.setup();
    const seen = await openCup([ink("d", 100, { opacity: 0.8 })]);
    act(() => editorOf(seen).select("d"));
    await pickTool(user, "Vẽ (B)");

    const opacity = slider("Độ mờ đục");
    expect(opacity).toHaveAttribute("aria-valuetext", "80 %");
    act(() => opacity.focus());
    await user.keyboard("{Home}");
    expect(drawingsOf(seen)[0]!.opacity).toBe(0.05);
    await undo(user);
    expect(drawingsOf(seen)[0]!.opacity).toBe(0.8);
  });

  it("give the eraser only its size", async () => {
    const user = userEvent.setup();
    const seen = await openCup([ink("d", 100)]);
    await pickTool(user, "Tẩy (E)");

    const size = slider("Cỡ tẩy");
    expect(size).toHaveAttribute("aria-valuetext", "5 mm");
    act(() => size.focus());
    await user.keyboard("{ArrowRight}");
    expect(stateOf(seen).eraser.sizeMm).toBe(5.5);
    expect(screen.queryByRole("group", { name: "Màu bút" })).not.toBeInTheDocument();
    expect(screen.queryByRole("slider", { name: "Độ mờ đục" })).not.toBeInTheDocument();
    expect(screen.queryByRole("slider", { name: "Cỡ bút" })).not.toBeInTheDocument();
    expect(screen.queryByText(/chưa có nét vẽ nào để tẩy/)).not.toBeInTheDocument();
  });

  it("list a drawing's strokes under its properties", async () => {
    const user = userEvent.setup();
    const seen = await openCup([
      ink("d", 100, {
        strokes: [
          ...ink("x", 0).strokes,
          { mode: "erase", color: "#000000", sizeMm: 5, points: [[1, 1, 0.5]] },
        ],
      }),
    ]);

    act(() => editorOf(seen).select("d"));
    await showTab(user, "Thuộc tính");

    expect(screen.getByRole("heading", { name: "Nét vẽ" })).toBeInTheDocument();
    expect(screen.getByText("1 nét vẽ, 1 lần tẩy")).toBeInTheDocument();
  });
});

describe("the background", () => {
  const backgroundOf = (seen: Seen, code: PrintAreaCode) =>
    stateOf(seen).document.surfaces[code]?.background;
  const radio = (name: string) => screen.getByRole("radio", { name });

  it("is none, a colour or a pattern, one face at a time", async () => {
    const user = userEvent.setup();
    const seen = await openBag();
    await pickTool(user, "Nền (G)");
    expect(radio("Không nền")).toBeChecked();

    await user.click(radio("Màu"));
    expect(backgroundOf(seen, "FRONT")).toMatchObject({ kind: "color" });
    const colours = screen.getByRole("group", { name: "Màu nền" });
    await user.click(within(colours).getByRole("button", { name: "Xanh dương #2563EB" }));
    expect(backgroundOf(seen, "FRONT")).toEqual({ kind: "color", color: "#2563EB" });

    await user.click(radio("Hoạ tiết"));
    expect(backgroundOf(seen, "FRONT")).toMatchObject({
      kind: "pattern",
      patternId: "dots",
      colors: ["#2563EB", expect.any(String)],
    });

    await user.click(screen.getByRole("tab", { name: "Mặt sau" }));
    expect(radio("Không nền")).toBeChecked();
    expect(backgroundOf(seen, "BACK")).toEqual({ kind: "none" });
    await user.click(screen.getByRole("tab", { name: "Mặt trước" }));
    expect(radio("Hoạ tiết")).toBeChecked();

    await user.click(radio("Không nền"));
    expect(backgroundOf(seen, "FRONT")).toEqual({ kind: "none" });
    await undo(user);
    expect(backgroundOf(seen, "FRONT")).toMatchObject({ kind: "pattern" });
  });

  it("warns that kraft cannot print a white background", async () => {
    const user = userEvent.setup();
    await openBag();
    await pickTool(user, "Nền (G)");
    await user.click(radio("Màu"));

    const colours = screen.getByRole("group", { name: "Màu nền" });
    await user.click(within(colours).getByRole("button", { name: "Trắng #FFFFFF" }));

    expect(screen.getByText("Giấy kraft không in được màu trắng.")).toBeInTheDocument();
  });

  it("picks a pattern from previews drawn by the engine, with two colours, a scale and a rotation", async () => {
    const user = userEvent.setup();
    const seen = await openBag();
    const painted = new Map<HTMLCanvasElement, RecordingCtx>();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (
      this: HTMLCanvasElement,
    ) {
      const rec = painted.get(this) ?? recordingCtx();
      painted.set(this, rec);
      return rec.ctx as unknown as CanvasRenderingContext2D;
    } as never);
    await pickTool(user, "Nền (G)");
    await user.click(radio("Hoạ tiết"));

    const previews = [
      ...screen.getByRole("radiogroup", { name: "Hoạ tiết" }).querySelectorAll("canvas"),
    ];
    expect(previews).toHaveLength(6);
    for (const canvas of previews) {
      const rec = painted.get(canvas)!;
      expect(rec.sets.fillStyle?.[0]).toBe("#9CA3AF"); // the ground first, then the motif
      expect(rec.sets.fillStyle).toContain("#374151");
    }

    await user.click(radio("Kẻ sọc"));
    expect(backgroundOf(seen, "FRONT")).toMatchObject({ patternId: "stripes" });
    await user.click(radio("Chấm bi"));
    expect(backgroundOf(seen, "FRONT")).toMatchObject({ patternId: "dots" });

    const motif = screen.getByRole("group", { name: "Màu hoạ tiết" });
    await user.click(within(motif).getByRole("button", { name: "Đỏ #DC2626" }));
    const ground = screen.getByRole("group", { name: "Màu nền hoạ tiết" });
    await user.click(within(ground).getByRole("button", { name: "Vàng #FACC15" }));
    expect(backgroundOf(seen, "FRONT")).toMatchObject({ colors: ["#FACC15", "#DC2626"] });

    const scale = slider("Cỡ hoạ tiết");
    expect(scale).toHaveAttribute("aria-valuetext", "10 mm");
    act(() => scale.focus());
    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(backgroundOf(seen, "FRONT")).toMatchObject({ scale: 12 });
    act(() => slider("Góc xoay hoạ tiết").focus());
    await user.keyboard("{End}");
    expect(backgroundOf(seen, "FRONT")).toMatchObject({ rotationDeg: 180 });
    await user.keyboard("{Home}");
    expect(backgroundOf(seen, "FRONT")).toMatchObject({ rotationDeg: 0 });

    await undo(user); // the rotation went from 180 to 0 as one step of its own
    expect(backgroundOf(seen, "FRONT")).toMatchObject({ rotationDeg: 180 });
  });

  it("sets a pattern background on every bag face in one undo step", async () => {
    const user = userEvent.setup();
    const seen = await openBag();
    await pickTool(user, "Nền (G)");
    await user.click(radio("Hoạ tiết"));
    await user.click(radio("Chấm bi"));
    const front = backgroundOf(seen, "FRONT");

    await user.click(screen.getByRole("button", { name: "Áp dụng cho mọi mặt" }));

    expect(screen.getByText("Đã áp dụng nền cho mọi mặt")).toBeInTheDocument();
    for (const [code, tab] of [
      ["FRONT", "Mặt trước"],
      ["BACK", "Mặt sau"],
      ["LEFT", "Hông trái"],
      ["RIGHT", "Hông phải"],
    ] as const) {
      expect(backgroundOf(seen, code)).toEqual(front);
      await user.click(screen.getByRole("tab", { name: tab }));
      expect(radio("Hoạ tiết")).toBeChecked();
      expect(radio("Chấm bi")).toBeChecked();
    }

    await undo(user);
    for (const code of ["BACK", "LEFT", "RIGHT"] as const) {
      expect(backgroundOf(seen, code)).toEqual({ kind: "none" });
    }
    expect(backgroundOf(seen, "FRONT")).toEqual(front);
  });

  it("offers 'Áp dụng cho mọi mặt' on a bag only", async () => {
    const user = userEvent.setup();
    await openCup();
    await pickTool(user, "Nền (G)");

    expect(radio("Không nền")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Áp dụng cho mọi mặt" })).not.toBeInTheDocument();
  });

  it("cannot be changed while the design is read-only", async () => {
    const seen = await openDesign(MOCK_DESIGN_IDS.approvedCup);
    act(() => editorOf(seen).setTool("background"));

    expect(radio("Màu")).toBeDisabled();
  });
});
