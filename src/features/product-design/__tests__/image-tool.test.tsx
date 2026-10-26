import { createHash } from "node:crypto";

import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/error";
import { seedMockCatalog } from "@/lib/api/mock-fixtures/catalog";
import { MOCK_DESIGN_IDS, type MockDesignStudio } from "@/lib/api/mock-fixtures/designs";
import { settle } from "@/test/fake-backend";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { DesignStudio } from "../components/studio/design-studio";
import type { StudioServices } from "../components/studio/studio-context";
import {
  effectiveDpi,
  elementOutline,
  emptyDocument,
  surfaceSnapTargets,
  type DesignElement,
  type ImageElement,
} from "../engine";
import { cup12oz, imageEl, pngBytes } from "../engine/__tests__/fixtures";
import { fakeDesignBackend, mockStudio } from "./design-backend";
import { TEST_FONTS } from "./fixtures";

const env = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: env.push, replace: vi.fn() }),
}));
vi.mock("@/providers/app-providers", () => ({ useIsMock: () => true }));
// jsdom cannot draw an SVG; the engine's own test covers what is sent to the browser.
const raster = vi.hoisted(() => ({ rasterizeSvg: vi.fn() }));
vi.mock("../engine/assets/svg", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../engine/assets/svg")>()),
  rasterizeSvg: raster.rasterizeSvg,
}));

// Each test renders the whole studio and drives it with userEvent: over 5 s in a loaded full run.
vi.setConfig({ testTimeout: 15_000 });

beforeEach(() => {
  signIn();
  raster.rasterizeSvg.mockReset();
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
const MIB = 1024 * 1024;

/** A new 12oz cup draft whose body holds `elements` (bottom first). */
async function cupDraft(studio: MockDesignStudio, elements: DesignElement[] = []) {
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

const png = (width: number, height: number, name = "logo.png") =>
  new File([pngBytes(width, height)], name, { type: "image/png" });

const imagesOf = (services: { current?: StudioServices }) =>
  services
    .current!.editor.store.getState()
    .document.surfaces.BODY!.elements.filter((el): el is ImageElement => el.type === "image");

const chooseImageTool = (user: UserEvent) =>
  user.click(screen.getByRole("button", { name: "Ảnh/Logo (U)" }));
const dropzone = () => screen.getByLabelText("Kéo thả hoặc chọn ảnh");
const stage = () => screen.getByRole("group", { name: "Khung vẽ Thân ly" });
const alert = () => screen.findByRole("alert");

/** The cup body's safe area as the engine's snap targets give it: centre, then left/right/top/bottom. */
function safeArea(services: { current?: StudioServices }) {
  const surface = services.current!.surfaces.byCode.BODY!;
  const [centreU, centreV, left, right, top, bottom] = surfaceSnapTargets(surface, []);
  return {
    u: centreU!.u!,
    v: centreV!.v!,
    width: right!.u! - left!.u!,
    height: bottom!.v! - top!.v!,
  };
}

/** Whether every point of the placed image's outline is inside the cup body's safe area. */
function insideSafe(services: { current?: StudioServices }, element: ImageElement) {
  const surface = services.current!.surfaces.byCode.BODY!;
  const box = {
    x: -element.widthMm / 2,
    y: -element.heightMm / 2,
    width: element.widthMm,
    height: element.heightMm,
  };
  return elementOutline(element, surface, box).every((point) => surface.contains(point, "safe"));
}

describe("tool panel", () => {
  it("shows the options of the active tool beside the rail", async () => {
    const user = userEvent.setup();
    const studio = mockStudio();
    fakeDesignBackend(studio);
    await openStudio(await cupDraft(studio));

    expect(screen.getByText(/để di chuyển, xoay hoặc đổi kích thước/)).toBeInTheDocument();
    await chooseImageTool(user);
    expect(dropzone()).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ảnh đã tải lên" })).toBeInTheDocument();
    expect(screen.getByText("Chưa có ảnh nào được tải lên.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Chữ (T)" }));
    expect(screen.queryByLabelText("Kéo thả hoặc chọn ảnh")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thêm chữ" })).toBeInTheDocument();
  });

  it("offers the template's formats and SVG in the file picker", async () => {
    const user = userEvent.setup();
    const studio = mockStudio();
    fakeDesignBackend(studio);
    await openStudio(await cupDraft(studio));
    await chooseImageTool(user);

    expect(dropzone()).toHaveAttribute("accept", "image/png,image/jpeg,image/webp,.svg");
  });
});

describe("uploading an image", () => {
  it("refuses a 9000 × 9000 PNG with a message", async () => {
    const user = userEvent.setup();
    const studio = mockStudio();
    const { post } = fakeDesignBackend(studio);
    const services = await openStudio(await cupDraft(studio));
    await chooseImageTool(user);

    await user.upload(dropzone(), png(9000, 9000));

    expect(await alert()).toHaveTextContent("Ảnh vượt 40 megapixel.");
    expect(post).not.toHaveBeenCalled();
    expect(imagesOf(services)).toEqual([]);
  });

  it("refuses a file type the template does not accept", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const studio = mockStudio();
    const { post } = fakeDesignBackend(studio);
    await openStudio(await cupDraft(studio));
    await chooseImageTool(user);

    await user.upload(dropzone(), new File(["GIF89a"], "anim.gif", { type: "image/gif" }));

    expect(await alert()).toHaveTextContent(
      "Định dạng không được hỗ trợ. Hỗ trợ: PNG, JPG, WebP, SVG.",
    );
    expect(post).not.toHaveBeenCalled();
  });

  it("refuses a file over the template's size limit before reading it", async () => {
    const user = userEvent.setup();
    const studio = mockStudio();
    const { post } = fakeDesignBackend(studio);
    await openStudio(await cupDraft(studio));
    await chooseImageTool(user);

    const big = png(1200, 800);
    Object.defineProperty(big, "size", { value: 20 * MIB + 1 }); // maxFileSizeMb is 20 (MiB)
    await user.upload(dropzone(), big);

    expect(await alert()).toHaveTextContent("Tệp lớn hơn 20 MB.");
    expect(post).not.toHaveBeenCalled();
  });

  it("refuses a file whose header gives no size", async () => {
    const user = userEvent.setup();
    const studio = mockStudio();
    const { post } = fakeDesignBackend(studio);
    await openStudio(await cupDraft(studio));
    await chooseImageTool(user);

    await user.upload(dropzone(), new File(["not a picture"], "x.png", { type: "image/png" }));

    expect(await alert()).toHaveTextContent("Không đọc được kích thước ảnh.");
    expect(post).not.toHaveBeenCalled();
  });

  it("uploads a PNG and places it centred with a DPI badge", async () => {
    const user = userEvent.setup();
    const studio = mockStudio();
    const { post } = fakeDesignBackend(studio);
    const services = await openStudio(await cupDraft(studio));
    await chooseImageTool(user);

    await user.upload(dropzone(), png(3000, 1000));

    expect(await screen.findByText("Đã thêm ảnh")).toBeInTheDocument();
    const [image] = imagesOf(services);
    expect(image).toMatchObject({ naturalWidthPx: 3000, naturalHeightPx: 1000 });
    // Centred on the safe area, 60 % of its width, the picture's 3:1 shape.
    const safe = safeArea(services);
    expect(image!.placement).toMatchObject({ u: safe.u, v: safe.v, rotationDeg: 0, scale: 1 });
    expect(image!.widthMm).toBeCloseTo(0.6 * safe.width, 6);
    expect(image!.heightMm).toBeCloseTo(image!.widthMm / 3, 6);
    // Selected, with the select tool back (only it has handles) and one undo step.
    const state = services.current!.editor.store.getState();
    expect(state).toMatchObject({ selectedId: image!.id, tool: "select" });

    // The badge reads what the image reaches where it sits.
    const dpi = Math.round(effectiveDpi(3000, image!.widthMm));
    expect(screen.getByText(/DPI/)).toHaveTextContent(`${dpi} DPI ✓`);
    expect(screen.getByText(/DPI/)).toHaveAttribute("data-tone", "positive");

    // The file goes up once, keyed by its bytes, name and type (R58: the BE replays a key only for
    // the same three, so identical bytes under another name must not share it).
    const key = createHash("sha256")
      .update(`${Buffer.from(pngBytes(3000, 1000)).toString("hex")}\0logo.png\0image/png`)
      .digest("hex");
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0]![2]).toMatchObject({ headers: { "Idempotency-Key": key } });
    expect((post.mock.calls[0]![1] as FormData).get("file")).toMatchObject({ name: "logo.png" });

    act(() => services.current!.editor.undo());
    expect(imagesOf(services)).toEqual([]);
  });

  it("stores the same bytes under two names as two images, and a true retry as one", async () => {
    const user = userEvent.setup();
    const studio = mockStudio();
    const { post } = fakeDesignBackend(studio);
    const id = await cupDraft(studio);
    const services = await openStudio(id);
    const storedAssets = () => (settle(studio.listAssets(id)).data as unknown[]).length;

    // Picked as logo.png, then pasted as image.png: the same picture under another name.
    await chooseImageTool(user);
    await user.upload(dropzone(), png(3000, 1000, "logo.png"));
    await screen.findByText("Đã thêm ảnh");
    await chooseImageTool(user);
    await user.upload(dropzone(), png(3000, 1000, "image.png"));
    await waitFor(() => expect(imagesOf(services)).toHaveLength(2));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(new Set(imagesOf(services).map((el) => el.assetId)).size).toBe(2);
    expect(storedAssets()).toBe(2);
    const keys = post.mock.calls.map(
      ([, , config]) =>
        (config as { headers?: Record<string, string> } | undefined)?.headers?.["Idempotency-Key"],
    );
    expect(new Set(keys).size).toBe(2);

    // The very same file again is a retry: the BE answers it with the asset it already stored.
    await chooseImageTool(user);
    await user.upload(dropzone(), png(3000, 1000, "logo.png"));
    await waitFor(() => expect(imagesOf(services)).toHaveLength(3));
    expect(storedAssets()).toBe(2);
    expect(imagesOf(services)[2]!.assetId).toBe(imagesOf(services)[0]!.assetId);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("sends a file that declares no type with the type its extension gives", async () => {
    // (the file picker's own `accept` filter would already drop a file that declares no type)
    const user = userEvent.setup({ applyAccept: false });
    const studio = mockStudio();
    const { post } = fakeDesignBackend(studio);
    const services = await openStudio(await cupDraft(studio));
    await chooseImageTool(user);

    await user.upload(dropzone(), new File([pngBytes(3000, 1000)], "logo.png", { type: "" }));

    await screen.findByText("Đã thêm ảnh");
    expect((post.mock.calls[0]![1] as FormData).get("file")).toMatchObject({ type: "image/png" });
    expect(imagesOf(services)).toHaveLength(1);
  });

  it("keeps a tall or square image inside the safe area, not just the safe height", async () => {
    const user = userEvent.setup();
    const studio = mockStudio();
    fakeDesignBackend(studio);
    const services = await openStudio(await cupDraft(studio));
    await chooseImageTool(user);

    await user.upload(dropzone(), png(1000, 1000));

    await screen.findByText("Đã thêm ảnh");
    const [image] = imagesOf(services);
    const safe = safeArea(services);
    expect(image!.heightMm).toBeLessThan(safe.height); // a full-height box pokes out at its top corners
    expect(image!.placement.scale).toBe(1);
    expect(insideSafe(services, image!)).toBe(true);
  });

  // The mock template's minDpi is 150: under it is blurry, under the print file's 300 DPI soft, from there fine.
  // 3:1 pictures are placed at 60 % of the safe width, so the DPI follows from the picture's width.
  it.each([
    [600, "danger"],
    [1200, "warning"],
    [3000, "positive"],
  ] as const)("reads a %i px wide picture as %s", async (width, tone) => {
    const user = userEvent.setup();
    const studio = mockStudio();
    fakeDesignBackend(studio);
    const services = await openStudio(await cupDraft(studio));
    await chooseImageTool(user);

    await user.upload(dropzone(), png(width, width / 3));

    await screen.findByText("Đã thêm ảnh");
    expect(services.current!.template.minDpi).toBe(150);
    const dpi = Math.round(effectiveDpi(width, imagesOf(services)[0]!.widthMm));
    const badge = screen.getByText(/DPI/);
    expect(badge).toHaveTextContent(tone === "positive" ? `${dpi} DPI ✓` : `${dpi} DPI – sẽ mờ`);
    expect(badge).toHaveAttribute("data-tone", tone);
  });

  it("places an SVG as the PNG it is drawn to, never as SVG", async () => {
    const user = userEvent.setup();
    const studio = mockStudio();
    const { post } = fakeDesignBackend(studio);
    raster.rasterizeSvg.mockResolvedValue(new Blob([pngBytes(2000, 1000)], { type: "image/png" }));
    const services = await openStudio(await cupDraft(studio));
    await chooseImageTool(user);

    const svg = '<svg viewBox="0 0 400 200"><rect width="400" height="200"/></svg>';
    await user.upload(dropzone(), new File([svg], "logo.svg", { type: "image/svg+xml" }));

    await screen.findByText("Đã thêm ảnh");
    expect(raster.rasterizeSvg).toHaveBeenCalledWith(svg, expect.any(Number));
    const [, width] = raster.rasterizeSvg.mock.calls[0]!;
    expect(width).toBeGreaterThanOrEqual(2000);
    const sent = (post.mock.calls[0]![1] as FormData).get("file") as File;
    expect(sent).toMatchObject({ name: "logo.png", type: "image/png" });
    expect(imagesOf(services)[0]).toMatchObject({ naturalWidthPx: 2000, naturalHeightPx: 1000 });
  });

  it("checks the size of the PNG an SVG is drawn to, and says when it cannot be drawn", async () => {
    const user = userEvent.setup();
    const studio = mockStudio();
    const { post } = fakeDesignBackend(studio);
    await openStudio(await cupDraft(studio));
    await chooseImageTool(user);
    const svg = () => new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" });

    const huge = new Uint8Array(20 * MIB + 1);
    huge.set(pngBytes(2000, 1000));
    raster.rasterizeSvg.mockResolvedValueOnce(new Blob([huge], { type: "image/png" }));
    await user.upload(dropzone(), svg());
    expect(await alert()).toHaveTextContent("Tệp lớn hơn 20 MB.");

    raster.rasterizeSvg.mockRejectedValueOnce(new Error("The SVG could not be drawn"));
    await user.upload(dropzone(), svg());
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Không đọc được kích thước ảnh."),
    );
    expect(post).not.toHaveBeenCalled();
  });

  it("takes a file dropped on the dropzone", async () => {
    const user = userEvent.setup();
    const studio = mockStudio();
    fakeDesignBackend(studio);
    const services = await openStudio(await cupDraft(studio));
    await chooseImageTool(user);

    fireEvent.drop(dropzone().parentElement!, { dataTransfer: { files: [png(3000, 2000)] } });

    await screen.findByText("Đã thêm ảnh");
    expect(imagesOf(services)).toHaveLength(1);
  });

  it("shows an API failure in words", async () => {
    const user = userEvent.setup();
    const studio = mockStudio();
    const { post } = fakeDesignBackend(studio);
    post.mockRejectedValueOnce(new ApiError(413, "PAYLOAD_TOO_LARGE", "Too large"));
    const services = await openStudio(await cupDraft(studio));
    await chooseImageTool(user);

    await user.upload(dropzone(), png(3000, 2000));

    expect(await alert()).toHaveTextContent("Tệp vượt dung lượng cho phép.");
    expect(imagesOf(services)).toEqual([]);
  });
});

describe("pasting an image", () => {
  it("places an image pasted on the stage", async () => {
    const user = userEvent.setup();
    const studio = mockStudio();
    fakeDesignBackend(studio);
    const services = await openStudio(await cupDraft(studio));
    await chooseImageTool(user);

    fireEvent.paste(stage(), { clipboardData: { files: [png(3000, 2000, "image.png")] } });

    await screen.findByText("Đã thêm ảnh");
    expect(imagesOf(services)).toHaveLength(1);
  });

  it("leaves a paste elsewhere on the page alone", async () => {
    const user = userEvent.setup();
    const studio = mockStudio();
    const { post } = fakeDesignBackend(studio);
    const services = await openStudio(await cupDraft(studio));
    await chooseImageTool(user);

    fireEvent.paste(document.body, { clipboardData: { files: [png(3000, 2000)] } });
    fireEvent.paste(stage(), { clipboardData: { files: [] } }); // text, no file

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(post).not.toHaveBeenCalled();
    expect(imagesOf(services)).toEqual([]);
  });
});

describe("images uploaded already", () => {
  it("lists them and places one again at the surface centre", async () => {
    const user = userEvent.setup();
    const studio = mockStudio();
    fakeDesignBackend(studio);
    const forked = settle(studio.fork(MOCK_DESIGN_IDS.approvedCup)).data as { id: string };
    const services = await openStudio(forked.id);
    await chooseImageTool(user);
    const before = imagesOf(services).length;

    await user.click(await screen.findByRole("button", { name: "Thêm ảnh logo.png" }));

    expect(imagesOf(services)).toHaveLength(before + 1);
    const added = imagesOf(services).at(-1)!;
    expect(added.assetId).toBe(MOCK_DESIGN_IDS.logoAsset);
    expect(added.placement.u).toBe(safeArea(services).u);
    expect(insideSafe(services, added)).toBe(true); // a 600 px square: taller than wide, so it is shrunk to fit
  });
});

describe("image properties", () => {
  const logo = (overrides: Partial<ImageElement> = {}) =>
    imageEl("logo", {
      placement: { u: 100, v: 55, rotationDeg: 20, scale: 1 },
      widthMm: 30,
      heightMm: 20,
      ...overrides,
    });
  const element = (services: { current?: StudioServices }) => imagesOf(services)[0]!;

  async function selectLogo(user: UserEvent, elements: DesignElement[]) {
    const studio = mockStudio();
    const backend = fakeDesignBackend(studio);
    const services = await openStudio(await cupDraft(studio, elements));
    await user.click(screen.getByRole("tab", { name: "Lớp" }));
    await user.click(screen.getByRole("option", { name: "Ảnh" }));
    await user.click(screen.getByRole("tab", { name: "Thuộc tính" }));
    return { services, ...backend };
  }

  it("shows the DPI where the image sits and follows its size", async () => {
    const user = userEvent.setup();
    const { services } = await selectLogo(user, [logo()]);
    // 1200 px over 30 mm is 1016 DPI.
    expect(screen.getByText(/DPI/)).toHaveTextContent("1016 DPI ✓");

    const scale = screen.getByLabelText("Tỉ lệ (%)");
    await user.clear(scale);
    await user.type(scale, "500");
    await user.tab();
    expect(element(services).placement.scale).toBe(5);
    expect(screen.getByText(/DPI/)).toHaveTextContent("203 DPI – sẽ mờ");
    expect(screen.getByText(/DPI/)).toHaveAttribute("data-tone", "warning"); // 150 ≤ 203 < 225

    await user.clear(scale);
    await user.type(scale, "1000");
    await user.tab();
    expect(screen.getByText(/DPI/)).toHaveTextContent("102 DPI – sẽ mờ");
    expect(screen.getByText(/DPI/)).toHaveAttribute("data-tone", "danger");
  });

  it("flips horizontally and vertically, one undo step each", async () => {
    const user = userEvent.setup();
    const { services } = await selectLogo(user, [logo()]);

    await user.click(screen.getByRole("button", { name: "Lật ngang" }));
    expect(element(services)).toMatchObject({ flipX: true, flipY: false });
    expect(screen.getByRole("button", { name: "Lật ngang" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "Lật dọc" }));
    expect(element(services)).toMatchObject({ flipX: true, flipY: true });

    act(() => services.current!.editor.undo());
    expect(element(services)).toMatchObject({ flipX: true, flipY: false });
    await user.click(screen.getByRole("button", { name: "Lật ngang" }));
    expect(element(services)).toMatchObject({ flipX: false });
  });

  it("fits the safe area: centred, upright and as large as keeps it inside", async () => {
    const user = userEvent.setup();
    const { services } = await selectLogo(user, [logo()]);

    await user.click(screen.getByRole("button", { name: "Vừa vùng an toàn" }));

    const { placement } = element(services);
    const safe = safeArea(services);
    expect(placement).toMatchObject({ u: safe.u, v: safe.v, rotationDeg: 0 });
    expect(placement.scale).toBeGreaterThan(1); // a 30 × 20 mm logo on a ~96 mm band
    expect(30 * placement.scale).toBeLessThanOrEqual(safe.width);
    expect(20 * placement.scale).toBeLessThanOrEqual(safe.height);
  });

  it("bends a logo around the cup with a switch, and back", async () => {
    const user = userEvent.setup();
    const { services } = await selectLogo(user, [logo()]);
    const wrap = screen.getByRole("switch", { name: "Uốn theo thân ly" });
    expect(wrap).not.toBeChecked();

    await user.click(wrap);
    expect(element(services).wrap).toBe(true);
    expect(wrap).toBeChecked();
    expect(element(services).placement.rotationDeg).toBe(20); // kept, ignored while wrapped
    expect(screen.getByLabelText("Góc xoay (°)")).toBeDisabled();

    await user.click(wrap);
    expect(element(services).wrap).toBeUndefined();
    expect(screen.getByLabelText("Góc xoay (°)")).toBeEnabled();
  });

  it("replaces the image, keeping its place and the frame it fills", async () => {
    const user = userEvent.setup();
    const { services, post } = await selectLogo(user, [logo()]);

    await user.upload(screen.getByLabelText("Chọn ảnh thay thế"), png(4000, 1000, "wide.png"));

    await waitFor(() => expect(element(services).assetId).not.toBe("asset-1"));
    expect(element(services)).toMatchObject({
      naturalWidthPx: 4000,
      naturalHeightPx: 1000,
      widthMm: 30, // the 4:1 picture fills the 30 mm frame's width...
      heightMm: 7.5, // ...and is as tall as its shape says
      placement: { u: 100, v: 55, rotationDeg: 20, scale: 1 },
    });
    expect(post).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/DPI/)).toHaveTextContent("3387 DPI ✓");
  });

  it("keeps a locked image as it is", async () => {
    const user = userEvent.setup();
    await selectLogo(user, [logo({ locked: true })]);

    for (const name of ["Lật ngang", "Lật dọc", "Vừa vùng an toàn", "Thay ảnh"]) {
      expect(screen.getByRole("button", { name })).toBeDisabled();
    }
    expect(screen.getByRole("switch", { name: "Uốn theo thân ly" })).toBeDisabled();
  });
});
