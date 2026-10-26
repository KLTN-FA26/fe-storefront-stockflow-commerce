import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { PROPOSED_ENDPOINTS_LIVE } from "../capabilities";
import { NewDesignScreen } from "../components/new-design-screen";
import { fakeDesignBackend, mockStudio } from "./design-backend";
import { beCustomization, beDraft, beTemplate, ids } from "./fixtures";

const env = vi.hoisted(() => ({ isMock: true, replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: env.replace, push: vi.fn() }),
}));
vi.mock("@/providers/app-providers", () => ({ useIsMock: () => env.isMock }));

beforeEach(() => {
  env.isMock = true;
  env.replace.mockReset();
  signIn();
});
afterEach(() => {
  vi.restoreAllMocks();
  signOut();
});

const CUP = "ly-giay-2-lop-12oz";
const CUP_SKU = "CUP-PAPER-12OZ-WHT";
const DAY_MONTH = / – \d{2}\/\d{2}$/;

const created = (overrides: Record<string, unknown> = {}) => ({
  data: beDraft({ id: ids.design, ...overrides }),
});

/** The P2 answer for the cup, with a second template for the same SKU. */
const twoTemplates = beCustomization({
  templates: [
    beTemplate(),
    beTemplate({
      code: "CUP12-RIM",
      templateId: "tpl-cup12-rim",
      name: "Ly giấy 12oz – in miệng ly",
    }),
  ],
});

describe("NewDesignScreen", () => {
  it("creates a design from the PDP link and opens the studio", async () => {
    const { post } = fakeDesignBackend(mockStudio());
    renderWithProviders(<NewDesignScreen product={CUP} sku={CUP_SKU} />);

    await waitFor(() =>
      expect(env.replace).toHaveBeenCalledWith(expect.stringMatching(/^\/design\/.+/)),
    );
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith("/designs/mine", {
      productId: expect.any(String),
      sku: CUP_SKU,
      templateCode: "CUP12-BODY",
      name: expect.stringMatching(DAY_MONTH),
    });
    expect(post.mock.calls[0]?.[1]).toMatchObject({
      name: expect.stringContaining("Ly giấy 12oz"),
    });
    expect(env.replace).toHaveBeenCalledTimes(1);
  });

  it("opens the studio of the design the BE created", async () => {
    fakeDesignBackend(mockStudio());
    renderWithProviders(<NewDesignScreen product={CUP} sku={CUP_SKU} />);
    await waitFor(() => expect(env.replace).toHaveBeenCalled());

    const id = String(env.replace.mock.calls[0]?.[0]).replace("/design/", "");
    const stored = await api.get(`/designs/${id}`);
    expect(stored.data).toMatchObject({ sku: CUP_SKU, templateCode: "CUP12-BODY" });
  });

  it("creates one design even when React runs the effects twice", async () => {
    const { post } = fakeDesignBackend(mockStudio());
    renderWithProviders(
      <StrictMode>
        <NewDesignScreen product={CUP} sku={CUP_SKU} />
      </StrictMode>,
    );

    await waitFor(() => expect(env.replace).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("calls nothing and sends the customer to Sales when the BE has not shipped self-service design", async () => {
    env.isMock = false;
    const { get, post } = fakeDesignBackend(mockStudio());
    renderWithProviders(<NewDesignScreen product={CUP} sku={CUP_SKU} />);

    expect(await screen.findByText("Thiết kế trực tuyến chưa mở")).toBeInTheDocument();
    expect(screen.getByText(/Sales của StockFlow lên thiết kế theo yêu cầu của bạn/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Nhắn Sales" })).toHaveAttribute("href", "/chat");
    expect(screen.getByRole("link", { name: "Quay lại sản phẩm" })).toHaveAttribute(
      "href",
      `/catalog/products/${CUP}`,
    );
    expect(get).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
    expect(env.replace).not.toHaveBeenCalled();
  });

  it("sends a signed-out visitor to Sales too, as signing in would not let them start", async () => {
    env.isMock = false;
    signOut();
    renderWithProviders(<NewDesignScreen product={CUP} sku={CUP_SKU} />);

    expect(await screen.findByText("Thiết kế trực tuyến chưa mở")).toBeInTheDocument();
    expect(screen.queryByText("Đăng nhập để bắt đầu thiết kế")).not.toBeInTheDocument();
  });

  it("asks a visitor to sign in once the BE serves self-service, and brings them back", async () => {
    // The real BE with P1 shipped (mock mode counts every caller as signed in).
    env.isMock = false;
    PROPOSED_ENDPOINTS_LIVE.selfService = true;
    try {
      signOut();
      const { get, post } = fakeDesignBackend(mockStudio());
      renderWithProviders(<NewDesignScreen product={CUP} sku={CUP_SKU} />);

      expect(await screen.findByText("Đăng nhập để bắt đầu thiết kế")).toBeInTheDocument();
      const next = encodeURIComponent(`/design/new?product=${CUP}&sku=${CUP_SKU}`);
      expect(screen.getByRole("link", { name: "Đăng nhập" })).toHaveAttribute(
        "href",
        `/login?next=${next}`,
      );
      expect(get).not.toHaveBeenCalled();
      expect(post).not.toHaveBeenCalled();
    } finally {
      PROPOSED_ENDPOINTS_LIVE.selfService = false;
    }
  });

  describe("a variant with several templates", () => {
    beforeEach(() => {
      vi.spyOn(api, "get").mockResolvedValue({ data: twoTemplates });
      vi.spyOn(api, "post").mockResolvedValue(created());
    });

    it("asks which one before creating anything", async () => {
      renderWithProviders(<NewDesignScreen product={CUP} sku={CUP_SKU} />);

      const group = await screen.findByRole("group", { name: "Chọn mẫu thiết kế" });
      expect(group).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Ly giấy 12oz – in thân ly" })).toBeInTheDocument();
      expect(api.post).not.toHaveBeenCalled();

      await userEvent.click(screen.getByRole("button", { name: "Ly giấy 12oz – in miệng ly" }));
      await userEvent.click(screen.getByRole("button", { name: "Bắt đầu thiết kế" }));

      expect(api.post).toHaveBeenCalledWith("/designs/mine", {
        productId: ids.product,
        sku: CUP_SKU,
        templateCode: "CUP12-RIM",
        name: expect.stringContaining("in miệng ly"),
      });
      await waitFor(() => expect(env.replace).toHaveBeenCalledWith(`/design/${ids.design}`));
    });

    it("starts with the first template when the customer just confirms", async () => {
      renderWithProviders(<NewDesignScreen product={CUP} sku={CUP_SKU} />);
      await userEvent.click(await screen.findByRole("button", { name: "Bắt đầu thiết kế" }));
      expect(api.post).toHaveBeenCalledWith(
        "/designs/mine",
        expect.objectContaining({ templateCode: "CUP12-BODY" }),
      );
    });
  });

  it("offers every template of the product, naming the SKU, when the link carries none", async () => {
    const { post } = fakeDesignBackend(mockStudio());
    renderWithProviders(<NewDesignScreen product="tui-giay-kraft" sku={null} />);

    await userEvent.click(
      await screen.findByRole("button", { name: /Túi kraft size L.*BAG-KRAFT-L/ }),
    );
    expect(
      screen.getByRole("button", { name: /Túi kraft size M.*BAG-KRAFT-M/ }),
    ).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Bắt đầu thiết kế" }));
    await waitFor(() => expect(env.replace).toHaveBeenCalled());
    expect(post).toHaveBeenCalledWith(
      "/designs/mine",
      expect.objectContaining({ sku: "BAG-KRAFT-L", templateCode: "BAGL-4F" }),
    );
  });

  it("says a variant has no template instead of creating a design from another one", async () => {
    const { post } = fakeDesignBackend(mockStudio());
    renderWithProviders(<NewDesignScreen product={CUP} sku="CUP-NOT-A-VARIANT" />);

    expect(await screen.findByText("Phiên bản này chưa có mẫu thiết kế.")).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it("explains a product that cannot be customized", async () => {
    fakeDesignBackend(mockStudio());
    renderWithProviders(<NewDesignScreen product="hop-giay-mang-di-m" sku="BOX-TAKEAWAY-M" />);

    expect(await screen.findByText(/Sản phẩm này không hỗ trợ thiết kế\./)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Bắt đầu thiết kế" })).not.toBeInTheDocument();
  });

  it("says a product is missing, and falls back to the unavailable state for an unshipped route", async () => {
    fakeDesignBackend(mockStudio());
    const { unmount } = renderWithProviders(<NewDesignScreen product="khong-ton-tai" sku={null} />);
    expect(
      await screen.findByText(/Không tìm thấy thiết kế hoặc sản phẩm này\./),
    ).toBeInTheDocument();
    unmount();

    vi.mocked(api.get).mockRejectedValue(
      new ApiError(404, "DESIGN_API_UNAVAILABLE", "The design API is not available"),
    );
    renderWithProviders(<NewDesignScreen product={CUP} sku={CUP_SKU} />);
    expect(await screen.findByText("Thiết kế trực tuyến chưa mở")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Nhắn Sales" })).toHaveAttribute("href", "/chat");
  });

  it("shows why the BE refused to create the design, and retries on request", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: beCustomization() });
    const post = vi
      .spyOn(api, "post")
      .mockRejectedValueOnce(
        new ApiError(422, "TEMPLATE_NOT_FOUND", "no such template", undefined, "corr-7"),
      )
      .mockResolvedValueOnce(created());
    renderWithProviders(<NewDesignScreen product={CUP} sku={CUP_SKU} />);

    expect(await screen.findByText(/Phiên bản này chưa có mẫu thiết kế\./)).toBeInTheDocument();
    expect(screen.getByText(/Mã tra cứu: corr-7/)).toBeInTheDocument();
    expect(env.replace).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: /Thử lại/ }));

    await waitFor(() => expect(env.replace).toHaveBeenCalledWith(`/design/${ids.design}`));
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[1]?.[1]).toEqual(post.mock.calls[0]?.[1]);
  });

  it("retries a failed template load", async () => {
    const get = vi
      .spyOn(api, "get")
      .mockRejectedValueOnce(new ApiError(403, "FORBIDDEN", "no"))
      .mockResolvedValue({ data: beCustomization() });
    vi.spyOn(api, "post").mockResolvedValue(created());
    renderWithProviders(<NewDesignScreen product={CUP} sku={CUP_SKU} />);

    await userEvent.click(await screen.findByRole("button", { name: /Thử lại/ }));
    await waitFor(() => expect(env.replace).toHaveBeenCalledWith(`/design/${ids.design}`));
    expect(get).toHaveBeenCalledTimes(2);
  });
});
