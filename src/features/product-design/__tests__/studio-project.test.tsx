import { act, createEvent, fireEvent, screen, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import {
  addDesignToProject,
  archiveProject,
  createProject,
  getProject,
  listProjectLibrary,
  saveTextStyle,
  uploadLibraryImage,
} from "../api";
import { LIBRARY_DRAG_TYPE } from "../components/studio/asset-drag";
import { DesignStudio } from "../components/studio/design-studio";
import { safeBox } from "../components/studio/safe-fit";
import type { StudioServices } from "../components/studio/studio-context";
import { placeTextStyle } from "../components/studio/text-actions";
import {
  elementOutline,
  emptyDocument,
  MAX_ELEMENTS_PER_SURFACE,
  type PrintAreaCode,
  type ImageElement,
  type TextElement,
} from "../engine";
import { cup12oz, imageEl, pngBytes, textEl } from "../engine/__tests__/fixtures";
import { libraryTextSchema, textStyleSchema } from "../library-schemas";
import { STORE_ROUTES } from "@/constants";
import { MOCK_DESIGN_IDS } from "@/lib/api/mock-fixtures/design-seed";
import {
  designBackend,
  draftIn,
  STUDIO_PRODUCTS,
  type DesignBackend,
  type StudioProduct,
} from "./design-backend";
import { bagDocument, TEST_FONTS } from "./fixtures";
import { libraryImageDto, libraryTextDto, textStyleDto } from "./project-fixtures";

/** The real calls, taken before any spy replaces them. */
const REAL_GET = api.get.bind(api);
const REAL_POST = api.post.bind(api);
type PostSpy = DesignBackend["post"];

const env = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: env.push, replace: vi.fn() }),
}));
vi.setConfig({ testTimeout: 30_000 });

beforeEach(() => {
  env.push.mockReset();
  signIn();
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

const LISTED = { timeout: 8000 };
type Seen = { current?: StudioServices };

/** jsdom lays nothing out: the stage gets a size so it has a scale; its canvas sits at (0, 0). */
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
  vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(900);
  vi.spyOn(Element.prototype, "clientHeight", "get").mockReturnValue(700);
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
  await screen.findByRole("group", { name: /^Khung vẽ/ }, LISTED);
  return seen;
}

const textStyle = textStyleSchema.parse(textStyleDto({ fontCode: "be-vietnam-pro", sizePt: 20 }));

/** A cup draft inside a project whose library holds one image ("logo.png") and one text style. */
async function inProject(
  document = emptyDocument(cup12oz),
  logo = pngBytes(600, 600),
  product: StudioProduct = STUDIO_PRODUCTS.cup,
) {
  const backend = await designBackend();
  const designId = await draftIn(backend.store, product, document, "Ly thử");
  const project = await createProject({ name: "Bộ ly quán Hoa" });
  await addDesignToProject(project.id, designId);
  const image = await uploadLibraryImage(
    project.id,
    new File([logo], "logo.png", { type: "image/png" }),
    "logo.png",
    "key-1",
  );
  const text = await saveTextStyle(project.id, { text: "Cà phê Sữa", style: textStyle });
  return { ...backend, designId, project, image, text };
}

/** Closes the project, as its owner does on the page. */
const close = async (id: string) => archiveProject(id, { version: (await getProject(id)).version });

const imagesOf = (seen: Seen) =>
  seen
    .current!.editor.store.getState()
    .document.surfaces.BODY!.elements.filter((el): el is ImageElement => el.type === "image");
const textsOf = (seen: Seen) =>
  seen
    .current!.editor.store.getState()
    .document.surfaces.BODY!.elements.filter((el): el is TextElement => el.type === "text");

const openImagePanel = (user: UserEvent) =>
  user.click(screen.getByRole("button", { name: "Ảnh/Logo (U)" }));
const openTextPanel = (user: UserEvent) =>
  user.click(screen.getByRole("button", { name: "Chữ (T)" }));
const stage = () => screen.getByRole("group", { name: "Khung vẽ Thân ly" });
const libraryTile = () =>
  screen.findByRole("button", { name: "Thêm ảnh logo.png từ thư viện dự án" }, LISTED);

describe("the header of a design in a project", () => {
  it("names the project, links to its page, and sends the back button there", async () => {
    const { designId, project } = await inProject();
    await openStudio(designId);

    const link = screen.getByRole("link", { name: /Bộ ly quán Hoa/ });
    expect(link).toHaveAttribute("href", STORE_ROUTES.design.project(project.id));
    expect(link.className).toContain("min-h-11"); // a 44 px target
    expect(screen.getByRole("link", { name: "Dự án" })).toHaveAttribute(
      "href",
      STORE_ROUTES.design.project(project.id),
    );
    expect(screen.queryByRole("link", { name: "Thiết kế của tôi" })).not.toBeInTheDocument();
  });

  it("keeps the unsaved-changes dialog and leaves for the project page", async () => {
    const user = userEvent.setup();
    const { designId, project } = await inProject();
    const seen = await openStudio(designId);
    act(() => seen.current!.editor.apply((doc) => ({ ...doc }))); // an edit not stored yet
    await user.click(screen.getByRole("link", { name: "Dự án" }));

    await user.click(await screen.findByRole("button", { name: "Rời đi" }));
    expect(env.push).toHaveBeenCalledWith(STORE_ROUTES.design.project(project.id));
  });

  it("asks before the project name leaves with an unsaved edit, like the back link", async () => {
    const user = userEvent.setup();
    const { designId, project } = await inProject();
    const seen = await openStudio(designId);
    act(() => seen.current!.editor.apply((doc) => ({ ...doc })));
    await user.click(screen.getByRole("link", { name: /Bộ ly quán Hoa/ }));

    expect(env.push).not.toHaveBeenCalled();
    expect(await screen.findByText("Thay đổi chưa được lưu")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Rời đi" }));
    expect(env.push).toHaveBeenCalledWith(STORE_ROUTES.design.project(project.id));
  });

  it("shows nothing new for a design outside any project", async () => {
    const backend = await designBackend();
    await openStudio(await draftIn(backend.store, STUDIO_PRODUCTS.cup, emptyDocument(cup12oz)));

    expect(screen.getByRole("link", { name: "Thiết kế của tôi" })).toHaveAttribute(
      "href",
      STORE_ROUTES.design.list,
    );
    expect(screen.queryByRole("link", { name: /Dự án/ })).not.toBeInTheDocument();
    const user = userEvent.setup();
    await openImagePanel(user);
    expect(screen.queryByRole("heading", { name: "Thư viện dự án" })).not.toBeInTheDocument();
    await openTextPanel(user);
    expect(screen.queryByRole("heading", { name: "Mẫu chữ của dự án" })).not.toBeInTheDocument();
  });
});

describe("placing a library image", () => {
  it("copies it into the design through the server, then places the copy", async () => {
    const user = userEvent.setup();
    const { designId, post } = await inProject();
    const seen = await openStudio(designId);
    await openImagePanel(user);
    expect(screen.getByRole("heading", { name: "Thư viện dự án" })).toBeInTheDocument();
    expect(imagesOf(seen)).toHaveLength(0);

    await user.click(await libraryTile());

    await vi.waitFor(() => expect(imagesOf(seen)).toHaveLength(1), LISTED);
    const copies = post.mock.calls.filter(([url]) => String(url).endsWith("/assets/from-library"));
    expect(copies).toHaveLength(1);
    expect(copies[0]![0]).toBe(`/designs/${designId}/assets/from-library`);
    expect(imagesOf(seen)[0]!.name).toBe("logo.png");
    // The copy is the design's own asset, not the library item.
    expect(imagesOf(seen)[0]!.assetId).not.toBe("");
  });

  it("says the variant's rule on FILE_RULE and places nothing", async () => {
    const user = userEvent.setup();
    const { designId, post } = await inProject();
    post.mockImplementation((url, ...rest) =>
      String(url).endsWith("/assets/from-library")
        ? Promise.reject(
            new ApiError(422, "FILE_RULE", "Refused", undefined, undefined, {
              rule: "FORMAT",
              contentType: "image/png",
              formats: ["image/jpeg"],
            }),
          )
        : REAL_POST(url, ...rest),
    );
    const seen = await openStudio(designId);
    await openImagePanel(user);

    await user.click(await libraryTile());

    expect(await screen.findByRole("alert", {}, LISTED)).toHaveTextContent(
      "Quy cách này chỉ nhận ảnh JPG.",
    );
    expect(imagesOf(seen)).toHaveLength(0);
  });

  it("places at the dropped point when a tile is dragged onto the sheet", async () => {
    sizeTheStage();
    const user = userEvent.setup();
    const { designId, post, image } = await inProject(
      emptyDocument(cup12oz),
      pngBytes(1200, 120), // wide and low: room to move it
    );
    const seen = await openStudio(designId);
    await openImagePanel(user);
    const tile = await libraryTile();
    expect(tile).toHaveAttribute("draggable", "true");
    const setData = vi.fn();
    fireEvent.dragStart(tile, { dataTransfer: { setData, effectAllowed: "" } });
    expect(setData).toHaveBeenCalledWith(LIBRARY_DRAG_TYPE, image.id);

    const dataTransfer = {
      types: [LIBRARY_DRAG_TYPE],
      files: [] as File[],
      getData: (type: string) => (type === LIBRARY_DRAG_TYPE ? image.id : ""),
    };
    const over = createEvent.dragOver(stage(), { dataTransfer });
    fireEvent(stage(), over);
    expect(over.defaultPrevented).toBe(true);

    // A point a little off the middle of the surface, as the client sees it (the stage's scale: the
    // bleed box fitted in the 900 x 700 viewport less its 24 px gutter, at zoom 1).
    const surface = seen.current!.surfaces.byCode.BODY!;
    const bounds = surface.flatBounds;
    const k = Math.min((900 - 48) / bounds.width, (700 - 48) / bounds.height);
    const centre = safeBox(surface);
    const target = surface.toFlat(centre.u + 12, centre.v + 6);
    const drop = createEvent.drop(stage(), { dataTransfer });
    Object.defineProperty(drop, "clientX", { value: (target.x - bounds.x) * k });
    Object.defineProperty(drop, "clientY", { value: (target.y - bounds.y) * k });
    fireEvent(stage(), drop);

    await vi.waitFor(() => expect(imagesOf(seen)).toHaveLength(1), LISTED);
    // Centred on the dropped point itself, where the whole image fits.
    const placed = imagesOf(seen)[0]!.placement;
    const expected = surface.fromFlat(target.x, target.y);
    expect(placed.u).toBeCloseTo(expected.u, 3);
    expect(placed.v).toBeCloseTo(expected.v, 3);
    expect(placed.u).not.toBeCloseTo(centre.u, 1);
    expect(post.mock.calls.some(([url]) => String(url).endsWith("/assets/from-library"))).toBe(
      true,
    );
  });

  it("still places from a closed project (A-E2)", async () => {
    const user = userEvent.setup();
    const { designId, project } = await inProject();
    await close(project.id);
    const seen = await openStudio(designId);
    await openImagePanel(user);

    await user.click(await libraryTile());

    await vi.waitFor(() => expect(imagesOf(seen)).toHaveLength(1), LISTED);
  });
});

describe("placing a saved text style", () => {
  it("adds a text with the saved content and style, selected", async () => {
    const user = userEvent.setup();
    const { designId } = await inProject();
    const seen = await openStudio(designId);
    await openTextPanel(user);
    expect(screen.getByRole("heading", { name: "Mẫu chữ của dự án" })).toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: /Cà phê Sữa/ }, LISTED));

    const [text] = textsOf(seen);
    expect(text).toMatchObject({
      content: "Cà phê Sữa",
      fontCode: "be-vietnam-pro",
      sizePt: 20,
      color: "#112233",
      bold: true,
      letterSpacingEm: 0.05,
    });
    expect(seen.current!.editor.store.getState().selectedId).toBe(text!.id);
  });

  it("lowers the scale of a text wider than the safe area until it fits", async () => {
    const { designId } = await inProject();
    const seen = await openStudio(designId);
    const services = seen.current!;
    const item = libraryTextSchema.parse(
      libraryTextDto({ text: "W".repeat(120), name: "Dài", style: textStyleDto({ sizePt: 40 }) }),
    );

    let id: string | null = null;
    act(() => {
      id = placeTextStyle(services, item);
    });

    expect(id).not.toBeNull();
    const [text] = textsOf(seen);
    expect(text!.sizePt).toBe(40); // the saved size is kept
    expect(text!.placement.scale).toBeLessThan(1);
    const surface = services.surfaces.byCode.BODY!;
    const outline = elementOutline(text!, surface, services.sizer(text!));
    expect(outline.every((point) => surface.contains(point, "safe"))).toBe(true);
    expect(safeBox(surface).width).toBeGreaterThan(0);
  });

  it("keeps a short text at scale 1, and uses the first allowed font when the saved one is gone", async () => {
    const { designId } = await inProject();
    const seen = await openStudio(designId);
    const item = libraryTextSchema.parse(
      libraryTextDto({ text: "Hi", style: textStyleDto({ fontCode: "no-such-font" }) }),
    );

    act(() => {
      placeTextStyle(seen.current!, item);
    });

    const [text] = textsOf(seen);
    expect(text!.placement.scale).toBe(1);
    expect(Object.keys(TEST_FONTS)).toContain(text!.fontCode);
    expect(text!.fontCode).not.toBe("no-such-font");
  });
});

describe("saving into the project library", () => {
  const openMore = (user: UserEvent) => user.click(screen.getByRole("button", { name: "Thêm" }));

  it("saves the selected text with its style fields", async () => {
    const user = userEvent.setup();
    const { designId, project } = await inProject({
      ...emptyDocument(cup12oz),
      surfaces: {
        BODY: {
          background: { kind: "none" },
          elements: [
            textEl("t1", {
              content: "Trà đào",
              sizePt: 31,
              bold: false,
              italic: false,
              color: "#AA0000",
              align: "left",
              letterSpacingEm: 0.1,
              lineHeight: 1.5,
            }),
          ],
        },
      },
    });
    const seen = await openStudio(designId);
    act(() => seen.current!.editor.select("t1"));
    await openMore(user);

    const save = await screen.findByRole("button", { name: "Lưu thành mẫu chữ của dự án" });
    await vi.waitFor(() => expect(save).toBeEnabled(), LISTED); // once the library is read
    await user.click(save);

    await screen.findByText("Đã lưu mẫu chữ vào thư viện dự án", undefined, LISTED);
    // Said where the button is, and kept shut: a second click would store the same style again.
    expect(screen.getByText("Đã lưu vào thư viện dự án")).toBeVisible();
    expect(screen.getByRole("button", { name: "Lưu thành mẫu chữ của dự án" })).toBeDisabled();
    const saved = (await listProjectLibrary(project.id)).find(
      (item) => item.kind === "TEXT" && item.text === "Trà đào",
    );
    expect(saved?.kind === "TEXT" && saved.style).toMatchObject({
      fontCode: "be-vietnam-pro",
      sizePt: 31,
      color: "#AA0000",
      bold: false,
      italic: false,
      align: "left",
      letterSpacingEm: 0.1,
      lineHeight: 1.5,
    });
  });

  it("saves the selected image through the server copy", async () => {
    const user = userEvent.setup();
    const { designId, project, post, image } = await inProject();
    // The design already holds the image (placed from the library, as a real one is).
    const seen = await openStudio(designId);
    await openImagePanel(user);
    await user.click(await libraryTile());
    await vi.waitFor(() => expect(imagesOf(seen)).toHaveLength(1), LISTED);
    const placed = imagesOf(seen)[0]!;
    act(() => seen.current!.editor.select(placed.id));
    await openMore(user);

    const save = await screen.findByRole("button", { name: "Lưu ảnh vào thư viện dự án" });
    await vi.waitFor(() => expect(save).toBeEnabled(), LISTED);
    await user.click(save);

    await screen.findByText("Đã lưu ảnh vào thư viện dự án", undefined, LISTED);
    expect(screen.getByText("Đã lưu vào thư viện dự án")).toBeVisible();
    expect(screen.getByRole("button", { name: "Lưu ảnh vào thư viện dự án" })).toBeDisabled();
    const copy = post.mock.calls.find(([url]) =>
      String(url).endsWith("/library/images/from-design"),
    );
    expect(copy?.[0]).toBe(`/design-projects/${project.id}/library/images/from-design`);
    expect(copy?.[1]).toEqual({ designId, assetId: placed.assetId });
    expect((await listProjectLibrary(project.id)).filter((i) => i.kind === "IMAGE")).toHaveLength(
      2,
    );
    expect(image.kind).toBe("IMAGE");
  });

  it("locks the save with the reason when the library holds 30 text styles", async () => {
    const user = userEvent.setup();
    const { designId, get } = await inProject({
      ...emptyDocument(cup12oz),
      surfaces: {
        BODY: { background: { kind: "none" }, elements: [textEl("t1")] },
      },
    });
    const full = Array.from({ length: 30 }, (_, i) =>
      libraryTextDto({ id: `7a1b0000-0000-4000-8000-${String(i).padStart(12, "0")}` }),
    );
    get.mockImplementation((url, ...rest) =>
      String(url).endsWith("/library")
        ? Promise.resolve({ data: full } as never)
        : REAL_GET(url, ...rest),
    );
    const seen = await openStudio(designId);
    act(() => seen.current!.editor.select("t1"));
    await openMore(user);

    const save = await screen.findByRole("button", { name: "Lưu thành mẫu chữ của dự án" });
    await vi.waitFor(
      () => expect(save).toHaveAccessibleDescription("Thư viện đã đủ 30 mẫu chữ"),
      LISTED,
    );
    expect(save).toBeDisabled();
  });

  it("locks both saves with the reason once the project is closed", async () => {
    const user = userEvent.setup();
    const { designId, project } = await inProject({
      ...emptyDocument(cup12oz),
      surfaces: {
        BODY: { background: { kind: "none" }, elements: [textEl("t1"), imageEl("i1")] },
      },
    });
    await close(project.id);
    const seen = await openStudio(designId);

    act(() => seen.current!.editor.select("t1"));
    await openMore(user);
    const saveText = await screen.findByRole("button", { name: "Lưu thành mẫu chữ của dự án" });
    await vi.waitFor(() => expect(saveText).toHaveAccessibleDescription("Dự án đã đóng"), LISTED);
    expect(saveText).toBeDisabled();
    await user.keyboard("{Escape}");

    act(() => seen.current!.editor.select("i1"));
    await openMore(user);
    const saveImage = await screen.findByRole("button", { name: "Lưu ảnh vào thư viện dự án" });
    await vi.waitFor(() => expect(saveImage).toHaveAccessibleDescription("Dự án đã đóng"), LISTED);
    expect(saveImage).toBeDisabled();
  });

  it("offers nothing to save for a design outside a project", async () => {
    const user = userEvent.setup();
    const backend = await designBackend();
    const id = await draftIn(
      backend.store,
      STUDIO_PRODUCTS.cup,
      {
        ...emptyDocument(cup12oz),
        surfaces: { BODY: { background: { kind: "none" }, elements: [textEl("t1")] } },
      },
      "Ly lẻ",
    );
    const seen = await openStudio(id);
    act(() => seen.current!.editor.select("t1"));
    await openMore(user);

    const more = await screen.findByRole("dialog");
    expect(
      within(more).queryByRole("button", { name: "Lưu thành mẫu chữ của dự án" }),
    ).not.toBeInTheDocument();
  });
});

describe("a read-only design", () => {
  it("has no Ảnh or Chữ panel, so no project library to place from", async () => {
    await designBackend();
    const project = await createProject({ name: "Bộ ly quán Hoa" });
    await addDesignToProject(project.id, MOCK_DESIGN_IDS.pending); // waiting for review: read-only
    await openStudio(MOCK_DESIGN_IDS.pending);

    expect(screen.getByRole("link", { name: /Bộ ly quán Hoa/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ảnh/Logo (U)" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Chữ (T)" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Thư viện dự án" })).not.toBeInTheDocument();
  });
});

/** Holds the copy of a library placement until `release()`; the real call answers after it. */
function holdCopies(post: PostSpy) {
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  post.mockImplementation(async (url, ...rest) => {
    if (String(url).endsWith("/assets/from-library")) await held;
    return REAL_POST(url, ...rest);
  });
  return release;
}
/** Makes the copy of a library placement fail with `error`. */
function refuseCopies(post: PostSpy, error: ApiError) {
  post.mockImplementation(async (url, ...rest) => {
    if (String(url).endsWith("/assets/from-library")) throw error;
    return REAL_POST(url, ...rest);
  });
}
const copiesIn = (post: PostSpy) =>
  post.mock.calls.filter(([url]) => String(url).endsWith("/assets/from-library")).length;
const libraryDrop = (id: string) => {
  const dataTransfer = {
    types: [LIBRARY_DRAG_TYPE],
    files: [] as File[],
    getData: (type: string) => (type === LIBRARY_DRAG_TYPE ? id : ""),
  };
  const over = createEvent.dragOver(stage(), { dataTransfer });
  fireEvent(stage(), over);
  const drop = createEvent.drop(stage(), { dataTransfer });
  Object.defineProperty(drop, "clientX", { value: 0 });
  Object.defineProperty(drop, "clientY", { value: 0 });
  fireEvent(stage(), drop);
  return over;
};

describe("one library placement at a time", () => {
  it("ignores a second click or drop while a copy runs, and disables the tiles", async () => {
    sizeTheStage();
    const user = userEvent.setup();
    const { designId, post, image } = await inProject();
    const release = holdCopies(post);
    const seen = await openStudio(designId);
    await openImagePanel(user);
    const tile = await libraryTile();

    await user.click(tile);
    await vi.waitFor(() => expect(tile).toBeDisabled(), LISTED);
    await user.click(tile);
    expect(libraryDrop(image.id).defaultPrevented).toBe(false); // the stage takes no drop now
    release();

    await vi.waitFor(() => expect(imagesOf(seen)).toHaveLength(1), LISTED);
    await new Promise((resolve) => setTimeout(resolve, 400)); // nothing else is queued behind it
    expect(copiesIn(post)).toBe(1);
    expect(imagesOf(seen)).toHaveLength(1);
  });

  it("places where it was clicked when the customer changes face during the copy", async () => {
    const user = userEvent.setup();
    const { designId, post } = await inProject(
      bagDocument(),
      pngBytes(600, 600),
      STUDIO_PRODUCTS.bag,
    );
    const release = holdCopies(post);
    const seen = await openStudio(designId);
    const { editor, template } = seen.current!;
    const [first, other] = template.printAreas.map((area) => area.code);
    editor.setActiveSurface(first!);
    await openImagePanel(user);

    await user.click(await libraryTile());
    act(() => editor.setActiveSurface(other!));
    release();

    const imagesOn = (code: PrintAreaCode) =>
      (editor.store.getState().document.surfaces[code]?.elements ?? []).filter(
        (el) => el.type === "image",
      );
    await vi.waitFor(() => expect(imagesOn(first!)).toHaveLength(1), LISTED);
    expect(imagesOn(other!)).toHaveLength(0);
    expect(editor.store.getState().activeSurface).toBe(first);
  });
});

describe("refusals of a library placement", () => {
  it("says NOT_IN_PROJECT and places nothing", async () => {
    const user = userEvent.setup();
    const { designId, post } = await inProject();
    refuseCopies(post, new ApiError(422, "NOT_IN_PROJECT", "No"));
    const seen = await openStudio(designId);
    await openImagePanel(user);

    await user.click(await libraryTile());

    expect(await screen.findByRole("alert", {}, LISTED)).toHaveTextContent(
      "Bản thiết kế này không thuộc dự án của thư viện.",
    );
    expect(imagesOf(seen)).toHaveLength(0);
  });

  it("shows a refused drop in the Ảnh panel, as it does for a click", async () => {
    sizeTheStage();
    const user = userEvent.setup();
    const { designId, post, image } = await inProject();
    refuseCopies(
      post,
      new ApiError(422, "FILE_RULE", "No", undefined, undefined, {
        rule: "FORMAT",
        contentType: "image/png",
        formats: ["image/jpeg"],
      }),
    );
    const seen = await openStudio(designId);
    await openImagePanel(user);
    await libraryTile();

    libraryDrop(image.id);

    expect(await screen.findByRole("alert", {}, LISTED)).toHaveTextContent(
      "Quy cách này chỉ nhận ảnh JPG.",
    );
    expect(imagesOf(seen)).toHaveLength(0);
  });
});

describe("a stale refusal", () => {
  it("goes when the customer changes face", async () => {
    const user = userEvent.setup();
    const { designId, post } = await inProject(
      bagDocument(),
      pngBytes(600, 600),
      STUDIO_PRODUCTS.bag,
    );
    refuseCopies(post, new ApiError(422, "NOT_IN_PROJECT", "No"));
    const seen = await openStudio(designId);
    await openImagePanel(user);
    await user.click(await libraryTile());
    expect(await screen.findByRole("alert", {}, LISTED)).toBeInTheDocument();

    const { editor, template } = seen.current!;
    act(() => editor.setActiveSurface(template.printAreas[1]!.code));
    await vi.waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument(), LISTED);
  });
});

describe("more limits", () => {
  const full = (kind: "IMAGE" | "TEXT") =>
    Array.from({ length: 30 }, (_, i) => {
      const id = `7a1b0000-0000-4000-8000-${String(i).padStart(12, "0")}`;
      return kind === "IMAGE" ? libraryImageDto({ id }) : libraryTextDto({ id });
    });

  it("adds no saved style to a surface that holds 200 elements, and says so in the panel", async () => {
    const user = userEvent.setup();
    const crowded = {
      ...emptyDocument(cup12oz),
      surfaces: {
        BODY: {
          background: { kind: "none" as const },
          elements: Array.from({ length: MAX_ELEMENTS_PER_SURFACE }, (_, i) => textEl(`t${i}`)),
        },
      },
    };
    const { designId } = await inProject(crowded);
    const seen = await openStudio(designId);
    const item = libraryTextSchema.parse(libraryTextDto());

    let id: string | null = "x";
    act(() => {
      id = placeTextStyle(seen.current!, item);
    });
    expect(id).toBeNull();
    expect(textsOf(seen)).toHaveLength(MAX_ELEMENTS_PER_SURFACE);

    await openTextPanel(user);
    await user.click(
      await screen.findByRole("button", { name: /Thêm mẫu chữ Cà phê Sữa/ }, LISTED),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("đã đủ số phần tử tối đa");
  });

  it("locks the image save with the reason when the library holds 30 images", async () => {
    const user = userEvent.setup();
    const { designId, get } = await inProject({
      ...emptyDocument(cup12oz),
      surfaces: { BODY: { background: { kind: "none" }, elements: [imageEl("i1")] } },
    });
    get.mockImplementation((url, ...rest) =>
      String(url).endsWith("/library")
        ? Promise.resolve({ data: full("IMAGE") } as never)
        : REAL_GET(url, ...rest),
    );
    const seen = await openStudio(designId);
    act(() => seen.current!.editor.select("i1"));
    await user.click(screen.getByRole("button", { name: "Thêm" }));

    const save = await screen.findByRole("button", { name: "Lưu ảnh vào thư viện dự án" });
    await vi.waitFor(
      () => expect(save).toHaveAccessibleDescription("Thư viện đã đủ 30 ảnh"),
      LISTED,
    );
    expect(save).toBeDisabled();
  });
});
