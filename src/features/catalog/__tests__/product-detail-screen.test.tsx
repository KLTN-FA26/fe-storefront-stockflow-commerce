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
    expect(screen.getByRole("button", { name: "CUP-PAPER-8OZ-KRAFT" })).toBeInTheDocument();
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
    await userEvent.click(screen.getByRole("button", { name: "CUP-PAPER-8OZ-KRAFT" }));
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

  it("renders the BE description as text, never as HTML", async () => {
    const real = vi.mocked(api.get).getMockImplementation()!;
    vi.mocked(api.get).mockImplementation(async (url, config) => {
      const result = (await real(url, config)) as { data: { description?: string } };
      if (url === "/catalog/products/ly-giay-2-lop-8oz") {
        return { data: { ...result.data, description: "<img src=x onerror=alert(1)>Ly" } };
      }
      return result;
    });
    const { container } = renderWithProviders(<ProductDetailScreen slug="ly-giay-2-lop-8oz" />);
    expect(await screen.findByText(/<img src=x/)).toBeInTheDocument();
    expect(container.querySelector("img[src='x']")).toBeNull();
  });

  it("says a product the BE refuses to show (409 PRICE_NOT_AVAILABLE) is not on sale yet, with Sales", async () => {
    renderWithProviders(<ProductDetailScreen slug="ly-giay-kraft-16oz" />);
    expect(await screen.findByText("Sản phẩm tạm thời chưa mở bán")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Thử lại/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Chat với Sales" })).toBeInTheDocument();
  });
});

describe("ProductDetailScreen design entry (kltn-docs 12, 13 §4)", () => {
  it("offers 'Bắt đầu thiết kế' for a customizable product, for the chosen SKU", async () => {
    renderWithProviders(<ProductDetailScreen slug="ly-giay-2-lop-8oz" />);
    await ready("Ly giấy 2 lớp 8oz");
    expect(screen.getByRole("link", { name: "Bắt đầu thiết kế" })).toHaveAttribute(
      "href",
      "/design/new?product=ly-giay-2-lop-8oz&sku=CUP-PAPER-8OZ-WHT",
    );
    await userEvent.click(screen.getByRole("button", { name: "CUP-PAPER-8OZ-KRAFT" }));
    expect(screen.getByRole("link", { name: "Bắt đầu thiết kế" })).toHaveAttribute(
      "href",
      "/design/new?product=ly-giay-2-lop-8oz&sku=CUP-PAPER-8OZ-KRAFT",
    );
    // A design is quoted from the approved design (13 §4 step 1), never put in a basket.
    expect(screen.getByText(/gửi yêu cầu báo giá/)).toBeInTheDocument();
  });

  it("offers no design entry while the BE does not say the product is customizable", async () => {
    readProductsAsStockGoods();
    renderWithProviders(<ProductDetailScreen slug="ly-giay-2-lop-8oz" />);
    await ready("Ly giấy 2 lớp 8oz");
    expect(screen.queryByRole("link", { name: "Bắt đầu thiết kế" })).not.toBeInTheDocument();
  });
});
