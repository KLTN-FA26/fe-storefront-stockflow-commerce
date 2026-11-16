import { createEvent, fireEvent, screen } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { MOCK_DESIGN_IDS } from "@/lib/api/mock-fixtures/design-seed";
import type { DesignMockStore } from "@/lib/api/mock-fixtures/design-store";
import { settle } from "@/test/fake-backend";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { listDesignAssets } from "../api";
import { DesignStudio } from "../components/studio/design-studio";
import { ASSET_DRAG_TYPE } from "../components/studio/asset-drag";
import { ImageLibrary } from "../components/studio/image-library";
import { safeBox } from "../components/studio/safe-fit";
import type { StudioServices } from "../components/studio/studio-context";
import { elementOutline, emptyDocument, type ImageElement } from "../engine";
import { cup12oz, pngBytes } from "../engine/__tests__/fixtures";
import { designBackend, draftIn, STUDIO_PRODUCTS } from "./design-backend";
import { TEST_FONTS } from "./fixtures";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.setConfig({ testTimeout: 15_000 });

beforeEach(() => {
  signIn();
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

type Seen = { current?: StudioServices };

/** jsdom lays nothing out: the stage gets a size so it has a scale; its canvas sits at (0, 0). */
const STAGE = { width: 900, height: 700 };
function sizeTheStage() {
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
  vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(STAGE.width);
  vi.spyOn(Element.prototype, "clientHeight", "get").mockReturnValue(STAGE.height);
}

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
  await screen.findByRole("group", { name: /^Khung vẽ/ }, { timeout: 4000 });
  return seen;
}

const emptyCup = (studio: DesignMockStore) =>
  draftIn(studio, STUDIO_PRODUCTS.cup, emptyDocument(cup12oz), "Ly thử");

/** A draft that already holds `logo.png` (the approved cup's image), as a revision of it. */
async function draftWithLogo() {
  const backend = await designBackend();
  const forked = settle(await backend.store.revise(MOCK_DESIGN_IDS.approved)).data as {
    id: string;
  };
  return { ...backend, id: forked.id };
}

const imagesOf = (seen: Seen) =>
  seen
    .current!.editor.store.getState()
    .document.surfaces.BODY!.elements.filter((el): el is ImageElement => el.type === "image");

const openImagePanel = (user: UserEvent) =>
  user.click(screen.getByRole("button", { name: "Ảnh/Logo (U)" }));
const stage = () => screen.getByRole("group", { name: "Khung vẽ Thân ly" });
/** The 4 s the studio files give a mock round trip (~0.2 s each, slower in a loaded full run). */
const LISTED = { timeout: 4000 };
const tile = () => screen.findByRole("button", { name: "Thêm ảnh logo.png" }, LISTED);
const EMPTY = "Chưa có ảnh nào. Tải ảnh lên để bắt đầu.";

describe("the image library", () => {
  it("lists this design's images under Ảnh của bạn and places one on click", async () => {
    const user = userEvent.setup();
    const { id } = await draftWithLogo();
    const seen = await openStudio(id);
    await openImagePanel(user);

    expect(screen.getByRole("heading", { name: "Ảnh của bạn" })).toBeInTheDocument();
    const before = imagesOf(seen).length;
    await user.click(await tile());

    expect(imagesOf(seen)).toHaveLength(before + 1);
    expect(imagesOf(seen).at(-1)!.assetId).toBe(MOCK_DESIGN_IDS.logoAsset);
  });

  it("places one with Enter from the keyboard", async () => {
    const user = userEvent.setup();
    const { id } = await draftWithLogo();
    const seen = await openStudio(id);
    await openImagePanel(user);
    const before = imagesOf(seen).length;

    (await tile()).focus();
    await user.keyboard("{Enter}");

    expect(imagesOf(seen)).toHaveLength(before + 1);
  });

  it("says when there is nothing yet", async () => {
    const user = userEvent.setup();
    const { store } = await designBackend();
    await openStudio(await emptyCup(store));
    await openImagePanel(user);

    expect(await screen.findByText(EMPTY, undefined, LISTED)).toBeInTheDocument();
  });

  it("says when the list cannot be read, and tries again", async () => {
    const user = userEvent.setup();
    const { get } = await designBackend();
    get.mockRejectedValueOnce(new ApiError(403, "FORBIDDEN", "No"));
    renderWithProviders(
      <ImageLibrary designId={MOCK_DESIGN_IDS.approved} disabled={false} onPick={() => {}} />,
    );

    expect(await screen.findByRole("alert", {}, LISTED)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await tile()).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("says there is no preview when the picture's link fails, and the tile still places", async () => {
    const user = userEvent.setup();
    const original = api.get;
    const { get } = await designBackend();
    get.mockImplementation((url, ...rest) =>
      url.endsWith("/download-url")
        ? Promise.reject(new ApiError(403, "FORBIDDEN", "No"))
        : original.call(api, url, ...rest),
    );
    const onPick = vi.fn();
    renderWithProviders(
      <ImageLibrary designId={MOCK_DESIGN_IDS.approved} disabled={false} onPick={onPick} />,
    );

    expect(await screen.findByText("Không xem trước được", undefined, LISTED)).toBeInTheDocument();
    await user.click(await tile());
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it("shows an upload in the list", async () => {
    const user = userEvent.setup();
    const { store } = await designBackend();
    await openStudio(await emptyCup(store));
    await openImagePanel(user);
    await screen.findByText(EMPTY, undefined, LISTED);

    await user.upload(
      screen.getByLabelText("Kéo thả hoặc chọn ảnh"),
      new File([pngBytes(600, 600)], "logo.png", { type: "image/png" }),
    );

    await screen.findByText("Đã thêm ảnh", undefined, LISTED);
    await openImagePanel(user); // placing it handed the pointer back to the select tool
    expect(await tile()).toBeInTheDocument();
    expect(screen.queryByText(EMPTY)).not.toBeInTheDocument();
  });

  it("leaves a tile dragged over the upload dropzone alone: only files are taken there", async () => {
    const user = userEvent.setup();
    const { id } = await draftWithLogo();
    await openStudio(id);
    await openImagePanel(user);
    const zone = screen.getByLabelText("Kéo thả hoặc chọn ảnh").parentElement!;

    const asset = createEvent.dragOver(zone, { dataTransfer: { types: [ASSET_DRAG_TYPE] } });
    fireEvent(zone, asset);
    expect(asset.defaultPrevented).toBe(false);
    expect(zone).not.toHaveClass("border-accent");

    const files = createEvent.dragOver(zone, { dataTransfer: { types: ["Files"] } });
    fireEvent(zone, files);
    expect(files.defaultPrevented).toBe(true);
    expect(zone).toHaveClass("border-accent");
  });

  it("makes a tile draggable, carrying the asset", async () => {
    const user = userEvent.setup();
    const { id } = await draftWithLogo();
    await openStudio(id);
    await openImagePanel(user);
    const logo = await tile();
    expect(logo).toHaveAttribute("draggable", "true");

    const setData = vi.fn();
    fireEvent.dragStart(logo, { dataTransfer: { setData, effectAllowed: "" } });

    expect(setData).toHaveBeenCalledWith(ASSET_DRAG_TYPE, expect.stringContaining("logo.png"));
    expect(JSON.parse(setData.mock.calls[0]![1] as string)).toMatchObject({
      assetId: MOCK_DESIGN_IDS.logoAsset,
    });
  });
});

describe("dropping an image tile on the stage", () => {
  /** A drop at client (x, y): jsdom's generic drag event takes the point as plain properties. */
  function dropAt(x: number, y: number, types: Record<string, string>) {
    const dataTransfer = {
      types: Object.keys(types),
      files: [] as File[],
      getData: (type: string) => types[type] ?? "",
    };
    const event = createEvent.drop(stage(), { dataTransfer });
    Object.defineProperty(event, "clientX", { value: x });
    Object.defineProperty(event, "clientY", { value: y });
    fireEvent(stage(), event);
  }

  it("places the image centred at the dropped point", async () => {
    sizeTheStage();
    const user = userEvent.setup();
    const { id } = await draftWithLogo();
    const seen = await openStudio(id);
    await openImagePanel(user);
    const setData = vi.fn();
    fireEvent.dragStart(await tile(), { dataTransfer: { setData, effectAllowed: "" } });
    const surface = seen.current!.surfaces.byCode.BODY!;
    const bounds = surface.flatBounds;
    // The stage's scale: the bleed box fitted in the viewport less its 24 px gutter, at zoom 1.
    const k = Math.min((STAGE.width - 48) / bounds.width, (STAGE.height - 48) / bounds.height);
    // A point a little off the surface's middle, as the client sees it.
    const centre = safeBox(surface);
    const target = surface.toFlat(centre.u + 12, centre.v + 6);
    const before = imagesOf(seen).length;

    dropAt((target.x - bounds.x) * k, (target.y - bounds.y) * k, {
      [ASSET_DRAG_TYPE]: setData.mock.calls[0]![1] as string,
    });

    expect(imagesOf(seen)).toHaveLength(before + 1);
    const placed = imagesOf(seen).at(-1)!.placement;
    // The point as the surface reads it. A tall logo on the cup has almost no room to move, so
    // the centre is the nearest one to it, on the line from the safe centre to the point.
    const expected = surface.fromFlat(target.x, target.y);
    expect(placed.u).toBeGreaterThanOrEqual(centre.u - 1e-6);
    expect(placed.u).toBeLessThanOrEqual(expected.u + 1e-6);
    const along = (placed.u - centre.u) / (expected.u - centre.u);
    expect(placed.v).toBeCloseTo(centre.v + (expected.v - centre.v) * along, 4);
  });

  it("places at the point itself when the whole image fits there", async () => {
    sizeTheStage();
    const user = userEvent.setup();
    const { id } = await draftWithLogo();
    const seen = await openStudio(id);
    await openImagePanel(user);
    const setData = vi.fn();
    fireEvent.dragStart(await tile(), { dataTransfer: { setData, effectAllowed: "" } });
    const surface = seen.current!.surfaces.byCode.BODY!;
    const bounds = surface.flatBounds;
    const k = Math.min((STAGE.width - 48) / bounds.width, (STAGE.height - 48) / bounds.height);
    const centre = safeBox(surface);
    const target = surface.toFlat(centre.u, centre.v);

    dropAt((target.x - bounds.x) * k, (target.y - bounds.y) * k, {
      [ASSET_DRAG_TYPE]: setData.mock.calls[0]![1] as string,
    });

    const placed = imagesOf(seen).at(-1)!.placement;
    expect(placed.u).toBeCloseTo(centre.u, 3);
    expect(placed.v).toBeCloseTo(centre.v, 3);
  });

  it("ignores a drop that does not carry an image tile", async () => {
    sizeTheStage();
    const { id } = await draftWithLogo();
    const seen = await openStudio(id);
    const before = imagesOf(seen).length;

    dropAt(100, 100, { "text/plain": "hello" });

    expect(imagesOf(seen)).toHaveLength(before);
  });

  it("ignores a drop on a design that is read-only", async () => {
    sizeTheStage();
    await designBackend();
    const [asset] = await listDesignAssets(MOCK_DESIGN_IDS.approved);
    const seen = await openStudio(MOCK_DESIGN_IDS.approved);
    expect(seen.current!.readOnly).toBe(true);
    const before = imagesOf(seen).length;

    dropAt(100, 100, { [ASSET_DRAG_TYPE]: JSON.stringify(asset) });

    expect(imagesOf(seen)).toHaveLength(before);
  });
  it("accepts the drag over the stage from its types alone, as a browser lets it", () => {
    const dataTransfer = {
      types: [ASSET_DRAG_TYPE],
      getData: () => {
        throw new Error("the drag data is protected during dragover");
      },
      dropEffect: "none",
    };
    // jsdom has no drag events: the point is a plain event with the data on it.
    return (async () => {
      sizeTheStage();
      const { id } = await draftWithLogo();
      await openStudio(id);
      const over = createEvent.dragOver(stage(), { dataTransfer });
      fireEvent(stage(), over);
      expect(over.defaultPrevented).toBe(true);
      expect(dataTransfer.dropEffect).toBe("copy");

      const files = createEvent.dragOver(stage(), {
        dataTransfer: { types: ["Files"], getData: () => "", dropEffect: "none" },
      });
      fireEvent(stage(), files);
      expect(files.defaultPrevented).toBe(false);
    })();
  });

  it.each([
    ["the left edge", 0, 0.5],
    ["the right edge", 1, 0.5],
    ["the top edge", 0.5, 0],
    ["the bottom edge", 0.5, 1],
    ["the top-left corner", 0, 0],
    ["the bottom-right corner", 1, 1],
  ])("keeps the whole image inside the safe area when dropped on %s", async (_name, fu, fv) => {
    sizeTheStage();
    const user = userEvent.setup();
    const { id } = await draftWithLogo();
    const seen = await openStudio(id);
    await openImagePanel(user);
    const setData = vi.fn();
    fireEvent.dragStart(await tile(), { dataTransfer: { setData, effectAllowed: "" } });
    const surface = seen.current!.surfaces.byCode.BODY!;
    const bounds = surface.flatBounds;
    const k = Math.min((STAGE.width - 48) / bounds.width, (STAGE.height - 48) / bounds.height);
    const [u0, u1] = surface.uRange;
    const [v0, v1] = surface.vRange;
    const target = surface.toFlat(u0 + (u1 - u0) * fu, v0 + (v1 - v0) * fv);
    const before = imagesOf(seen).length;

    dropAt((target.x - bounds.x) * k, (target.y - bounds.y) * k, {
      [ASSET_DRAG_TYPE]: setData.mock.calls[0]![1] as string,
    });

    expect(imagesOf(seen)).toHaveLength(before + 1);
    const placed = imagesOf(seen).at(-1)!;
    const box = {
      x: -placed.widthMm / 2,
      y: -placed.heightMm / 2,
      width: placed.widthMm,
      height: placed.heightMm,
    };
    expect(elementOutline(placed, surface, box).every((p) => surface.contains(p, "safe"))).toBe(
      true,
    );
  });
});
