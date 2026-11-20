import type { QueryClient } from "@tanstack/react-query";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/error";
import { printConfigFor, type PrintConfigRow } from "@/lib/api/mock-fixtures/design-print-configs";
import { MOCK_DESIGN_IDS } from "@/lib/api/mock-fixtures/design-seed";
import type { DesignMockStore } from "@/lib/api/mock-fixtures/design-store";
import { settle } from "@/test/fake-backend";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { DesignStudio } from "../components/studio/design-studio";
import type { StudioServices } from "../components/studio/studio-context";
import { addElement, removeElement, runPreflight, setBackground, VARIANT_OK } from "../engine";
import { imageEl } from "../engine/__tests__/fixtures";
import { designKeys } from "../queries";
import { templateOf } from "../selectors";
import { designBackend, draftIn, STUDIO_PRODUCTS } from "./design-backend";
import { TEST_FONTS } from "./fixtures";

const env = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: env.push, replace: vi.fn() }),
}));

// Each test renders the whole studio over the design mock (~0.2 s a request), and the autosave
// tests wait out the real 1.5 s debounce: over 5 s in a loaded full run.
vi.setConfig({ testTimeout: 20_000 });
const OPENED = { timeout: 4000 };

beforeEach(() => {
  env.push.mockReset();
  signIn();
  // jsdom has no canvas: `getContext` logs "not implemented" before answering null (no 2D, no WebGL).
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  // No image host in a test: every file download fails unless a test says otherwise.
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

/** A fresh 12oz cup draft: an empty document on the body (version 0). */
const draftCup = (store: DesignMockStore) => draftIn(store, STUDIO_PRODUCTS.cup);

/** "Tạo bản sửa" of the approved cup: a draft whose document places the logo image. */
async function revisedCup(store: DesignMockStore) {
  const revision = settle(await store.revise(MOCK_DESIGN_IDS.approved));
  return (revision.data as { id: string }).id;
}

/** Renders the studio and keeps the latest services it exposes (the editor, caches, statuses). */
function openStudio(designId: string) {
  const seen: { current?: StudioServices; client?: QueryClient } = {};
  const { client } = renderWithProviders(
    <DesignStudio
      designId={designId}
      fonts={TEST_FONTS}
      onServices={(services) => {
        seen.current = services;
      }}
    />,
  );
  seen.client = client;
  return seen;
}

/** One background change on the body: an edit autosave picks up. */
const paintBody = (services: StudioServices, color: `#${string}`) =>
  act(() => services.editor.apply((doc) => setBackground(doc, "BODY", { kind: "color", color })));

const SAVED = /^Đã lưu lúc \d{2}:\d{2}$/;

describe("DesignStudio", () => {
  it("opens a draft with the cup surface and the 3D fallback", async () => {
    const { store } = await designBackend();
    openStudio(await draftCup(store));

    // A cup has one print area: the context bar names it, there is nothing to switch.
    const bar = await screen.findByRole("region", { name: "Thuộc tính phần tử" }, OPENED);
    expect(within(bar).getByText("Thân ly")).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Mặt in" })).not.toBeInTheDocument();
    expect(screen.getByText("Preview 3D không khả dụng")).toBeInTheDocument();
    // Under the 2D frame and under the preview: both views carry the note.
    expect(
      screen.getAllByText("Màu sắc hiển thị có thể sai lệch so với thành phẩm in thật"),
    ).toHaveLength(2);
    expect(
      screen.getByRole("img", { name: "Bản thiết kế Thân ly, 0 phần tử" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Thiết kế của tôi" })).toHaveAttribute(
      "href",
      "/design",
    );
    expect(screen.getByText("Bản nháp")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Thiết kế thử" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hoàn tác (Ctrl+Z)" })).toBeDisabled();
  });

  it("switches between the faces of a bag", async () => {
    await designBackend();
    openStudio(MOCK_DESIGN_IDS.draft);

    const faces = await screen.findByRole("radiogroup", { name: "Mặt in" }, OPENED);
    const radios = within(faces).getAllByRole("radio");
    expect(radios.map((face) => face.textContent)).toEqual([
      "Mặt trước",
      "Mặt sau",
      "Hông trái",
      "Hông phải",
    ]);
    expect(screen.getByRole("img", { name: "Bản thiết kế Mặt trước, 1 phần tử" })).toBeVisible();

    await userEvent.click(screen.getByRole("radio", { name: "Mặt sau" }));
    expect(screen.getByRole("radio", { name: "Mặt sau" })).toBeChecked();
    expect(screen.getByRole("img", { name: "Bản thiết kế Mặt sau, 0 phần tử" })).toBeVisible();
  });

  it("opens with the variant's print configuration", async () => {
    const { get } = await designBackend();
    const seen = openStudio(MOCK_DESIGN_IDS.draft);

    await waitFor(() => expect(seen.current).toBeDefined(), OPENED);
    expect(seen.current!.printConfig).toMatchObject({
      sku: "BAG-KRAFT-M",
      variantStatus: "ACTIVE",
      hasCartonSpec: true,
    });
    // The template is the print configuration's, with the file rules' limits (ruling R20).
    expect(seen.current!.template).toEqual(templateOf(seen.current!.printConfig));
    expect(seen.current!.status).toBe("DRAFT");
    expect(seen.current!.readOnly).toBe(false);
    // The design's own template, and the customization for the carton spec (F-22, F-23).
    const urls = get.mock.calls.map(([url]) => url);
    expect(urls).toContain(`/designs/${MOCK_DESIGN_IDS.draft}/template`);
    expect(urls).toContain("/catalog/products/tui-giay-kraft/customization");
  });

  it("says so when the design's variant no longer has a print configuration", async () => {
    let configured = true;
    const { store } = await designBackend({
      printConfigFor: (slug: string, sku: string): PrintConfigRow | null =>
        configured ? printConfigFor(slug, sku) : null,
    });
    const id = await draftCup(store);
    configured = false;
    openStudio(id);

    expect(
      await screen.findByText("Quy cách này chưa nhận thiết kế.", undefined, OPENED),
    ).toBeInTheDocument();
    expect(screen.getByText("Không mở được trình thiết kế")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Công cụ" })).not.toBeInTheDocument();
  });

  it("says so when the design does not exist", async () => {
    await designBackend();
    openStudio("7d51f000-0000-4000-8000-0000000000ff");

    expect(
      await screen.findByText("Không tìm thấy thiết kế", undefined, OPENED),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Về thiết kế của tôi" })).toHaveAttribute(
      "href",
      "/design",
    );
  });

  it("reads a mistyped link as no design, without asking the BE (R1-02)", async () => {
    const { get } = await designBackend();
    openStudio("not-a-uuid%zz");

    expect(await screen.findByText("Không tìm thấy thiết kế")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Thử lại" })).not.toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
  });

  // Ruling R18: the design mock never answers 401, so the studio itself asks for a session.
  it("asks a signed-out visitor to sign in, brings them back, and reads nothing", async () => {
    signOut();
    const { get, put, post } = await designBackend();
    openStudio(MOCK_DESIGN_IDS.draft);

    expect(await screen.findByText("Đăng nhập để bắt đầu thiết kế")).toBeInTheDocument();
    const next = encodeURIComponent(`/design/${MOCK_DESIGN_IDS.draft}`);
    expect(screen.getByRole("link", { name: "Đăng nhập" })).toHaveAttribute(
      "href",
      `/login?next=${next}`,
    );
    expect(screen.queryByRole("group", { name: "Công cụ" })).not.toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it("reads an address the BE refuses (400) as no design, not as an outage", async () => {
    const { get } = await designBackend();
    get.mockRejectedValue(
      new ApiError(400, "REQUEST_REJECTED", "The request address is not valid"),
    );
    openStudio(MOCK_DESIGN_IDS.draft);

    expect(await screen.findByText("Không tìm thấy thiết kế")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Thử lại" })).not.toBeInTheDocument();
  });

  it("autosaves and shows the saved time", async () => {
    const { store, put } = await designBackend();
    const id = await draftCup(store);
    const services = openStudio(id);
    await screen.findByRole("group", { name: "Công cụ" }, OPENED);

    expect(screen.queryByText(SAVED)).not.toBeInTheDocument();
    paintBody(services.current!, "#FF0000");
    expect(screen.getByText("Đang lưu…")).toBeInTheDocument();
    expect(put).not.toHaveBeenCalled();

    expect(await screen.findByText(SAVED, undefined, { timeout: 4000 })).toBeInTheDocument();
    expect(put).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledWith(`/designs/${id}/document`, {
      version: 0,
      document: expect.objectContaining({
        surfaces: { BODY: { background: { kind: "color", color: "#FF0000" }, elements: [] } },
      }),
    });
    // The polite live region says it too.
    expect(screen.getByText("Đã lưu")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hoàn tác (Ctrl+Z)" })).toBeEnabled();
  });

  it("shows a failed save and saves again on Thử lại", async () => {
    const { store, put } = await designBackend();
    put.mockRejectedValueOnce(new ApiError(500, "INTERNAL_ERROR", "Database unavailable"));
    const services = openStudio(await draftCup(store));
    await screen.findByRole("group", { name: "Công cụ" }, OPENED);

    paintBody(services.current!, "#00FF00");
    const retry = await screen.findByRole(
      "button",
      { name: "Lưu lỗi – Thử lại" },
      { timeout: 4000 },
    );
    await userEvent.click(retry);

    expect(await screen.findByText(SAVED, undefined, { timeout: 3000 })).toBeInTheDocument();
    expect(put).toHaveBeenCalledTimes(2);
  });

  it("saves with the version another write left on the design (R48)", async () => {
    const { store, put } = await designBackend();
    const id = await draftCup(store);
    const services = openStudio(id);
    await screen.findByRole("group", { name: "Công cụ" }, OPENED);

    paintBody(services.current!, "#00FF00");
    expect(await screen.findByText(SAVED, undefined, { timeout: 4000 })).toBeInTheDocument();
    // Another write (here a rename in another tab) bumps the version; the design is re-read.
    settle(await store.rename(id, { name: "Ly xanh", version: 1 }));
    await act(() => services.client!.invalidateQueries({ queryKey: designKeys.detail(id) }));
    await waitFor(() => expect(services.current!.design.version).toBe(2));

    paintBody(services.current!, "#0000FF");
    await waitFor(() => expect(put).toHaveBeenCalledTimes(2), { timeout: 4000 });
    expect(put.mock.calls[1]?.[1]).toMatchObject({ version: 2 });
    expect(await screen.findByText(SAVED, undefined, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.queryByText("Thiết kế đã thay đổi ở nơi khác")).not.toBeInTheDocument();
  });

  it("keeps the placed images through a full cache, and fetches one placed again after eviction", async () => {
    const { store } = await designBackend();
    const fetchFile = vi.fn(async () => new Response("png"));
    vi.stubGlobal("fetch", fetchFile);
    // A decoder: the logo is 600 px; a "big" file is 4096 px, so its proxy holds 2048² px (16 MB).
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async (source: unknown, options?: ImageBitmapOptions) => {
        const edge = source instanceof Blob && source.type === "image/x-big" ? 4096 : 600;
        const width = options?.resizeWidth ?? edge;
        const height = options?.resizeHeight ?? edge;
        return { width, height, close: () => undefined };
      }),
    );
    const services = openStudio(await revisedCup(store));
    const logo = MOCK_DESIGN_IDS.logoAsset;
    await waitFor(() => expect(services.current?.images.get(logo, "proxy")).toBeDefined(), OPENED);
    const { images, editor } = services.current!;
    const big = new Blob(["x"], { type: "image/x-big" });
    const fillCache = async (from: number) => {
      for (let i = from; i < from + 20; i++) await images.load(`other-${i}`, big, "proxy");
    };

    await fillCache(0); // 20 × 16 MB: past the 256 MB budget
    expect(images.get("other-0", "proxy")).toBeUndefined();
    expect(images.get(logo, "proxy")).toBeDefined();

    // Off the design the logo may go; placed again (undo), it is fetched again and drawn.
    act(() => editor.apply((doc) => removeElement(doc, "BODY", "el-cup-2")));
    await fillCache(20);
    expect(images.get(logo, "proxy")).toBeUndefined();
    act(() => editor.undo());
    await waitFor(() => expect(images.get(logo, "proxy")).toBeDefined(), OPENED);
    expect(fetchFile).toHaveBeenCalledTimes(2);
    expect(services.current!.assetStatus[logo]?.status).toBe("ready");
  });

  it("refetches an expired asset link once, then shows the placeholder issue", async () => {
    const { store, get } = await designBackend();
    const fetchFile = vi.fn(async () => new Response(null, { status: 403 }));
    vi.stubGlobal("fetch", fetchFile);
    const services = openStudio(await revisedCup(store));

    const logo = MOCK_DESIGN_IDS.logoAsset;
    await waitFor(() => expect(services.current?.assetStatus[logo]?.status).toBe("error"), OPENED);
    const linkCalls = get.mock.calls.filter(([url]) =>
      url.endsWith(`/assets/${logo}/download-url`),
    );
    expect(linkCalls).toHaveLength(2);
    expect(fetchFile).toHaveBeenCalledTimes(2);

    const { editor, template, surfaces, sizer, assetStatus, fontStatus } = services.current!;
    const report = runPreflight({
      document: editor.store.getState().document,
      template,
      surfaces,
      sizer,
      assets: assetStatus,
      fontStatus,
      variant: VARIANT_OK,
    });
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        ruleId: "ASSET_INVALID",
        message: "Ảnh không hợp lệ hoặc không tải được.",
      }),
    );
  });

  describe("an image that failed to load is tried again", () => {
    /** The revised cup, its logo's download failing until `serve()` is called. */
    async function failedLogo() {
      const { store } = await designBackend();
      let serving = false;
      const fetchFile = vi.fn(async () =>
        serving ? new Response("png") : new Response(null, { status: 403 }),
      );
      vi.stubGlobal("fetch", fetchFile);
      vi.stubGlobal(
        "createImageBitmap",
        vi.fn(async () => ({ width: 600, height: 600, close: () => undefined })),
      );
      const services = openStudio(await revisedCup(store));
      const logo = MOCK_DESIGN_IDS.logoAsset;
      await waitFor(
        () => expect(services.current?.assetStatus[logo]?.status).toBe("error"),
        OPENED,
      );
      const serve = () => {
        serving = true;
      };
      const status = () => services.current!.assetStatus[logo]?.status;
      return { services, logo, serve, status, fetchFile };
    }

    it("when the browser is back online", async () => {
      const { serve, status } = await failedLogo();
      serve();
      act(() => {
        window.dispatchEvent(new Event("online"));
      });
      await waitFor(() => expect(status()).toBe("ready"), OPENED);
    });

    it("on Tải lại ảnh in the check panel", async () => {
      const { serve, status } = await failedLogo();
      await userEvent.click(screen.getByRole("button", { name: "Kiểm tra" }));
      serve();
      await userEvent.click(await screen.findByRole("button", { name: "Tải lại ảnh" }));
      await waitFor(() => expect(status()).toBe("ready"), OPENED);
      await waitFor(() =>
        expect(screen.queryByRole("button", { name: "Tải lại ảnh" })).not.toBeInTheDocument(),
      );
    });

    it("when it is placed again, and not merely because the design changed", async () => {
      const { services, serve, status, fetchFile, logo } = await failedLogo();
      serve();
      const calls = fetchFile.mock.calls.length;
      paintBody(services.current!, "#FF0000");
      await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
      expect(fetchFile.mock.calls.length).toBe(calls);
      expect(status()).toBe("error");

      act(() =>
        services.current!.editor.apply((doc) =>
          addElement(doc, "BODY", imageEl("again", { assetId: logo })),
        ),
      );
      await waitFor(() => expect(status()).toBe("ready"), OPENED);
    });
  });
});
