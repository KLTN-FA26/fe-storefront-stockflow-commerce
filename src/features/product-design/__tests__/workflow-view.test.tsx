import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { formatDateTime } from "@/lib/format";
import { seedMockCatalog } from "@/lib/api/mock-fixtures/catalog";
import { MOCK_DESIGN_IDS, type MockDesignStudio } from "@/lib/api/mock-fixtures/designs";
import { settle } from "@/test/fake-backend";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { DesignStudio } from "../components/studio/design-studio";
import { fakeDesignBackend, mockStudio } from "./design-backend";
import { TEST_FONTS } from "./fixtures";

const env = vi.hoisted(() => ({ isMock: false, push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: env.push, replace: vi.fn() }),
}));
vi.mock("@/providers/app-providers", () => ({ useIsMock: () => env.isMock }));

vi.setConfig({ testTimeout: 15_000 });

beforeEach(() => {
  env.isMock = false; // the real BE: P3/P4 are not there
  env.push.mockReset();
  signIn();
});
afterEach(() => {
  vi.restoreAllMocks();
  signOut();
});

const versionOf = (studio: MockDesignStudio, id: string) =>
  (settle(studio.get(id)).data as { version: number }).version;

/** A cup design QC passed with `notes` and Sales sent to the customer: SUBMITTED. */
async function sentToCustomer(studio: MockDesignStudio, notes = "Đạt kỹ thuật") {
  const product = seedMockCatalog().find((p) => p.slug === "ly-giay-2-lop-12oz")!;
  const created = settle(
    await studio.create({
      productId: product.productId,
      sku: "CUP-PAPER-12OZ-WHT",
      templateCode: "CUP12-BODY",
      name: "Ly quán cà phê",
    }),
  );
  const { id } = created.data as { id: string };
  const preview = new File([new Uint8Array(8).fill(7)], "preview.png", { type: "image/png" });
  settle(await studio.uploadArtifact(id, "CUSTOMER_PREVIEW", preview, "preview-key-1"));
  settle(studio.completeReview(id, true, notes));
  settle(studio.submit(id, { version: versionOf(studio, id) }));
  return id;
}

const openStudio = (designId: string) =>
  renderWithProviders(<DesignStudio designId={designId} fonts={TEST_FONTS} />);

describe("the workflow-only view (R72)", () => {
  it("lets the customer confirm what Sales sent, with no editor and no document calls", async () => {
    const user = userEvent.setup();
    const studio = mockStudio();
    const { get, post } = fakeDesignBackend(studio);
    const id = await sentToCustomer(studio);
    openStudio(id);

    expect(await screen.findByRole("heading", { name: "Ly quán cà phê" })).toBeInTheDocument();
    expect(screen.getAllByText("Chờ bạn xác nhận").length).toBeGreaterThan(0);
    expect(screen.getByText(/Sales đã gửi thiết kế cho bạn/)).toBeInTheDocument();
    expect(screen.getByText("Chỉnh sửa trực tuyến chưa mở")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "nhắn Sales" })).toHaveAttribute("href", "/chat");
    expect(
      await screen.findByRole("img", { name: "Bản xem trước Ly quán cà phê" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Màu sắc hiển thị có thể sai lệch so với thành phẩm in thật"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("tablist", { name: "Mặt in" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Xác nhận thiết kế" }));
    const dialog = await screen.findByRole("dialog", { name: "Xác nhận thiết kế?" });
    await user.click(within(dialog).getByRole("button", { name: "Xác nhận" }));

    const card = await screen.findByRole("region", { name: "Bản chốt" });
    expect(post).toHaveBeenCalledWith(`/designs/${id}/confirmations`, expect.anything());
    expect(screen.getAllByText("Đã chốt").length).toBeGreaterThan(0);
    await waitFor(() => expect(within(card).queryByText("Đang tải…")).not.toBeInTheDocument());
    const urls = get.mock.calls.map(([url]) => url);
    expect(urls.filter((url) => /\/(document|assets)$/.test(url))).toEqual([]);
  });

  it("asks Sales for changes with a reason", async () => {
    const user = userEvent.setup();
    const studio = mockStudio();
    const { post } = fakeDesignBackend(studio);
    const id = await sentToCustomer(studio);
    openStudio(id);

    await user.click(await screen.findByRole("button", { name: "Yêu cầu sửa" }));
    const dialog = await screen.findByRole("dialog", { name: "Yêu cầu sửa thiết kế" });
    await user.type(within(dialog).getByLabelText("Lý do yêu cầu sửa"), "Logo to hơn");
    await user.click(within(dialog).getByRole("button", { name: "Gửi yêu cầu sửa" }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(`/designs/${id}/change-requests`, {
        version: expect.any(Number),
        reason: "Logo to hơn",
      }),
    );
    expect(await screen.findAllByText("QC yêu cầu sửa")).not.toHaveLength(0);
  });

  it("shows a confirmed design's snapshot id and forks it", async () => {
    const user = userEvent.setup();
    const { post } = fakeDesignBackend(mockStudio());
    openStudio(MOCK_DESIGN_IDS.approvedCup);

    const card = await screen.findByRole("region", { name: "Bản chốt" });
    expect(await within(card).findByText(MOCK_DESIGN_IDS.snapshot)).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "Yêu cầu báo giá" })).toBeInTheDocument();
    await user.click(within(card).getByRole("button", { name: "Tạo phiên bản mới" }));

    await waitFor(() =>
      expect(env.push).toHaveBeenCalledWith(expect.stringMatching(/^\/design\//)),
    );
    expect(post).toHaveBeenCalledWith(`/designs/${MOCK_DESIGN_IDS.approvedCup}/revisions`);
  });

  it("lists the design's decisions, newest first, with the notes meant for the customer", async () => {
    const studio = mockStudio();
    fakeDesignBackend(studio);
    const id = await sentToCustomer(studio, "Chữ hơi sát mép, đã chỉnh");
    openStudio(id);

    const history = await screen.findByRole("region", { name: "Lịch sử thiết kế" });
    const rows = await within(history).findAllByRole("listitem");
    expect(rows.map((row) => row.firstChild?.textContent)).toEqual([
      "Sales gửi thiết kế để bạn xác nhận",
      "QC: đạt kỹ thuật",
    ]);
    expect(within(rows[1]!).getByText("Chữ hơi sát mép, đã chỉnh")).toBeInTheDocument();
    const { items } = settle(studio.history(id, {})).data as { items: { at: string }[] };
    const [sent] = items;
    expect(within(rows[0]!).getByText(formatDateTime(sent!.at))).toBeInTheDocument();
  });

  it("opens a mock design that names no template the same way (a design Sales created)", async () => {
    env.isMock = true;
    const studio = mockStudio();
    const { get } = fakeDesignBackend(studio);
    const answer = get.getMockImplementation()!;
    get.mockImplementation(async (url, config) => {
      const response = (await answer(url, config)) as { data: Record<string, unknown> };
      if (url !== `/designs/${MOCK_DESIGN_IDS.draftBag}`) return response;
      const { productSlug: _slug, templateCode: _code, ...draft } = response.data;
      return { ...response, data: draft };
    });
    openStudio(MOCK_DESIGN_IDS.draftBag);

    expect(await screen.findByText("Chỉnh sửa trực tuyến chưa mở")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Lịch sử thiết kế" })).toBeInTheDocument();
    // A draft here cannot be edited or sent to QC: the hint says what Sales does next (N6).
    expect(
      screen.getByText("Sales đang lên thiết kế theo yêu cầu của bạn và sẽ gửi để bạn xác nhận."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/hãy gửi QC kiểm tra/)).not.toBeInTheDocument();
    expect(screen.queryByRole("tablist", { name: "Mặt in" })).not.toBeInTheDocument();
  });

  it("opens a design whose template the product no longer lists the same way", async () => {
    env.isMock = true;
    const studio = mockStudio();
    const { get } = fakeDesignBackend(studio);
    const answer = get.getMockImplementation()!;
    get.mockImplementation(async (url, config) => {
      const response = (await answer(url, config)) as { data: Record<string, unknown> };
      if (!url.endsWith("/customization")) return response;
      return { ...response, data: { ...response.data, templates: [] } };
    });
    openStudio(MOCK_DESIGN_IDS.approvedCup);

    const card = await screen.findByRole("region", { name: "Bản chốt" });
    expect(await within(card).findByText(MOCK_DESIGN_IDS.snapshot)).toBeInTheDocument();
    expect(screen.queryByRole("tablist", { name: "Mặt in" })).not.toBeInTheDocument();
  });
});
