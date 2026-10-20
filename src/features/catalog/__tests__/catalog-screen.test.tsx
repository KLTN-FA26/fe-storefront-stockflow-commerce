import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { OnUrlUpdateFunction } from "nuqs/adapters/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { createMockCatalog, seedMockCatalog } from "@/lib/api/mock-fixtures/catalog";
import { fakeBackend } from "@/test/fake-backend";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { CatalogScreen } from "../components/catalog-screen";
import { FeaturedProducts } from "../components/featured-products";
import { toApiSort } from "../sorts";

let catalog = createMockCatalog(seedMockCatalog());

beforeEach(() => {
  catalog = createMockCatalog(seedMockCatalog());
  signIn();
  fakeBackend({ catalog });
});
afterEach(() => {
  vi.restoreAllMocks();
  signOut();
});

const card = async (title: string) => await screen.findByRole("link", { name: new RegExp(title) });

describe("CatalogScreen", () => {
  it("lists a page of products with the customer's price and the stock indicator", async () => {
    renderWithProviders(<CatalogScreen />);

    const cup = await card("Ly giấy 2 lớp 8oz");
    expect(cup).toHaveAttribute("href", "/catalog/products/ly-giay-2-lop-8oz");
    // The lowest unit price over the SKUs' tiers: 720 (the 5.000+ tier of the white cup).
    await waitFor(() => expect(within(cup).getByText(/720/)).toBeInTheDocument());
    expect(within(cup).getByText("Từ")).toBeInTheDocument();
    // White cup is IN_STOCK, kraft is LOW_STOCK: a product is as available as its best variant.
    expect(within(cup).getByText("Còn hàng")).toBeInTheDocument();
    expect(
      await within(await card("Ly nhựa PET 500ml")).findByText("Hết hàng"),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(12);
    expect(screen.getByText("Trang 1 / 2")).toBeInTheDocument();
  });

  it("asks the BE for page 0 of 12, then for stock and prices once, for every SKU on the page", async () => {
    renderWithProviders(<CatalogScreen />);
    await card("Ly giấy 2 lớp 8oz");

    expect(api.get).toHaveBeenCalledWith(
      "/catalog/products",
      expect.objectContaining({ params: { q: undefined, sort: undefined, page: 0, size: 12 } }),
    );
    await waitFor(() => {
      const stockCalls = vi
        .mocked(api.get)
        .mock.calls.filter(([url]) => url === "/catalog/products/availability");
      const priceCalls = vi
        .mocked(api.get)
        .mock.calls.filter(([url]) => url === "/catalog/products/prices");
      expect(stockCalls).toHaveLength(1);
      expect(priceCalls).toHaveLength(1);
      const skus = (stockCalls[0]?.[1]?.params as { sku: string[] }).sku;
      expect(skus).toContain("CUP-PAPER-8OZ-WHT");
      expect(skus.length).toBeGreaterThan(12);
    });
  });

  it("shows no price for a product the customer has no price for, but still lists it", async () => {
    renderWithProviders(<CatalogScreen />);
    const custom = await card("Ly giấy in logo");
    await waitFor(() => expect(within(custom).getByText("Còn hàng")).toBeInTheDocument());
    expect(within(custom).queryByText("Từ")).not.toBeInTheDocument();
  });

  it("lists a product whose detail the BE refuses for want of a price, with no price and no error", async () => {
    renderWithProviders(<CatalogScreen />, { searchParams: "?q=kraft" });
    const cup = await card("Ly giấy kraft 16oz");
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        "/catalog/products/ly-giay-kraft-16oz",
        expect.anything(),
      ),
    );
    expect(within(cup).queryByText("Từ")).not.toBeInTheDocument();
    expect(within(cup).queryByText(/₫/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Chưa hiển thị được giá/)).not.toBeInTheDocument();
  });

  it("asks a visitor to sign in and calls nothing", async () => {
    signOut();
    renderWithProviders(<CatalogScreen />);
    expect(await screen.findByText("Đăng nhập để xem sản phẩm")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Đăng nhập" })).toHaveAttribute("href", "/login");
    expect(api.get).not.toHaveBeenCalled();
  });

  it("searches through the URL and says how many products matched", async () => {
    renderWithProviders(<CatalogScreen />, { searchParams: "?q=hoodie" });
    expect(await card("Áo hoodie Essential")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText(/sản phẩm phù hợp/)).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith(
      "/catalog/products",
      expect.objectContaining({ params: expect.objectContaining({ q: "hoodie" }) }),
    );
  });

  it("explains an empty search and clears it", async () => {
    const onUrlUpdate = vi.fn<OnUrlUpdateFunction>();
    renderWithProviders(<CatalogScreen />, { searchParams: "?q=zzzz", onUrlUpdate });

    expect(await screen.findByText("Không tìm thấy sản phẩm phù hợp")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Xoá tìm kiếm" }));
    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalled());
    expect(onUrlUpdate.mock.calls.at(-1)?.[0].searchParams.get("q")).toBeNull();
  });

  it("says the catalogue is empty when it is, not that a search failed", async () => {
    catalog = createMockCatalog([]);
    vi.restoreAllMocks();
    fakeBackend({ catalog });
    renderWithProviders(<CatalogScreen />);
    expect(await screen.findByText("Chưa có sản phẩm nào")).toBeInTheDocument();
  });

  it("moves to the next page through the URL and asks the BE for page 1 (0-based)", async () => {
    const onUrlUpdate = vi.fn<OnUrlUpdateFunction>();
    renderWithProviders(<CatalogScreen />, { onUrlUpdate });

    await userEvent.click(await screen.findByRole("button", { name: "Trang sau" }));

    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalled());
    expect(onUrlUpdate.mock.calls.at(-1)?.[0].searchParams.get("page")).toBe("2");
    expect(await screen.findByText("Trang 2 / 2")).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith(
      "/catalog/products",
      expect.objectContaining({ params: expect.objectContaining({ page: 1, size: 12 }) }),
    );
  });

  it("brings an out-of-range ?page back to the last page", async () => {
    const onUrlUpdate = vi.fn<OnUrlUpdateFunction>();
    renderWithProviders(<CatalogScreen />, { searchParams: "?page=9", onUrlUpdate });
    expect(await screen.findByText("Trang 2 / 2")).toBeInTheDocument();
    expect(onUrlUpdate.mock.calls.at(-1)?.[0].searchParams.get("page")).toBe("2");
  });

  it("sends only a sort the BE accepts, whatever the URL says", async () => {
    const { unmount } = renderWithProviders(<CatalogScreen />, { searchParams: "?sort=title" });
    await card("Ly giấy 2 lớp 8oz");
    expect(
      vi.mocked(api.get).mock.calls.find(([url]) => url === "/catalog/products")?.[1],
    ).toMatchObject({
      params: { sort: "title" },
    });
    unmount();
    vi.mocked(api.get).mockClear();

    renderWithProviders(<CatalogScreen />, { searchParams: "?sort=price" });
    await card("Ly giấy 2 lớp 8oz");
    expect(
      vi.mocked(api.get).mock.calls.find(([url]) => url === "/catalog/products")?.[1],
    ).toMatchObject({
      params: { sort: undefined },
    });
  });

  it("keeps the products but says so when stock and prices are refused (a staff token: 403)", async () => {
    const real = vi.mocked(api.get).getMockImplementation()!;
    vi.mocked(api.get).mockImplementation(async (url, config) => {
      if (url === "/catalog/products/availability" || url === "/catalog/products/prices") {
        throw new ApiError(403, "FORBIDDEN", "Not authorised");
      }
      return real(url, config);
    });
    renderWithProviders(<CatalogScreen />);

    const cup = await card("Ly giấy 2 lớp 8oz");
    expect(await screen.findByText(/Chưa hiển thị được giá và tồn kho/)).toBeInTheDocument();
    expect(screen.getByText(/Chỉ tài khoản khách hàng/)).toBeInTheDocument();
    expect(within(cup).queryByText("Từ")).not.toBeInTheDocument();
  });

  it("reports a failed list in Vietnamese with the correlation id, and a retry that recovers", async () => {
    // A 4xx is not retried by the query, so the failure shows at once.
    vi.mocked(api.get).mockRejectedValueOnce(
      new ApiError(429, "RATE_LIMITED", "Too many requests", undefined, "corr-1"),
    );
    renderWithProviders(<CatalogScreen />);

    expect(
      await screen.findByText(/Bạn thao tác quá nhanh.*Mã tra cứu: corr-1/),
    ).toBeInTheDocument();
    expect(screen.queryByText("Too many requests")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Thử lại/ }));
    expect(await card("Ly giấy 2 lớp 8oz")).toBeInTheDocument();
  });

  it("hides a product that was unpublished after the list was built (detail answers 404)", async () => {
    const real = vi.mocked(api.get).getMockImplementation()!;
    vi.mocked(api.get).mockImplementation(async (url, config) => {
      if (url === "/catalog/products/tui-canvas") throw new ApiError(404, "NOT_FOUND", "gone");
      return real(url, config);
    });
    renderWithProviders(<CatalogScreen />, { searchParams: "?q=canvas" });

    await screen.findByText(/sản phẩm phù hợp/);
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith("/catalog/products/tui-canvas", expect.anything()),
    );
    await waitFor(() =>
      expect(screen.queryByRole("link", { name: /Túi canvas/ })).not.toBeInTheDocument(),
    );
  });
});

describe("sort", () => {
  it("sends nothing for the default, so the BE picks relevance or newest itself", () => {
    expect(toApiSort("default")).toBeUndefined();
    expect(toApiSort("title")).toBe("title");
  });
});

describe("FeaturedProducts (home)", () => {
  it("shows the four newest products", async () => {
    renderWithProviders(<FeaturedProducts />);
    expect(await screen.findByRole("heading", { name: "Sản phẩm mới" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(4));
    expect(api.get).toHaveBeenCalledWith(
      "/catalog/products",
      expect.objectContaining({ params: expect.objectContaining({ sort: "newest", size: 4 }) }),
    );
  });

  it("invites a visitor to sign in instead of listing", async () => {
    signOut();
    renderWithProviders(<FeaturedProducts />);
    expect(await screen.findByText("Đăng nhập để xem sản phẩm")).toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });

  it("shows nothing when the catalogue is empty", async () => {
    vi.restoreAllMocks();
    fakeBackend({ catalog: createMockCatalog([]) });
    const { container } = renderWithProviders(<FeaturedProducts />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
