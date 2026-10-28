import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { createMockCatalog, seedMockCatalog } from "@/lib/api/mock-fixtures/catalog";
import { useCartStore } from "@/lib/store/use-cart-store";
import { fakeBackend } from "@/test/fake-backend";
import { renderWithProviders, resetCart, signIn, signOut } from "@/test/render";

import { ProductDetailScreen } from "../components/product-detail-screen";

beforeEach(() => {
  resetCart();
  signIn();
  fakeBackend({ catalog: createMockCatalog(seedMockCatalog()) });
});
afterEach(() => {
  vi.restoreAllMocks();
  signOut();
  resetCart();
});

/** The purchase panel is ready once the price list has arrived (the add button exists earlier, disabled). */
const addButton = async () => {
  await screen.findByRole("table", { name: "Giá theo số lượng" });
  return screen.findByRole("button", { name: "Thêm vào giỏ" });
};
/**
 * The mock catalogue marks most print products CUSTOMIZABLE, and those are quoted rather than
 * added to the cart (DESIGN-QUOTE). The purchase tests below are about stock goods, so they read
 * the product as a BE does that does not send `kind`: not known to be customizable.
 */
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
const quantityField = (name = "Số lượng") => screen.getByRole("textbox", { name });

describe("ProductDetailScreen", () => {
  beforeEach(readProductsAsStockGoods);

  it("shows the product, its variants, the customer's price tiers and the MOQ", async () => {
    renderWithProviders(<ProductDetailScreen slug="ly-giay-2-lop-8oz" />);

    expect(await screen.findByRole("heading", { name: "Ly giấy 2 lớp 8oz" })).toBeInTheDocument();
    expect(screen.getByText(/Ly giấy hai lớp cách nhiệt/)).toBeInTheDocument();
    expect(await screen.findByText(/Bảng giá riêng của bạn/)).toBeInTheDocument();
    expect(screen.getByText(/đặt tối thiểu/)).toBeInTheDocument();
    const tiers = screen.getByRole("table", { name: "Giá theo số lượng" });
    expect(within(tiers).getByText("1000 – 4999")).toBeInTheDocument();
    expect(within(tiers).getByText("từ 5000")).toBeInTheDocument();
    // Starts at the MOQ, priced at the first tier.
    expect(quantityField()).toHaveValue("1000");
    expect(screen.getByRole("group", { name: "Phiên bản (mã SKU)" })).toBeInTheDocument();
  });

  it("reprices when the quantity reaches the next tier", async () => {
    renderWithProviders(<ProductDetailScreen slug="ly-giay-2-lop-8oz" />);
    await addButton();
    const tiers = screen.getByRole("table", { name: "Giá theo số lượng" });
    expect(within(tiers).getByText("1000 – 4999").closest("tr")).toHaveAttribute(
      "aria-current",
      "true",
    );

    const field = quantityField();
    await userEvent.clear(field);
    await userEvent.type(field, "5000{Enter}");

    expect(field).toHaveValue("5000");
    expect(within(tiers).getByText("từ 5000").closest("tr")).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("will not go below the MOQ: a typed quantity is raised to it", async () => {
    renderWithProviders(<ProductDetailScreen slug="ly-giay-2-lop-8oz" />);
    await addButton();
    const field = quantityField();
    await userEvent.clear(field);
    await userEvent.type(field, "10{Enter}");
    expect(field).toHaveValue("1000");
    expect(screen.getByRole("button", { name: "Giảm số lượng" })).toBeDisabled();
  });

  it("adds the chosen SKU and quantity to the cart", async () => {
    renderWithProviders(<ProductDetailScreen slug="ly-giay-2-lop-8oz" />);
    const button = await addButton();
    expect(quantityField()).toHaveValue("1000");
    await userEvent.click(button);

    expect(useCartStore.getState().lines).toEqual([
      expect.objectContaining({
        sku: "CUP-PAPER-8OZ-WHT",
        slug: "ly-giay-2-lop-8oz",
        title: "Ly giấy 2 lớp 8oz",
        quantity: 1000,
      }),
    ]);
  });

  it("switches variant: its own stock badge, its own SKU in the cart", async () => {
    renderWithProviders(<ProductDetailScreen slug="ly-giay-2-lop-8oz" />);
    await addButton();
    expect(await screen.findByText("Còn hàng")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "CUP-PAPER-8OZ-KRAFT" }));
    expect(await screen.findByText("Sắp hết")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Thêm vào giỏ" }));

    expect(useCartStore.getState().lines[0]?.sku).toBe("CUP-PAPER-8OZ-KRAFT");
  });

  it("disables adding an out-of-stock variant and says why", async () => {
    renderWithProviders(<ProductDetailScreen slug="ly-nhua-pet-500ml" />);
    await screen.findByRole("heading", { name: "Ly nhựa PET 500ml" });
    expect(await screen.findByText("Hết hàng")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thêm vào giỏ" })).toBeDisabled();
    expect(screen.getByText(/đang hết hàng/)).toBeInTheDocument();
  });

  it("disables adding a SKU with no price and sends the customer to Sales", async () => {
    renderWithProviders(<ProductDetailScreen slug="ly-giay-in-logo" />);
    expect(await screen.findByText("Chưa có giá cho sản phẩm này.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thêm vào giỏ" })).toBeDisabled();
  });

  it("falls back to the detail's own IN/OUT stock and says prices are refused when /prices is 403", async () => {
    const real = vi.mocked(api.get).getMockImplementation()!;
    vi.mocked(api.get).mockImplementation(async (url, config) => {
      if (url === "/catalog/products/availability" || url === "/catalog/products/prices") {
        throw new ApiError(403, "FORBIDDEN", "Not authorised");
      }
      return real(url, config);
    });
    renderWithProviders(<ProductDetailScreen slug="ly-giay-2-lop-8oz" />);

    expect(await screen.findByText("Không xem được giá.")).toBeInTheDocument();
    expect(screen.getByText("Còn hàng")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thêm vào giỏ" })).toBeDisabled();
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

  it("says a product is temporarily without a price when the BE detail refuses it (409 PRICE_NOT_AVAILABLE)", async () => {
    renderWithProviders(<ProductDetailScreen slug="ly-giay-kraft-16oz" />);
    expect(await screen.findByText("Sản phẩm tạm thời chưa có giá")).toBeInTheDocument();
    // Not the generic failure with a retry that could never help.
    expect(screen.queryByRole("button", { name: /Thử lại/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Không tải được sản phẩm/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Chat với Sales" })).toBeInTheDocument();
  });
});

describe("ProductDetailScreen design entry", () => {
  it("offers 'Bắt đầu thiết kế' for a customizable product, for the chosen SKU", async () => {
    renderWithProviders(<ProductDetailScreen slug="ly-giay-2-lop-8oz" />);
    await screen.findByRole("table", { name: "Giá theo số lượng" });
    expect(screen.getByRole("link", { name: "Bắt đầu thiết kế" })).toHaveAttribute(
      "href",
      "/design/new?product=ly-giay-2-lop-8oz&sku=CUP-PAPER-8OZ-WHT",
    );

    await userEvent.click(screen.getByRole("button", { name: "CUP-PAPER-8OZ-KRAFT" }));
    expect(screen.getByRole("link", { name: "Bắt đầu thiết kế" })).toHaveAttribute(
      "href",
      "/design/new?product=ly-giay-2-lop-8oz&sku=CUP-PAPER-8OZ-KRAFT",
    );
  });

  it("offers no design entry for a standard product", async () => {
    renderWithProviders(<ProductDetailScreen slug="hop-giay-mang-di-m" />);
    await addButton();
    expect(screen.queryByRole("link", { name: "Bắt đầu thiết kế" })).not.toBeInTheDocument();
  });

  it("offers no design entry while the BE does not say the product is customizable", async () => {
    const real = vi.mocked(api.get).getMockImplementation()!;
    vi.mocked(api.get).mockImplementation(async (url, config) => {
      const result = (await real(url, config)) as { data: { kind?: string } };
      if (url !== "/catalog/products/ly-giay-2-lop-8oz") return result;
      const { kind: _kind, ...withoutKind } = result.data;
      return { data: withoutKind };
    });
    renderWithProviders(<ProductDetailScreen slug="ly-giay-2-lop-8oz" />);
    await addButton();
    expect(screen.queryByRole("link", { name: "Bắt đầu thiết kế" })).not.toBeInTheDocument();
  });
});

describe("ProductDetailScreen: a product printed to a design is quoted, not added (DESIGN-QUOTE)", () => {
  it("hides 'Thêm vào giỏ' and offers 'Liên hệ Sale báo giá' to the chat", async () => {
    renderWithProviders(<ProductDetailScreen slug="ly-giay-2-lop-8oz" />);
    await screen.findByRole("table", { name: "Giá theo số lượng" });

    expect(screen.queryByRole("button", { name: "Thêm vào giỏ" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Liên hệ Sale báo giá" })).toHaveAttribute(
      "href",
      "/chat",
    );
    expect(screen.getByText(/được báo giá riêng, nên không thêm vào giỏ hàng/)).toBeInTheDocument();
    // The design launcher is still there; the cart stays empty.
    expect(screen.getByRole("link", { name: "Bắt đầu thiết kế" })).toBeInTheDocument();
    expect(useCartStore.getState().lines).toEqual([]);
  });

  it("does so for every variant of the product, in stock or not", async () => {
    renderWithProviders(<ProductDetailScreen slug="ly-giay-2-lop-8oz" />);
    await screen.findByRole("table", { name: "Giá theo số lượng" });
    await userEvent.click(screen.getByRole("button", { name: "CUP-PAPER-8OZ-KRAFT" }));
    expect(screen.queryByRole("button", { name: "Thêm vào giỏ" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Liên hệ Sale báo giá" })).toBeInTheDocument();

    renderWithProviders(<ProductDetailScreen slug="ly-nhua-pet-500ml" />);
    await screen.findByRole("heading", { name: "Ly nhựa PET 500ml" });
    expect(screen.queryByRole("button", { name: "Thêm vào giỏ" })).not.toBeInTheDocument();
  });

  it("keeps 'Thêm vào giỏ' for a stock product and offers no quote button", async () => {
    renderWithProviders(<ProductDetailScreen slug="hop-giay-mang-di-m" />);
    expect(await addButton()).toBeEnabled();
    expect(screen.queryByRole("link", { name: "Liên hệ Sale báo giá" })).not.toBeInTheDocument();
    expect(screen.queryByText(/được báo giá riêng/)).not.toBeInTheDocument();
  });

  it("treats a product as stock goods while the BE does not say it is customizable", async () => {
    readProductsAsStockGoods();
    renderWithProviders(<ProductDetailScreen slug="ly-giay-2-lop-8oz" />);
    expect(await addButton()).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Liên hệ Sale báo giá" })).not.toBeInTheDocument();
  });
});
