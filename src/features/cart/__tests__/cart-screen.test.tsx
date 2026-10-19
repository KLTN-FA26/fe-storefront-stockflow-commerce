import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { createMockCatalog, seedMockCatalog } from "@/lib/api/mock-fixtures/catalog";
import { useCartStore } from "@/lib/store/use-cart-store";
import { fakeBackend } from "@/test/fake-backend";
import { renderWithProviders, resetCart, signIn, signOut } from "@/test/render";

import { CartScreen } from "../components/cart-screen";

const add = (sku: string, quantity: number, title = sku) =>
  useCartStore.getState().add({ sku, slug: sku.toLowerCase(), title }, quantity);

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

const checkout = () => screen.findByRole("link", { name: /Tiếp tục đặt hàng/ });

describe("CartScreen", () => {
  it("shows an empty cart without calling the BE", async () => {
    renderWithProviders(<CartScreen />);
    expect(await screen.findByText("Giỏ hàng trống")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Xem sản phẩm" })).toHaveAttribute("href", "/catalog");
    expect(api.get).not.toHaveBeenCalled();
  });

  it("prices each line from the customer's tiers and totals them", async () => {
    add("CUP-PAPER-8OZ-WHT", 5000, "Ly giấy 8oz");
    add("BOX-TAKEAWAY-M", 200, "Hộp giấy M");
    renderWithProviders(<CartScreen />);

    // 5000 × 720 + 200 × 2100 = 4.020.000
    expect(await screen.findAllByText(/4\.020\.000/)).not.toHaveLength(0);
    expect(screen.getByText(/3\.600\.000/)).toBeInTheDocument();
    expect(await checkout()).toHaveAttribute("href", "/checkout");
    expect(screen.getByText(/Giá và tồn kho được kiểm tra lại/)).toBeInTheDocument();
  });

  it("asks the BE for the cart's SKUs once each, not per line", async () => {
    add("CUP-PAPER-8OZ-WHT", 1000);
    add("BOX-TAKEAWAY-M", 200);
    renderWithProviders(<CartScreen />);
    await checkout();

    const skusOf = (url: string) =>
      vi
        .mocked(api.get)
        .mock.calls.filter(([u]) => u === url)
        .map(([, config]) => (config?.params as { sku: string[] }).sku);
    expect(skusOf("/catalog/products/availability")).toEqual([
      ["BOX-TAKEAWAY-M", "CUP-PAPER-8OZ-WHT"],
    ]);
    expect(skusOf("/catalog/products/prices")).toEqual([["BOX-TAKEAWAY-M", "CUP-PAPER-8OZ-WHT"]]);
  });

  it("blocks checkout on an out-of-stock line and says which", async () => {
    add("CUP-PET-500ML", 500, "Ly nhựa PET");
    renderWithProviders(<CartScreen />);

    expect(await screen.findByText("Có sản phẩm đang chặn đặt hàng")).toBeInTheDocument();
    expect(screen.getByText(/Hết hàng\. Hãy xoá sản phẩm này/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Tiếp tục đặt hàng/ })).toBeDisabled();
    expect(screen.queryByRole("link", { name: /Tiếp tục đặt hàng/ })).not.toBeInTheDocument();
  });

  it("blocks a SKU without a price and one below the MOQ", async () => {
    add("CUP-CUSTOM-LOGO", 10, "Ly in logo");
    add("CUP-PAPER-8OZ-WHT", 10, "Ly giấy 8oz");
    renderWithProviders(<CartScreen />);

    expect(await screen.findByText(/Chưa có giá cho sản phẩm này/)).toBeInTheDocument();
    expect(screen.getByText(/Số lượng tối thiểu của bảng giá là 1000/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Tiếp tục đặt hàng/ })).toBeDisabled();
  });

  it("unblocks when the customer fixes the line: removing the bad one lets them go on", async () => {
    add("CUP-PET-500ML", 500, "Ly nhựa PET");
    add("BOX-TAKEAWAY-M", 200, "Hộp giấy M");
    renderWithProviders(<CartScreen />);
    await screen.findByText("Có sản phẩm đang chặn đặt hàng");

    await userEvent.click(screen.getByRole("button", { name: "Xoá Ly nhựa PET" }));

    expect(await checkout()).toBeInTheDocument();
    expect(useCartStore.getState().lines.map((l) => l.sku)).toEqual(["BOX-TAKEAWAY-M"]);
  });

  it("reprices when the quantity reaches the next tier", async () => {
    add("CUP-PAPER-8OZ-WHT", 1000, "Ly giấy 8oz");
    renderWithProviders(<CartScreen />);
    expect(await screen.findAllByText(/780\.000/)).not.toHaveLength(0);

    const field = screen.getByRole("textbox", { name: "Số lượng Ly giấy 8oz" });
    await userEvent.clear(field);
    await userEvent.type(field, "5000{Enter}");

    await waitFor(() => expect(screen.getAllByText(/3\.600\.000/)).not.toHaveLength(0));
    expect(useCartStore.getState().lines[0]?.quantity).toBe(5000);
  });

  it("does not go below the MOQ through the stepper", async () => {
    add("CUP-PAPER-8OZ-WHT", 1000, "Ly giấy 8oz");
    renderWithProviders(<CartScreen />);
    await checkout();
    expect(screen.getByRole("button", { name: "Giảm số lượng" })).toBeDisabled();
  });

  it("asks a visitor to sign in", async () => {
    signOut();
    add("CUP-PAPER-8OZ-WHT", 1000);
    renderWithProviders(<CartScreen />);
    expect(await screen.findByText("Đăng nhập để xem giỏ hàng")).toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });

  it("says prices are unavailable to a non-customer account (403), without calling every line 'no price'", async () => {
    const real = vi.mocked(api.get).getMockImplementation()!;
    vi.mocked(api.get).mockImplementation(async (url, config) => {
      if (url === "/catalog/products/prices" || url === "/catalog/products/availability") {
        throw new ApiError(403, "FORBIDDEN", "Not authorised");
      }
      return real(url, config);
    });
    add("CUP-PAPER-8OZ-WHT", 1000, "Ly giấy 8oz");
    renderWithProviders(<CartScreen />);

    expect(await screen.findByText("Chưa kiểm tra được giá và tồn kho.")).toBeInTheDocument();
    expect(screen.getByText(/Chỉ tài khoản khách hàng đã kích hoạt/)).toBeInTheDocument();
    expect(screen.queryByText(/Chưa có giá cho sản phẩm này/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Tiếp tục đặt hàng/ })).toBeDisabled();
  });

  it("keeps checkout locked and offers a retry when the price read fails", async () => {
    const real = vi.mocked(api.get).getMockImplementation()!;
    let failures = 1;
    vi.mocked(api.get).mockImplementation(async (url, config) => {
      if (url === "/catalog/products/prices" && failures-- > 0) {
        throw new ApiError(429, "RATE_LIMITED", "Too many", undefined, "corr-7");
      }
      return real(url, config);
    });
    add("CUP-PAPER-8OZ-WHT", 1000, "Ly giấy 8oz");
    renderWithProviders(<CartScreen />);

    expect(await screen.findByText(/Bạn thao tác quá nhanh.*corr-7/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Tiếp tục đặt hàng/ })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: /Thử lại/ }));
    expect(await checkout()).toBeInTheDocument();
  });

  it("shows the line count with the line's SKU for support", async () => {
    add("CUP-PAPER-8OZ-WHT", 1000, "Ly giấy 8oz");
    renderWithProviders(<CartScreen />);
    const article = (await screen.findByRole("heading", { name: "Ly giấy 8oz" })).closest(
      "article",
    )!;
    expect(within(article).getByText("CUP-PAPER-8OZ-WHT")).toBeInTheDocument();
  });
});
