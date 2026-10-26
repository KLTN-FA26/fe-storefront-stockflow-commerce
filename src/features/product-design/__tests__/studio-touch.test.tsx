import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { seedMockCatalog } from "@/lib/api/mock-fixtures/catalog";
import type { MockDesignStudio } from "@/lib/api/mock-fixtures/designs";
import { settle } from "@/test/fake-backend";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { DesignStudio } from "../components/studio/design-studio";
import type { StudioServices } from "../components/studio/studio-context";
import { emptyDocument, MAX_ZOOM, type DesignElement, type DrawingElement } from "../engine";
import { cup12oz, imageEl, textEl } from "../engine/__tests__/fixtures";
import { fakeDesignBackend, mockStudio } from "./design-backend";
import { TEST_FONTS } from "./fixtures";

const env = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: env.push, replace: vi.fn() }),
}));
vi.mock("@/providers/app-providers", () => ({ useIsMock: () => true }));

// Each test renders the whole studio: well over 5 s in a loaded full run.
vi.setConfig({ testTimeout: 15_000 });

beforeEach(() => {
  env.push.mockReset();
  signIn();
  // jsdom has no canvas: `getContext` logs "not implemented" before answering null.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  Element.prototype.scrollIntoView = vi.fn();
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

/**
 * Answers `window.matchMedia` as a browser `width` px wide would (jsdom has none): the width
 * queries in px or rem (16 px per rem) and a touch screen's `(pointer: coarse)`.
 */
function stubViewport(width: number) {
  vi.stubGlobal("matchMedia", (query: string) => {
    const range = /^\((min|max)-width:\s*([\d.]+)(px|rem)\)$/.exec(query);
    const limit = range ? Number(range[2]) * (range[3] === "rem" ? 16 : 1) : 0;
    const matches = range
      ? range[1] === "min"
        ? width >= limit
        : width <= limit
      : query === "(pointer: coarse)";
    return { matches, media: query, addEventListener() {}, removeEventListener() {} };
  });
}

/**
 * jsdom lays nothing out: give the stage viewport a size (and a ResizeObserver that reports it)
 * so the stage has a scale and the overlay is drawn in screen px from the top-left at (0, 0).
 */
function sizeTheStage(width = 375, height = 480) {
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

const CUP_SLUG = "ly-giay-2-lop-12oz";
/** On the 12oz cup body: `u` across the band, half-way down it. */
const at = (u: number, v = 55) => ({ placement: { u, v, rotationDeg: 0, scale: 1 } });
const logo = () => imageEl("logo", { ...at(100), widthMm: 30, heightMm: 30 });
const coffee = () => textEl("text", { content: "Cà phê", ...at(170) });

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

type Seen = { current?: StudioServices };

/** Renders the studio of `designId`; resolves once it is laid out, with its latest services. */
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
  await screen.findByRole("group", { name: "Công cụ" });
  return seen;
}

async function openCup(elements: DesignElement[] = []) {
  const studio = mockStudio();
  fakeDesignBackend(studio);
  return openStudio(await cupDraft(studio, elements));
}

const stateOf = (seen: Seen) => seen.current!.editor.store.getState();
const elementOf = (seen: Seen, id: string) =>
  stateOf(seen).document.surfaces.BODY?.elements.find((element) => element.id === id);
const stageImage = () => screen.queryByRole("img", { name: /^Bản thiết kế/ });
const viewport = () => screen.getByRole("group", { name: /^Khung vẽ/ });
const nextFrame = () =>
  act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

const finger = (pointerId: number) => ({ pointerId, pointerType: "touch", button: 0 });

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
  return { svg, toScreen };
}

describe("two-finger zoom and pan of the stage", () => {
  beforeEach(() => {
    stubViewport(1180);
    sizeTheStage();
  });

  const zoomOf = (seen: Seen) => stateOf(seen).zoom;

  /** The gutter around the canvas: inside the stage viewport, outside the overlay. */
  const gutter = () => viewport().firstElementChild as HTMLElement;

  /**
   * A minimal layout for the canvas: its box sits at (20, 10) in the viewport, moves with the
   * viewport's scroll and has the size the stage gave it.
   */
  function layOutCanvas() {
    vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLCanvasElement,
    ) {
      const scroller = viewport();
      const [width, height] = [parseFloat(this.style.width), parseFloat(this.style.height)];
      const [left, top] = [20 - scroller.scrollLeft, 10 - scroller.scrollTop];
      return {
        left,
        top,
        width,
        height,
        x: left,
        y: top,
        right: left + width,
        bottom: top + height,
        toJSON: () => ({}),
      };
    });
  }

  it("takes no touch scrolling of its own: the fingers are the stage's", async () => {
    await openCup();

    expect(viewport()).toHaveClass("touch-none");
  });

  it("zooms with the spread of two fingers", async () => {
    const seen = await openCup();

    fireEvent.pointerDown(viewport(), { ...finger(1), clientX: 100, clientY: 200 });
    fireEvent.pointerDown(viewport(), { ...finger(2), clientX: 200, clientY: 200 });
    fireEvent.pointerMove(viewport(), { ...finger(2), clientX: 300, clientY: 200 });
    expect(zoomOf(seen)).toBeCloseTo(2, 6);
    expect(screen.getByLabelText("Mức phóng")).toHaveTextContent("200%");

    fireEvent.pointerMove(viewport(), { ...finger(2), clientX: 150, clientY: 200 });
    expect(zoomOf(seen)).toBeCloseTo(0.5, 6);
    fireEvent.pointerUp(viewport(), { ...finger(1) });
    fireEvent.pointerUp(viewport(), { ...finger(2) });
    expect(zoomOf(seen)).toBeCloseTo(0.5, 6);
  });

  it("answers at once when the fingers turn back at the zoom limit", async () => {
    const seen = await openCup();

    fireEvent.pointerDown(viewport(), { ...finger(1), clientX: 100, clientY: 200 });
    fireEvent.pointerDown(viewport(), { ...finger(2), clientX: 200, clientY: 200 });
    fireEvent.pointerMove(viewport(), { ...finger(2), clientX: 1100, clientY: 200 });
    expect(zoomOf(seen)).toBe(MAX_ZOOM);

    // 500 px apart: half of the 1000 px that hit the limit, so half of the limit.
    fireEvent.pointerMove(viewport(), { ...finger(2), clientX: 600, clientY: 200 });
    expect(zoomOf(seen)).toBeCloseTo(MAX_ZOOM / 2, 6);
  });

  it("keeps the pinched point of the canvas under the fingers", async () => {
    layOutCanvas();
    const seen = await openCup();
    const canvas = stageImage()!;
    const [width, height] = [parseFloat(canvas.style.width), parseFloat(canvas.style.height)];
    // Fractions of the canvas under the fingers' midpoint (150, 200), from its box at (20, 10).
    const [fx, fy] = [(150 - 20) / width, (200 - 10) / height];

    fireEvent.pointerDown(viewport(), { ...finger(1), clientX: 100, clientY: 200 });
    fireEvent.pointerDown(viewport(), { ...finger(2), clientX: 200, clientY: 200 });
    fireEvent.pointerMove(viewport(), { ...finger(2), clientX: 300, clientY: 200 });

    expect(zoomOf(seen)).toBeCloseTo(2, 6);
    const box = canvas.getBoundingClientRect();
    expect(box.width).toBeCloseTo(2 * width, 3);
    // The midpoint is now (200, 200): that is where the same point of the canvas must be.
    expect(box.left + fx * box.width).toBeCloseTo(200, 3);
    expect(box.top + fy * box.height).toBeCloseTo(200, 3);
  });

  it("pans the stage with two fingers moving together", async () => {
    layOutCanvas();
    await openCup();

    fireEvent.pointerDown(viewport(), { ...finger(1), clientX: 100, clientY: 200 });
    fireEvent.pointerDown(viewport(), { ...finger(2), clientX: 200, clientY: 200 });
    // Both fingers 40 px left and 30 px up: the content follows them, so the view scrolls right and down.
    fireEvent.pointerMove(viewport(), { ...finger(1), clientX: 60, clientY: 170 });
    fireEvent.pointerMove(viewport(), { ...finger(2), clientX: 160, clientY: 170 });

    expect(viewport().scrollLeft).toBeCloseTo(40, 3);
    expect(viewport().scrollTop).toBeCloseTo(30, 3);
  });

  it("ignores a mouse and a pen: one pointer is the tool's", async () => {
    const seen = await openCup();
    const pointer = (pointerId: number, pointerType: string) => ({ pointerId, pointerType });

    fireEvent.pointerDown(viewport(), { ...pointer(1, "mouse"), clientX: 100, clientY: 200 });
    fireEvent.pointerDown(viewport(), { ...pointer(2, "pen"), clientX: 200, clientY: 200 });
    fireEvent.pointerMove(viewport(), { ...pointer(2, "pen"), clientX: 400, clientY: 200 });

    expect(zoomOf(seen)).toBe(1);
  });

  it("drags an element with one finger and leaves the zoom alone", async () => {
    const seen = await openCup([logo()]);
    const { svg, toScreen } = stageOf(seen);
    const start = elementOf(seen, "logo")!.placement.u;

    fireEvent.pointerDown(svg, { ...finger(1), ...toScreen(100, 55) });
    fireEvent.pointerMove(svg, { ...finger(1), ...toScreen(140, 55) });
    fireEvent.pointerUp(svg, { ...finger(1), ...toScreen(140, 55) });

    expect(elementOf(seen, "logo")!.placement.u).toBeGreaterThan(start + 20);
    expect(zoomOf(seen)).toBe(1);
  });

  it("ends a drag where it stands when a second finger lands, keeping what was moved", async () => {
    const seen = await openCup([logo()]);
    const { svg, toScreen } = stageOf(seen);
    const start = elementOf(seen, "logo")!.placement.u;

    fireEvent.pointerDown(svg, { ...finger(1), ...toScreen(100, 55) });
    fireEvent.pointerMove(svg, { ...finger(1), ...toScreen(140, 55) });
    // The second finger lands outside the overlay, before the drag's frame has run.
    fireEvent.pointerDown(gutter(), { ...finger(2), clientX: 4, clientY: 4 });
    const kept = elementOf(seen, "logo")!.placement.u;
    expect(kept).toBeGreaterThan(start + 20);

    // The first finger keeps moving: that is the pinch's now, not the element's.
    fireEvent.pointerMove(svg, { ...finger(1), ...toScreen(180, 55) });
    await nextFrame();
    fireEvent.pointerUp(svg, { ...finger(1), ...toScreen(180, 55) });
    fireEvent.pointerUp(gutter(), { ...finger(2) });
    expect(elementOf(seen, "logo")!.placement.u).toBe(kept);

    // The part that was moved is one undo step.
    act(() => seen.current!.editor.undo());
    expect(elementOf(seen, "logo")!.placement.u).toBe(start);
    expect(stateOf(seen).canUndo).toBe(false);
  });

  it("does not let the second finger select or drag another element", async () => {
    const seen = await openCup([logo(), coffee()]);
    const { svg, toScreen } = stageOf(seen);
    const text = elementOf(seen, "text")!.placement.u;

    // The first finger presses empty stage; the second lands on the text.
    fireEvent.pointerDown(svg, { ...finger(1), ...toScreen(20, 100) });
    fireEvent.pointerDown(svg, { ...finger(2), ...toScreen(170, 55) });
    fireEvent.pointerMove(svg, { ...finger(2), ...toScreen(230, 55) });
    fireEvent.pointerUp(svg, { ...finger(1) });
    fireEvent.pointerUp(svg, { ...finger(2) });

    expect(stateOf(seen).selectedId).toBeNull();
    expect(elementOf(seen, "text")!.placement.u).toBe(text);
  });

  it("drops a brush stroke without a trace when a second finger lands anywhere on the stage", async () => {
    const seen = await openCup();
    act(() => seen.current!.editor.setTool("brush"));
    const { svg, toScreen } = stageOf(seen);
    const drawings = () =>
      (stateOf(seen).document.surfaces.BODY?.elements ?? []).filter(
        (el): el is DrawingElement => el.type === "drawing",
      );

    fireEvent.pointerDown(svg, { ...finger(1), ...toScreen(80, 100) });
    fireEvent.pointerMove(svg, { ...finger(1), ...toScreen(120, 100) });
    await nextFrame();
    expect(seen.current!.livePreview.document).not.toBeNull();

    fireEvent.pointerDown(gutter(), { ...finger(2), clientX: 4, clientY: 4 });
    expect(seen.current!.livePreview.document).toBeNull();
    fireEvent.pointerMove(svg, { ...finger(1), ...toScreen(160, 100) });
    fireEvent.pointerUp(svg, { ...finger(1), ...toScreen(160, 100) });
    fireEvent.pointerUp(gutter(), { ...finger(2) });

    expect(drawings()).toHaveLength(0);
    expect(stateOf(seen).canUndo).toBe(false);

    // Once both fingers are up, one finger draws as before.
    fireEvent.pointerDown(svg, { ...finger(3), ...toScreen(80, 100) });
    fireEvent.pointerMove(svg, { ...finger(3), ...toScreen(120, 100) });
    fireEvent.pointerUp(svg, { ...finger(3), ...toScreen(120, 100) });
    expect(drawings()).toHaveLength(1);
  });

  it("lets a pen stroke go on under a resting palm, and under two fingers (R61 narrowed)", async () => {
    const seen = await openCup();
    act(() => seen.current!.editor.setTool("brush"));
    const { svg, toScreen } = stageOf(seen);
    const pen = { pointerId: 9, pointerType: "pen", button: 0 };

    fireEvent.pointerDown(svg, { ...pen, ...toScreen(80, 100) });
    fireEvent.pointerMove(svg, { ...pen, ...toScreen(120, 100) });
    fireEvent.pointerDown(svg, { ...finger(1), ...toScreen(200, 60) }); // the palm
    fireEvent.pointerDown(gutter(), { ...finger(2), clientX: 4, clientY: 4 }); // and a second touch
    fireEvent.pointerMove(svg, { ...pen, ...toScreen(160, 100) });
    fireEvent.pointerUp(svg, { ...pen, ...toScreen(160, 100) });

    const drawn = (stateOf(seen).document.surfaces.BODY?.elements ?? []).filter(
      (el): el is DrawingElement => el.type === "drawing",
    );
    expect(drawn).toHaveLength(1);
    expect(drawn[0]!.strokes[0]!.points.length).toBeGreaterThan(1);
  });

  it("forgets fingers whose lift was never reported once a new touch begins", async () => {
    const seen = await openCup();
    act(() => seen.current!.editor.setTool("brush"));
    const { svg, toScreen } = stageOf(seen);

    // A finger lands and its pointerup is lost (the browser took it for something else).
    fireEvent.pointerDown(gutter(), { ...finger(1), isPrimary: true, clientX: 4, clientY: 4 });
    // The next touch is a new sequence: one finger, the brush's.
    fireEvent.pointerDown(svg, { ...finger(2), isPrimary: true, ...toScreen(80, 100) });
    fireEvent.pointerMove(svg, { ...finger(2), ...toScreen(120, 100) });
    fireEvent.pointerUp(svg, { ...finger(2), ...toScreen(120, 100) });

    expect(
      (stateOf(seen).document.surfaces.BODY?.elements ?? []).filter((el) => el.type === "drawing"),
    ).toHaveLength(1);
    expect(stateOf(seen).zoom).toBe(1);
  });
});

describe("a gesture whose end never came", () => {
  beforeEach(() => {
    stubViewport(1180);
    sizeTheStage();
  });
  const mouse = { pointerId: 1, pointerType: "mouse", button: 0 };
  const drawingsOf = (seen: Seen) =>
    (stateOf(seen).document.surfaces.BODY?.elements ?? []).filter(
      (el): el is DrawingElement => el.type === "drawing",
    );

  it("ends a drag whose pointer capture is lost, keeping what was moved", async () => {
    const seen = await openCup([logo()]);
    const { svg, toScreen } = stageOf(seen);
    const start = elementOf(seen, "logo")!.placement.u;

    fireEvent.pointerDown(svg, { ...finger(1), ...toScreen(100, 55) });
    fireEvent.pointerMove(svg, { ...finger(1), ...toScreen(140, 55) });
    fireEvent.lostPointerCapture(svg, finger(1));
    const kept = elementOf(seen, "logo")!.placement.u;
    expect(kept).toBeGreaterThan(start + 20);

    fireEvent.pointerMove(svg, { ...finger(1), ...toScreen(200, 55) });
    await nextFrame();
    expect(elementOf(seen, "logo")!.placement.u).toBe(kept);
  });

  it("ends a mouse drag when the mouse comes back with no button held", async () => {
    const seen = await openCup([logo()]);
    const { svg, toScreen } = stageOf(seen);

    fireEvent.pointerDown(svg, { ...mouse, buttons: 1, ...toScreen(100, 55) });
    fireEvent.pointerMove(svg, { ...mouse, buttons: 1, ...toScreen(140, 55) });
    await nextFrame();
    const moved = elementOf(seen, "logo")!.placement.u;
    // Released outside the window: the next move has no button down.
    fireEvent.pointerMove(svg, { ...mouse, buttons: 0, ...toScreen(220, 55) });
    fireEvent.pointerMove(svg, { ...mouse, buttons: 0, ...toScreen(260, 55) });
    await nextFrame();
    expect(elementOf(seen, "logo")!.placement.u).toBeCloseTo(moved, 0);
  });

  it("puts a stroke down when its pointer capture is lost or the mouse button came up elsewhere", async () => {
    const seen = await openCup();
    act(() => seen.current!.editor.setTool("brush"));
    const { svg, toScreen } = stageOf(seen);

    fireEvent.pointerDown(svg, { ...finger(1), ...toScreen(80, 100) });
    fireEvent.pointerMove(svg, { ...finger(1), ...toScreen(120, 100) });
    fireEvent.lostPointerCapture(svg, finger(1));
    expect(drawingsOf(seen)).toHaveLength(1);
    expect(seen.current!.livePreview.document).toBeNull();

    fireEvent.pointerDown(svg, { ...mouse, buttons: 1, ...toScreen(80, 60) });
    fireEvent.pointerMove(svg, { ...mouse, buttons: 1, ...toScreen(120, 60) });
    fireEvent.pointerMove(svg, { ...mouse, buttons: 0, ...toScreen(160, 60) });
    expect(drawingsOf(seen)[0]!.strokes).toHaveLength(2);
    // The next press starts a new stroke instead of being swallowed by a stuck one.
    fireEvent.pointerDown(svg, { ...mouse, buttons: 1, ...toScreen(80, 80) });
    fireEvent.pointerUp(svg, { ...mouse, ...toScreen(80, 80) });
    expect(drawingsOf(seen)[0]!.strokes).toHaveLength(3);
  });
});
