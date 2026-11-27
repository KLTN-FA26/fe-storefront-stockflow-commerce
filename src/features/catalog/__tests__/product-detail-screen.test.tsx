import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { createMockCatalog, seedMockCatalog } from "@/lib/api/mock-fixtures/catalog";
import { fakeBackend } from "@/test/fake-backend";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { ProductDetailScreen } from "../components/product-detail-screen";

beforeEach(() => {
  signIn();
  fakeBackend({ catalog: createMockCatalog(seedMockCatalog()) });
});
afterEach(() => {
  vi.restoreAllMocks();
  signOut();
});

/** The panel is ready once the product heading is there and the stock call has answered. */
const ready = async (title: string) => {
  await screen.findByRole("heading", { name: title });
  return screen.findByRole("link", { name: "Chat với Sale" });
};

/** A BE that does not send `kind`: the product is not known to be customizable. */
function readProductsAsStockGoods() {
  const real = vi.mocked(api.get).getMockImplementation()!;
  vi.mocked(api.get).mockImplementation(async (url, config) => {
    const result = (await real(url, config)) as { data: Record<string, unknown> };
    if (result.data && typeof result.data === "object" && "kind" in result.data) {
      const { kind: _kind, ...withoutKind } = result.data;
      return { data: withoutKind };
    }
    return result;
  });
}

describe("ProductDetailScreen — no price, no cart (kltn-docs 13 BR-04, 14 BR-01)", () => {
  beforeEach(readProductsAsStockGoods);

  it("shows the product, its variants and their stock, and sends the customer to Sales", async () => {
    renderWithProviders(<ProductDetailScreen slug="ly-giay-2-lop-8oz" />);
    expect(await ready("Ly giấy 2 lớp 8oz")).toHaveAttribute("href", "/chat");
    expect(await screen.findByText("Còn hàng")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kraft" })).toBeInTheDocument();
    expect(screen.getByText(/Giá không hiển thị trên sàn/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Thêm vào giỏ/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Số lượng" })).not.toBeInTheDocument();
    expect(screen.queryByText(/₫/)).not.toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalledWith("/catalog/products/prices", expect.anything());
  });

  it("switches variant to its own stock badge", async () => {
    renderWithProviders(<ProductDetailScreen slug="ly-giay-2-lop-8oz" />);
    await ready("Ly giấy 2 lớp 8oz");
    expect(await screen.findByText("Còn hàng")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Kraft" }));
    expect(await screen.findByText("Sắp hết")).toBeInTheDocument();
  });

  it("says an out-of-stock variant is out and still offers Sales", async () => {
    renderWithProviders(<ProductDetailScreen slug="ly-nhua-pet-500ml" />);
    await ready("Ly nhựa PET 500ml");
    expect(await screen.findByText("Hết hàng")).toBeInTheDocument();
    expect(screen.getByText(/đang hết hàng/)).toBeInTheDocument();
  });

  it("falls back to the detail's own stock when /availability is refused", async () => {
    const real = vi.mocked(api.get).getMockImplementation()!;
    vi.mocked(api.get).mockImplementation(async (url, config) => {
      if (url === "/catalog/products/availability") {
        throw new ApiError(403, "FORBIDDEN", "Not authorised");
      }
      return real(url, config);
    });
    renderWithProviders(<ProductDetailScreen slug="ly-giay-2-lop-8oz" />);
    await ready("Ly giấy 2 lớp 8oz");
    expect(await screen.findByText("Còn hàng")).toBeInTheDocument();
  });

  it("shows the product page for an unpublished slug instead of a broken product", async () => {
    renderWithProviders(<ProductDetailScreen slug="khong-ton-tai" />);
    expect(await screen.findByText("Sản phẩm không còn khả dụng")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Xem các sản phẩm khác" })).toHaveAttribute(
      "href",
      "/catalog",
    );
  });

  it("asks a visitor to sign in and calls nothing", async () => {
    signOut();
    renderWithProviders(<ProductDetailScreen slug="ly-giay-2-lop-8oz" />);
    expect(await screen.findByText("Đăng nhập để xem sản phẩm")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Đăng nhập" })).toHaveAttribute(
      "href",
      "/login?next=%2Fcatalog%2Fproducts%2Fly-giay-2-lop-8oz",
    );
    // A business with no account is led to the request form (KE-HOACH sales owner §10.7).
    expect(screen.getByRole("link", { name: "Gửi yêu cầu mở tài khoản" })).toHaveAttribute(
      "href",
      "/mo-tai-khoan",
    );
    expect(api.get).not.toHaveBeenCalled();
  });

  it("reports a server error with the correlation id and a retry", async () => {
    vi.mocked(api.get).mockRejectedValueOnce(
      new ApiError(429, "RATE_LIMITED", "Too many requests", undefined, "corr-9"),
    );
    renderWithProviders(<ProductDetailScreen slug="ly-giay-2-lop-8oz" />);
    expect(await screen.findByText(/Mã tra cứu: corr-9/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Thử lại/ }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Ly giấy 2 lớp 8oz" })).toBeInTheDocument(),
    );
  });

  it("renders the BE description as cleaned HTML: formatting kept, script and handlers dropped", async () => {
    const real = vi.mocked(api.get).getMockImplementation()!;
    vi.mocked(api.get).mockImplementation(async (url, config) => {
      const result = (await real(url, config)) as {
        data: { description?: string; variants?: Array<Record<string, unknown>> };
      };
      if (url === "/catalog/products/ly-giay-2-lop-8oz") {
        const hostile =
          '<p onclick="alert(1)">Ly <strong>bền</strong></p><script>alert(2)</script>' +
          '<img src="javascript:alert(3)" onerror="alert(4)"><a href="javascript:alert(5)">xem</a>';
        return {
          data: {
            ...result.data,
            description: hostile,
            variants: result.data.variants?.map(
              ({ descriptionHtml: _d, ownDescription: _o, ...v }) => v,
            ),
          },
        };
      }
      return result;
    });
    const { container } = renderWithProviders(<ProductDetailScreen slug="ly-giay-2-lop-8oz" />);
    expect(await screen.findByText("bền")).toBeInTheDocument();
    expect(screen.getByText("bền").tagName).toBe("STRONG");
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("[onclick], [onerror]")).toBeNull();
    expect(container.querySelector("img[src^='javascript']")).toBeNull();
    expect(container.querySelector("a[href^='javascript']")).toBeNull();
  });

  it("shows brand, category and descriptive attributes, and the chosen variant's own description", async () => {
    renderWithProviders(<ProductDetailScreen slug="ly-giay-2-lop-8oz" />);
    await ready("Ly giấy 2 lớp 8oz");
    expect(screen.getAllByText("StockFlow Pack").length).toBeGreaterThan(0);
    const facts = screen.getByRole("region", { name: "Thông số sản phẩm" });
    expect(facts).toHaveTextContent("Ly giấy");
    expect(facts).toHaveTextContent("Chất liệu");
    expect(facts).toHaveTextContent("Giấy");
    expect(facts).toHaveTextContent("2 lớp");
    // The white cup has no description of its own: the product's shows.
    expect(screen.getByText("hai lớp").tagName).toBe("STRONG");
    await userEvent.click(screen.getByRole("button", { name: "Kraft" }));
    expect(await screen.findByText("kraft")).toBeInTheDocument();
    expect(screen.queryByText("hai lớp")).not.toBeInTheDocument();
  });

  it("says a product the BE refuses to show (409 PRICE_NOT_AVAILABLE) is not on sale yet, with Sales", async () => {
    renderWithProviders(<ProductDetailScreen slug="ly-giay-kraft-16oz" />);
    expect(await screen.findByText("Sản phẩm tạm thời chưa mở bán")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Thử lại/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Chat với Sale" })).toBeInTheDocument();
  });
});

/** The product page composes the design feature's entry through this prop (catalog never imports design). */
const renderEntry = (sku: string) => <p>{`design entry for ${sku}`}</p>;

describe("ProductDetailScreen design entry (kltn-docs 12, 13 §4)", () => {
  it("renders the design entry of a customizable product for the chosen SKU, beside Sales", async () => {
    renderWithProviders(
      <ProductDetailScreen slug="ly-giay-2-lop-8oz" renderDesignEntry={renderEntry} />,
    );
    expect(await ready("Ly giấy 2 lớp 8oz")).toHaveAttribute("href", "/chat");
    expect(screen.getByText("design entry for CUP-PAPER-8OZ-WHT")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Kraft" }));
    expect(screen.getByText("design entry for CUP-PAPER-8OZ-KRAFT")).toBeInTheDocument();
    // A design is quoted from the approved design (13 §4 step 1), never put in a basket.
    expect(screen.getByText(/gửi yêu cầu báo giá/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Thêm vào giỏ/ })).not.toBeInTheDocument();
  });

  it("renders no design entry for a standard product", async () => {
    renderWithProviders(
      <ProductDetailScreen slug="hop-giay-mang-di-m" renderDesignEntry={renderEntry} />,
    );
    await screen.findByRole("link", { name: "Chat với Sale" });
    expect(screen.queryByText(/design entry for/)).not.toBeInTheDocument();
    expect(screen.getByText(/Giá không hiển thị trên sàn/)).toBeInTheDocument();
  });

  it("renders no design entry while the BE does not say the product is customizable", async () => {
    readProductsAsStockGoods();
    renderWithProviders(
      <ProductDetailScreen slug="ly-giay-2-lop-8oz" renderDesignEntry={renderEntry} />,
    );
    await ready("Ly giấy 2 lớp 8oz");
    expect(screen.queryByText(/design entry for/)).not.toBeInTheDocument();
  });
});
