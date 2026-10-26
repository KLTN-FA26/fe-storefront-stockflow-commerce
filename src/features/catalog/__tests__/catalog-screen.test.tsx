import { renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { OnUrlUpdateFunction } from "nuqs/adapters/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { createMockCatalog, seedMockCatalog } from "@/lib/api/mock-fixtures/catalog";
import { fakeBackend } from "@/test/fake-backend";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { CatalogScreen } from "../components/catalog-screen";
import { useCurrentSearch } from "../current-search-store";
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

/** A BE that predates the card fields: list rows carry the title and slug only. */
function stripCardFields() {
  const real = vi.mocked(api.get).getMockImplementation()!;
  vi.mocked(api.get).mockImplementation(async (url, config) => {
    const answer = (await real(url, config)) as { data: unknown };
    if (url !== "/catalog/products") return answer as never;
    const page = answer.data as { items: Array<Record<string, unknown>> };
    return {
      data: {
        ...page,
        items: page.items.map(({ primaryImageUrl: _i, skus: _s, ...row }) => row),
      },
    } as never;
  });
}

const callsTo = (url: string) => vi.mocked(api.get).mock.calls.filter(([u]) => u === url);
const detailAndGalleryCalls = () =>
  vi
    .mocked(api.get)
    .mock.calls.filter(([url]) => /^\/catalog\/products\/[^/]+(\/gallery)?$/.test(String(url)))
    .filter(([url]) => !/\/(availability|prices)$/.test(String(url)));

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

  it("makes one list call, one stock call and one price call for a whole page: no detail, no gallery", async () => {
    renderWithProviders(<CatalogScreen />);
    const cup = await card("Ly giấy 2 lớp 8oz");
    await waitFor(() => expect(within(cup).getByText(/720/)).toBeInTheDocument());

    expect(callsTo("/catalog/products")).toHaveLength(1);
    expect(callsTo("/catalog/products/availability")).toHaveLength(1);
    expect(callsTo("/catalog/products/prices")).toHaveLength(1);
    expect(detailAndGalleryCalls()).toHaveLength(0);
    // The picture comes from the row's primaryImageUrl.
    expect(within(cup).getByRole("img")).toHaveAttribute("src", expect.stringContaining("logo"));
  });

  it("falls back to one detail and one gallery per card when the rows carry no card fields", async () => {
    stripCardFields();
    renderWithProviders(<CatalogScreen />);
    const cup = await card("Ly giấy 2 lớp 8oz");
    await waitFor(() => expect(within(cup).getByText(/720/)).toBeInTheDocument());

    expect(callsTo("/catalog/products")).toHaveLength(1);
    expect(detailAndGalleryCalls().length).toBeGreaterThanOrEqual(24); // 12 details + 12 galleries
    expect(callsTo("/catalog/products/availability")).toHaveLength(1);
    expect(callsTo("/catalog/products/prices")).toHaveLength(1);
    expect(within(cup).getByRole("img")).toBeInTheDocument();
  });

  it("shows a card for a product with no image without asking for a gallery", async () => {
    const real = vi.mocked(api.get).getMockImplementation()!;
    vi.mocked(api.get).mockImplementation(async (url, config) => {
      const answer = (await real(url, config)) as { data: unknown };
      if (url !== "/catalog/products") return answer as never;
      const page = answer.data as { items: Array<Record<string, unknown>> };
      return {
        data: {
          ...page,
          items: page.items.map(({ primaryImageUrl: _i, ...row }) => row),
        },
      } as never;
    });
    renderWithProviders(<CatalogScreen />);
    const cup = await card("Ly giấy 2 lớp 8oz");
    await waitFor(() => expect(within(cup).getByText(/720/)).toBeInTheDocument());
    expect(detailAndGalleryCalls()).toHaveLength(0);
    expect(within(cup).queryByRole("img")).not.toBeInTheDocument();
  });

  it("shows no price for a product the customer has no price for, but still lists it", async () => {
    renderWithProviders(<CatalogScreen />);
    const custom = await card("Ly giấy in logo");
    await waitFor(() => expect(within(custom).getByText("Còn hàng")).toBeInTheDocument());
    expect(within(custom).queryByText("Từ")).not.toBeInTheDocument();
  });

  it("lists a product whose detail the BE would refuse for want of a price, with no price and no error", async () => {
    renderWithProviders(<CatalogScreen />, { searchParams: "?q=kraft" });
    const cup = await card("Ly giấy kraft 16oz");
    // The row carries its SKUs, so the stock is asked for without ever opening the (refused) detail.
    await waitFor(() => expect(within(cup).getByText("Còn hàng")).toBeInTheDocument());
    expect(api.get).not.toHaveBeenCalledWith(
      "/catalog/products/ly-giay-kraft-16oz",
      expect.anything(),
    );
    expect(within(cup).queryByText("Từ")).not.toBeInTheDocument();
    expect(within(cup).queryByText(/₫/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Chưa hiển thị được giá/)).not.toBeInTheDocument();
  });

  it("asks a visitor to sign in and calls nothing", async () => {
    signOut();
    renderWithProviders(<CatalogScreen />);
    expect(await screen.findByText("Đăng nhập để xem sản phẩm")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Đăng nhập" })).toHaveAttribute(
      "href",
      "/login?next=%2Fcatalog",
    );
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

  it("hides a product that was unpublished after the list was built (fallback: detail answers 404)", async () => {
    stripCardFields();
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

describe("CatalogScreen on /search (SCRUM-469)", () => {
  const listCalls = () =>
    vi.mocked(api.get).mock.calls.filter(([url]) => url === "/catalog/products");

  it("asks for a search text instead of listing the whole catalogue", async () => {
    renderWithProviders(<CatalogScreen scope="search" />);
    expect(await screen.findByText("Nhập từ khoá để tìm sản phẩm")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Xem tất cả sản phẩm" })).toHaveAttribute(
      "href",
      "/catalog",
    );
    expect(listCalls()).toHaveLength(0);
  });

  it("signs a visitor in and brings them back to the same search", async () => {
    signOut();
    renderWithProviders(<CatalogScreen scope="search" />, {
      searchParams: "?q=h%E1%BB%99p%20pizza&sort=title",
    });
    const href = screen.getByRole("link", { name: "Đăng nhập" }).getAttribute("href") ?? "";
    const next = new URL(href, "http://shop.test").searchParams.get("next");
    expect(new URL(next ?? "", "http://shop.test")).toMatchObject({
      pathname: "/search",
      search: "?q=h%E1%BB%99p+pizza&sort=title",
    });
    expect(listCalls()).toHaveLength(0);
  });

  it("tells the header box what it shows, and forgets it when left", async () => {
    const header = renderHook(() => useCurrentSearch());
    const { unmount } = renderWithProviders(<CatalogScreen scope="search" />, {
      searchParams: "?q=hoodie&sort=title",
    });
    await waitFor(() => expect(header.result.current).toEqual({ q: "hoodie", sort: "title" }));
    unmount();
    await waitFor(() => expect(header.result.current).toBeUndefined());
  });

  it("tells the header only a sort it accepts, never one the BE would refuse", async () => {
    const header = renderHook(() => useCurrentSearch());
    renderWithProviders(<CatalogScreen scope="search" />, { searchParams: "?q=ly&sort=price" });
    await waitFor(() => expect(header.result.current).toEqual({ q: "ly", sort: undefined }));
  });

  it("brings a visitor back to the same catalogue page after signing in", () => {
    signOut();
    renderWithProviders(<CatalogScreen />, { searchParams: "?page=3&sort=title" });
    expect(screen.getByRole("link", { name: "Đăng nhập" })).toHaveAttribute(
      "href",
      "/login?next=%2Fcatalog%3Fsort%3Dtitle%26page%3D3",
    );
  });

  it("tells the header nothing from the plain catalogue", async () => {
    const header = renderHook(() => useCurrentSearch());
    renderWithProviders(<CatalogScreen />);
    expect(await card("Ly giấy 2 lớp 8oz")).toBeInTheDocument();
    expect(header.result.current).toBeUndefined();
  });

  it("treats a blank q as no search text", async () => {
    renderWithProviders(<CatalogScreen scope="search" />, { searchParams: "?q=%20%20" });
    expect(await screen.findByText("Nhập từ khoá để tìm sản phẩm")).toBeInTheDocument();
    expect(listCalls()).toHaveLength(0);
  });

  it("lists the products matching q", async () => {
    renderWithProviders(<CatalogScreen scope="search" />, { searchParams: "?q=hoodie" });
    expect(await card("Áo hoodie Essential")).toBeInTheDocument();
    expect(listCalls()[0]?.[1]).toMatchObject({ params: { q: "hoodie" } });
  });

  it("explains an empty result, and clearing it goes back to the prompt", async () => {
    renderWithProviders(<CatalogScreen scope="search" />, { searchParams: "?q=zzzz" });
    expect(await screen.findByText("Không tìm thấy sản phẩm phù hợp")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Xoá tìm kiếm" }));
    expect(await screen.findByText("Nhập từ khoá để tìm sản phẩm")).toBeInTheDocument();
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
