import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { MOCK_DESIGN_IDS } from "@/lib/api/mock-fixtures/designs";
import { renderWithProviders } from "@/test/render";

import { DesignListScreen } from "../components/design-list-screen";
import { fakeDesignBackend, mockStudio, queryOf } from "./design-backend";
import { beDownload, beDraft, bePage, proposedDraftFields } from "./fixtures";

const env = vi.hoisted(() => ({ isMock: true }));
vi.mock("@/providers/app-providers", () => ({ useIsMock: () => env.isMock }));

beforeEach(() => {
  env.isMock = true;
});
afterEach(() => vi.restoreAllMocks());

const uuid = (n: number) => `7c1f0a00-0000-4000-8000-${String(n).padStart(12, "0")}`;

// The P6 review timestamps are left out so a draft reads as "editing", not "awaiting QC".
const approved = beDraft({
  ...proposedDraftFields,
  id: uuid(101),
  name: "Ly cà phê Nhà Mình",
  status: "APPROVED",
  technicalReviewPassed: true,
  reviewRequestedAt: undefined,
  reviewedAt: undefined,
});
const draft = beDraft({
  ...proposedDraftFields,
  id: uuid(102),
  name: "Túi kraft tiệm bánh",
  sku: "BAG-KRAFT-M",
  templateCode: "BAGM-4F",
  reviewRequestedAt: undefined,
  reviewedAt: undefined,
  previewArtifactId: undefined,
});

/** Every `GET /designs` answers `page`; a preview link answers the fixed presigned link. */
function fakeList(page: unknown) {
  return vi.spyOn(api, "get").mockImplementation(async (url) => {
    if (url === "/designs") return { data: page };
    if (/\/artifacts\/[^/]+\/download-url$/.test(url)) return { data: beDownload };
    throw new ApiError(404, "NOT_FOUND", `No fake route for GET ${url}`);
  });
}

const listCalls = (get: ReturnType<typeof fakeList>) =>
  get.mock.calls.filter(([url]) => url === "/designs").map(([, config]) => config?.params);

describe("DesignListScreen", () => {
  it("lists designs with status badges and resets the page on tab change", async () => {
    fakeList(bePage([approved, draft], { page: 1, totalPages: 3, totalElements: 26 }));
    const onUrlUpdate = vi.fn();
    renderWithProviders(<DesignListScreen />, { searchParams: "?page=2", onUrlUpdate });

    const list = await screen.findByRole("list", { name: "Danh sách thiết kế" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(within(list).getByText("Đã chốt")).toBeInTheDocument();
    expect(within(list).getByText("Đang thiết kế")).toBeInTheDocument();
    expect(within(list).getByText("Ly cà phê Nhà Mình")).toBeInTheDocument();
    expect(within(list).getByText("CUP-PAPER-12OZ-WHT · CUP12-BODY")).toBeInTheDocument();
    // The tab panel takes focus from its tab: it shows a focus ring.
    expect(screen.getByRole("tabpanel")).toHaveClass("focus-visible:ring-2");

    await userEvent.click(screen.getByRole("tab", { name: "Đã chốt" }));

    expect(onUrlUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        queryString: expect.not.stringContaining("page=2"),
      }),
    );
    expect(onUrlUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ queryString: expect.stringContaining("tab=confirmed") }),
    );
  });

  it("asks the BE for the status of the tab, with the page the URL holds", async () => {
    const get = fakeList(bePage([approved]));
    renderWithProviders(<DesignListScreen />, { searchParams: "?tab=confirmed" });
    await screen.findByRole("list", { name: "Danh sách thiết kế" });

    expect(screen.getByRole("tab", { name: "Đã chốt" })).toHaveAttribute("aria-selected", "true");
    expect(listCalls(get)[0]).toEqual({ page: 0, size: 12, status: "APPROVED" });
  });

  it.each([
    ["editing", "DRAFT"],
    ["waiting", "SUBMITTED"],
  ])("maps the %s tab to the %s status", async (tab, status) => {
    const get = fakeList(bePage([draft]));
    renderWithProviders(<DesignListScreen />, { searchParams: `?tab=${tab}` });
    await screen.findByRole("list", { name: "Danh sách thiết kế" });
    expect(listCalls(get)[0]).toMatchObject({ status });
  });

  it("shows no tabs and sends no status when the BE cannot filter by status", async () => {
    env.isMock = false;
    const get = fakeList(bePage([approved, draft]));
    renderWithProviders(<DesignListScreen />, { searchParams: "?tab=confirmed" });

    await screen.findByRole("list", { name: "Danh sách thiết kế" });
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(listCalls(get)[0]).toEqual({ page: 0, size: 12 });
  });

  it("shows a skeleton while the first page loads", () => {
    vi.spyOn(api, "get").mockReturnValue(new Promise(() => undefined));
    renderWithProviders(<DesignListScreen />);
    expect(screen.getByRole("status", { name: "Đang tải danh sách thiết kế" })).toBeInTheDocument();
  });

  describe("empty states", () => {
    it("tells a customer with no designs where to start", async () => {
      fakeList(bePage([]));
      renderWithProviders(<DesignListScreen />);

      expect(await screen.findByText("Bạn chưa có thiết kế nào")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Xem sản phẩm" })).toHaveAttribute(
        "href",
        "/catalog",
      );
      expect(screen.queryByRole("link", { name: "Nhắn Sales" })).not.toBeInTheDocument();
    });

    it("sends a customer with no designs to Sales while they cannot start one themselves", async () => {
      env.isMock = false;
      fakeList(bePage([]));
      renderWithProviders(<DesignListScreen />);

      expect(await screen.findByText("Bạn chưa có thiết kế nào")).toBeInTheDocument();
      expect(
        screen.getByText(/Sales của StockFlow lên thiết kế theo yêu cầu của bạn/),
      ).toBeVisible();
      expect(screen.queryByText(/bấm “Bắt đầu thiết kế”/)).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Nhắn Sales" })).toHaveAttribute("href", "/chat");
      expect(screen.getByRole("link", { name: "Xem sản phẩm" })).toHaveAttribute(
        "href",
        "/catalog",
      );
    });

    it("tells a customer that the tab is empty and lets them leave it", async () => {
      fakeList(bePage([]));
      const onUrlUpdate = vi.fn();
      renderWithProviders(<DesignListScreen />, { searchParams: "?tab=confirmed", onUrlUpdate });

      expect(await screen.findByText("Không có thiết kế ở mục này")).toBeInTheDocument();
      expect(screen.queryByText("Bạn chưa có thiết kế nào")).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Xem tất cả thiết kế" }));
      expect(onUrlUpdate).toHaveBeenLastCalledWith(
        expect.objectContaining({ queryString: expect.not.stringContaining("tab=") }),
      );
    });
  });

  it("does not claim there are no designs while the next tab is still loading", async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    vi.spyOn(api, "get").mockImplementation(async (_url, config) => {
      if (queryOf(config).status === "APPROVED") return { data: bePage([]) };
      await gate;
      return { data: bePage([approved]) };
    });
    renderWithProviders(<DesignListScreen />, { searchParams: "?tab=confirmed" });
    await screen.findByText("Không có thiết kế ở mục này");

    await userEvent.click(screen.getByRole("tab", { name: "Tất cả" }));

    expect(
      await screen.findByRole("status", { name: "Đang tải danh sách thiết kế" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Bạn chưa có thiết kế nào")).not.toBeInTheDocument();
    expect(screen.queryByText("Không có thiết kế ở mục này")).not.toBeInTheDocument();
    release();
    expect(await screen.findByText("Ly cà phê Nhà Mình")).toBeInTheDocument();
  });

  it("explains a failed load and retries it", async () => {
    const get = fakeList(bePage([approved]));
    get.mockRejectedValueOnce(new ApiError(403, "FORBIDDEN", "no", undefined, "corr-1"));
    renderWithProviders(<DesignListScreen />);

    expect(await screen.findByText("Không tải được danh sách thiết kế")).toBeInTheDocument();
    expect(screen.getByText(/Mã tra cứu: corr-1/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Thử lại/ }));
    expect(await screen.findByText("Ly cà phê Nhà Mình")).toBeInTheDocument();
  });

  it("brings a page past the last one back to the last page", async () => {
    fakeList(bePage([], { page: 4, totalPages: 1, totalElements: 2 }));
    const onUrlUpdate = vi.fn();
    renderWithProviders(<DesignListScreen />, { searchParams: "?page=5", onUrlUpdate });

    await waitFor(() =>
      expect(onUrlUpdate).toHaveBeenLastCalledWith(
        expect.objectContaining({ queryString: expect.not.stringContaining("page=") }),
      ),
    );
  });

  describe("on the mock backend", () => {
    it("shows each card's preview thumbnail, or a placeholder for a design with none", async () => {
      fakeDesignBackend(mockStudio());
      renderWithProviders(<DesignListScreen />);

      const list = await screen.findByRole("list", { name: "Danh sách thiết kế" });
      const cards = within(list).getAllByRole("listitem");
      expect(cards).toHaveLength(2);

      const cup = cards.find((card) => within(card).queryByText("Ly cà phê Nhà Mình 12oz"))!;
      const preview = await within(cup).findByRole("img", { name: /Ly cà phê Nhà Mình 12oz/ });
      expect(decodeURIComponent(preview.getAttribute("src") ?? "")).toContain("/logo.png");
      expect(within(cup).getByText("Đã chốt")).toBeInTheDocument();
      expect(
        within(cup).getByRole("link", { name: /Mở thiết kế Ly cà phê Nhà Mình 12oz/ }),
      ).toHaveAttribute("href", `/design/${MOCK_DESIGN_IDS.approvedCup}`);

      const bag = cards.find((card) => within(card).queryByText("Túi kraft tiệm bánh Hoa"))!;
      expect(within(bag).queryByRole("img")).not.toBeInTheDocument();
      expect(within(bag).getByText("Chưa có bản xem trước")).toBeInTheDocument();
    });

    it("filters by the status of the tab", async () => {
      fakeDesignBackend(mockStudio());
      renderWithProviders(<DesignListScreen />);
      await screen.findByRole("list", { name: "Danh sách thiết kế" });

      await userEvent.click(screen.getByRole("tab", { name: "Đang thiết kế" }));
      const list = await screen.findByRole("list", { name: "Danh sách thiết kế" });
      await waitFor(() => expect(within(list).getAllByRole("listitem")).toHaveLength(1));
      expect(within(list).getByText("Túi kraft tiệm bánh Hoa")).toBeInTheDocument();

      await userEvent.click(screen.getByRole("tab", { name: "Chờ bạn xác nhận" }));
      expect(await screen.findByText("Không có thiết kế ở mục này")).toBeInTheDocument();
    });
  });
});
