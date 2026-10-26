import type { QueryClient } from "@tanstack/react-query";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/error";
import { seedMockCatalog } from "@/lib/api/mock-fixtures/catalog";
import { MOCK_DESIGN_IDS, type MockDesignStudio } from "@/lib/api/mock-fixtures/designs";
import { settle } from "@/test/fake-backend";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { DesignStudio } from "../components/studio/design-studio";
import type { StudioServices } from "../components/studio/studio-context";
import { addElement, removeElement, runPreflight, setBackground } from "../engine";
import { imageEl } from "../engine/__tests__/fixtures";
import { designKeys } from "../queries";
import { fakeDesignBackend, mockStudio } from "./design-backend";
import { TEST_FONTS } from "./fixtures";

const env = vi.hoisted(() => ({ isMock: true, reviewRequest: true, push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: env.push, replace: vi.fn() }),
}));
vi.mock("@/providers/app-providers", () => ({ useIsMock: () => env.isMock }));
// A BE that stores documents and images (P3, P4) but takes no review request (P5) yet.
vi.mock("../capabilities", async (importOriginal) => {
  const original = await importOriginal<typeof import("../capabilities")>();
  return {
    ...original,
    designCapabilities: (isMock: boolean) => ({
      ...original.designCapabilities(isMock),
      ...(env.reviewRequest ? {} : { reviewRequest: false }),
    }),
  };
});

// Each test renders the whole studio, and the autosave tests wait out the real 1.5 s debounce
// (R48 twice, 4 s per wait): over 5 s in a loaded full run.
vi.setConfig({ testTimeout: 15_000 });

beforeEach(() => {
  env.isMock = true;
  env.reviewRequest = true;
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

const CUP_SLUG = "ly-giay-2-lop-12oz";

/** A fresh 12oz cup draft (P1): an empty document on the body. */
async function draftCup(studio: MockDesignStudio) {
  const product = seedMockCatalog().find((p) => p.slug === CUP_SLUG);
  const { data } = settle(
    await studio.create({
      productId: product!.productId,
      sku: "CUP-PAPER-12OZ-WHT",
      templateCode: "CUP12-BODY",
      name: "Ly thử",
    }),
  );
  return (data as { id: string }).id;
}

/** "Tạo phiên bản mới" of the approved cup: a draft whose document places the logo image. */
const forkedCup = (studio: MockDesignStudio) =>
  (settle(studio.fork(MOCK_DESIGN_IDS.approvedCup)).data as { id: string }).id;

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
    const studio = mockStudio();
    fakeDesignBackend(studio);
    openStudio(await draftCup(studio));

    expect(await screen.findByRole("tab", { name: "Thân ly" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("Preview 3D không khả dụng")).toBeInTheDocument();
    expect(
      screen.getByText("Màu sắc hiển thị có thể sai lệch so với thành phẩm in thật"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Bản thiết kế Thân ly, 0 phần tử" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Thiết kế của tôi" })).toHaveAttribute(
      "href",
      "/design",
    );
    expect(screen.getByText("Đang thiết kế")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hoàn tác (Ctrl+Z)" })).toBeDisabled();
  });

  it("switches between the faces of a bag", async () => {
    fakeDesignBackend(mockStudio());
    openStudio(MOCK_DESIGN_IDS.draftBag);

    const faces = await screen.findByRole("tablist", { name: "Mặt in" });
    const tabs = within(faces).getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "Mặt trước",
      "Mặt sau",
      "Hông trái",
      "Hông phải",
    ]);
    expect(screen.getByRole("img", { name: "Bản thiết kế Mặt trước, 1 phần tử" })).toBeVisible();

    await userEvent.click(screen.getByRole("tab", { name: "Mặt sau" }));
    expect(screen.getByRole("tab", { name: "Mặt sau" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("img", { name: "Bản thiết kế Mặt sau, 0 phần tử" })).toBeVisible();
  });

  it("opens the workflow-only view when the document endpoint is not live (R72)", async () => {
    env.isMock = false;
    const { get } = fakeDesignBackend(mockStudio());
    openStudio(MOCK_DESIGN_IDS.draftBag);

    expect(await screen.findByText("Chỉnh sửa trực tuyến chưa mở")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Thiết kế của tôi" })).toHaveAttribute(
      "href",
      "/design",
    );
    expect(screen.queryByRole("tablist", { name: "Mặt in" })).not.toBeInTheDocument();
    const urls = get.mock.calls.map(([url]) => url);
    expect(urls.filter((url) => /\/(document|assets)$/.test(url))).toEqual([]);
  });

  it("keeps Gửi QC kiểm tra unavailable, saying why, while the BE takes no review request", async () => {
    env.reviewRequest = false;
    const user = userEvent.setup();
    const studio = mockStudio();
    const { post } = fakeDesignBackend(studio);
    openStudio(await draftCup(studio));
    await screen.findByRole("tab", { name: "Thân ly" });

    const send = screen.getByRole("button", { name: "Gửi QC kiểm tra" });
    expect(send).toHaveAttribute("aria-disabled", "true");
    expect(send).toHaveAccessibleDescription(
      "Gửi QC kiểm tra chưa mở trực tuyến. Hãy nhắn Sales để được kiểm tra thiết kế.",
    );
    await user.click(send);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it("says so when the design does not exist", async () => {
    fakeDesignBackend(mockStudio());
    openStudio(MOCK_DESIGN_IDS.foreign);

    expect(await screen.findByText("Không tìm thấy thiết kế")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Về thiết kế của tôi" })).toHaveAttribute(
      "href",
      "/design",
    );
  });

  it("reads a mistyped link as no design, without asking the BE (R1-02)", async () => {
    const { get } = fakeDesignBackend(mockStudio());
    openStudio("not-a-uuid%zz");

    expect(await screen.findByText("Không tìm thấy thiết kế")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Thử lại" })).not.toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
  });

  it("reads an address the BE refuses (400) as no design, not as an outage", async () => {
    const { get } = fakeDesignBackend(mockStudio());
    get.mockRejectedValue(
      new ApiError(400, "REQUEST_REJECTED", "The request address is not valid"),
    );
    openStudio(MOCK_DESIGN_IDS.draftBag);

    expect(await screen.findByText("Không tìm thấy thiết kế")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Thử lại" })).not.toBeInTheDocument();
  });

  it("is read-only for a confirmed design", async () => {
    const studio = mockStudio();
    const { post } = fakeDesignBackend(studio);
    const services = openStudio(MOCK_DESIGN_IDS.approvedCup);

    expect(await screen.findByText("Đã chốt")).toBeInTheDocument();
    expect(screen.getByText("Chỉ xem.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hoàn tác (Ctrl+Z)" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Làm lại (Ctrl+Shift+Z)" })).toBeDisabled();

    const before = services.current!.editor.store.getState().document;
    act(() =>
      services.current!.editor.apply((doc) =>
        setBackground(doc, "BODY", { kind: "color", color: "#FF0000" }),
      ),
    );
    expect(services.current!.editor.store.getState().document).toBe(before);

    await userEvent.click(screen.getByRole("button", { name: "Tạo phiên bản mới" }));
    await waitFor(() =>
      expect(env.push).toHaveBeenCalledWith(expect.stringMatching(/^\/design\//)),
    );
    expect(post).toHaveBeenCalledWith(`/designs/${MOCK_DESIGN_IDS.approvedCup}/revisions`);
  });

  it("autosaves and shows the saved time", async () => {
    const studio = mockStudio();
    const { put } = fakeDesignBackend(studio);
    const id = await draftCup(studio);
    const services = openStudio(id);
    await screen.findByRole("tab", { name: "Thân ly" });

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
    const studio = mockStudio();
    const { put } = fakeDesignBackend(studio);
    put.mockRejectedValueOnce(new ApiError(500, "INTERNAL_ERROR", "Database unavailable"));
    const services = openStudio(await draftCup(studio));
    await screen.findByRole("tab", { name: "Thân ly" });

    paintBody(services.current!, "#00FF00");
    const retry = await screen.findByRole(
      "button",
      { name: "Lưu lỗi – Thử lại" },
      { timeout: 4000 },
    );
    await userEvent.click(retry);

    expect(await screen.findByText(SAVED)).toBeInTheDocument();
    expect(put).toHaveBeenCalledTimes(2);
  });

  it("saves with the version a workflow step left on the design (R48)", async () => {
    const studio = mockStudio();
    const { put } = fakeDesignBackend(studio);
    const id = await draftCup(studio);
    const services = openStudio(id);
    await screen.findByRole("tab", { name: "Thân ly" });

    paintBody(services.current!, "#00FF00");
    expect(await screen.findByText(SAVED, undefined, { timeout: 4000 })).toBeInTheDocument();
    // Another write (here the specification) bumps the shared version; the design is re-read.
    settle(studio.revise(id, { version: 1, spec: "Ly xanh" }));
    await act(() => services.client!.invalidateQueries({ queryKey: designKeys.detail(id) }));
    await waitFor(() => expect(services.current!.design.version).toBe(2));

    paintBody(services.current!, "#0000FF");
    await waitFor(() => expect(put).toHaveBeenCalledTimes(2), { timeout: 4000 });
    expect(put.mock.calls[1]?.[1]).toMatchObject({ version: 2 });
    expect(await screen.findByText(SAVED)).toBeInTheDocument();
    expect(screen.queryByText("Thiết kế đã thay đổi ở nơi khác")).not.toBeInTheDocument();
  });

  it("keeps the placed images through a full cache, and fetches one placed again after eviction", async () => {
    const studio = mockStudio();
    fakeDesignBackend(studio);
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
    const services = openStudio(forkedCup(studio));
    const logo = MOCK_DESIGN_IDS.logoAsset;
    await waitFor(() => expect(services.current?.images.get(logo, "proxy")).toBeDefined());
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
    await waitFor(() => expect(images.get(logo, "proxy")).toBeDefined());
    expect(fetchFile).toHaveBeenCalledTimes(2);
    expect(services.current!.assetStatus[logo]?.status).toBe("ready");
  });

  it("refetches an expired asset link once, then shows the placeholder issue", async () => {
    const studio = mockStudio();
    const { get } = fakeDesignBackend(studio);
    const fetchFile = vi.fn(async () => new Response(null, { status: 403 }));
    vi.stubGlobal("fetch", fetchFile);
    const services = openStudio(forkedCup(studio));

    const logo = MOCK_DESIGN_IDS.logoAsset;
    await waitFor(() => expect(services.current?.assetStatus[logo]?.status).toBe("error"));
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
    });
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        ruleId: "ASSET_INVALID",
        message: "Ảnh không hợp lệ hoặc không tải được.",
      }),
    );
  });

  describe("an image that failed to load is tried again", () => {
    /** The forked cup, its logo's download failing until `serve()` is called. */
    async function failedLogo() {
      const studio = mockStudio();
      fakeDesignBackend(studio);
      let serving = false;
      const fetchFile = vi.fn(async () =>
        serving ? new Response("png") : new Response(null, { status: 403 }),
      );
      vi.stubGlobal("fetch", fetchFile);
      vi.stubGlobal(
        "createImageBitmap",
        vi.fn(async () => ({ width: 600, height: 600, close: () => undefined })),
      );
      const services = openStudio(forkedCup(studio));
      const logo = MOCK_DESIGN_IDS.logoAsset;
      await waitFor(() => expect(services.current?.assetStatus[logo]?.status).toBe("error"));
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
      await waitFor(() => expect(status()).toBe("ready"));
    });

    it("on Tải lại ảnh in the check panel", async () => {
      const { serve, status } = await failedLogo();
      await userEvent.click(screen.getByRole("tab", { name: "Kiểm tra" }));
      serve();
      await userEvent.click(await screen.findByRole("button", { name: "Tải lại ảnh" }));
      await waitFor(() => expect(status()).toBe("ready"));
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
      await waitFor(() => expect(status()).toBe("ready"));
    });
  });
});
