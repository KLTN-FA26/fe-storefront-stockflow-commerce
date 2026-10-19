import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { api } from "@/lib/api/client";
import { getAvailability, getPrices } from "@/lib/catalog/api";

import { getCatalogGallery, getCatalogPage, getCatalogProduct, getSearchSuggestions } from "../api";
import { beGallery, bePage, beProduct, beSchedule } from "./fixtures";

afterEach(() => vi.restoreAllMocks());

describe("catalogue API (BE StorefrontCatalogController / CatalogSearchController)", () => {
  it("lists /catalog/products with the BE's 0-based page and without empty filters", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValueOnce({ data: bePage({ page: 2 }) });

    const page = await getCatalogPage({ page: 3, size: 12 });

    expect(get).toHaveBeenCalledWith("/catalog/products", {
      params: { q: undefined, sort: undefined, page: 2, size: 12 },
    });
    expect(page.page).toBe(3);
  });

  it("sends the trimmed search text and the sort", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValueOnce({ data: bePage() });
    await getCatalogPage({ q: "  ly giấy ", sort: "title", page: 1, size: 12 });
    expect(get.mock.calls[0]?.[1]).toMatchObject({
      params: { q: "ly giấy", sort: "title", page: 0, size: 12 },
    });
  });

  it("never sends a negative page, and refuses text the BE would refuse without calling it", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: bePage() });
    await getCatalogPage({ page: 0, size: 12 });
    expect(get.mock.calls[0]?.[1]).toMatchObject({ params: { page: 0 } });

    await expect(getCatalogPage({ q: "x".repeat(101), page: 1, size: 12 })).rejects.toBeInstanceOf(
      z.ZodError,
    );
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("reads one product by slug, encoding it", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValueOnce({ data: beProduct });
    await expect(getCatalogProduct("ly giấy/8oz")).resolves.toMatchObject({ slug: beProduct.slug });
    expect(get).toHaveBeenCalledWith("/catalog/products/ly%20gi%E1%BA%A5y%2F8oz", {});
  });

  it("reads the gallery of a product", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValueOnce({ data: beGallery });
    const gallery = await getCatalogGallery("ly-giay");
    expect(get).toHaveBeenCalledWith("/catalog/products/ly-giay/gallery", {});
    expect(gallery.images).toHaveLength(2);
  });

  it("rejects with a ZodError when the BE breaks the contract", async () => {
    vi.spyOn(api, "get").mockResolvedValueOnce({
      data: { ...beProduct, variants: [{ sku: "A" }] },
    });
    await expect(getCatalogProduct("ly-giay")).rejects.toBeInstanceOf(z.ZodError);
  });

  it("asks suggestions only for 2 characters or more", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValueOnce({ data: [] });
    await expect(getSearchSuggestions("l")).rejects.toBeInstanceOf(z.ZodError);
    expect(get).not.toHaveBeenCalled();
    await getSearchSuggestions(" ly ");
    expect(get).toHaveBeenCalledWith("/catalog/search/suggestions", { params: { q: "ly" } });
  });
});

describe("stock and price reads (BE CatalogController)", () => {
  it("repeats `sku` the way Spring binds a List, not as sku[]", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValueOnce({ data: [] });
    await getAvailability(["cup-1", "CUP-2", "cup-1"]);

    const config = get.mock.calls[0]?.[1];
    expect(get.mock.calls[0]?.[0]).toBe("/catalog/products/availability");
    // What axios really puts on the wire for this config.
    expect(api.getUri({ url: "/catalog/products/availability", ...config })).toBe(
      "/api/catalog/products/availability?sku=CUP-1&sku=CUP-2",
    );
  });

  it("reads prices the same way and parses the schedules", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValueOnce({ data: [beSchedule] });
    const prices = await getPrices(["CUP-PAPER-8OZ-WHT"]);
    expect(api.getUri({ url: "/catalog/products/prices", ...get.mock.calls[0]?.[1] })).toBe(
      "/api/catalog/products/prices?sku=CUP-PAPER-8OZ-WHT",
    );
    expect(prices[0]).toMatchObject({ moq: 1000, source: "CUSTOMER" });
  });

  it("splits more than 50 SKUs into calls of at most 50 (BE maxSkusPerRequest) and joins the answers", async () => {
    const skus = Array.from({ length: 120 }, (_, i) => `SKU-${i}`);
    const get = vi.spyOn(api, "get").mockImplementation(async (_url, config) => {
      const asked = (config?.params as { sku: string[] }).sku;
      return { data: asked.map((sku) => ({ sku, availability: "IN_STOCK" })) };
    });

    const result = await getAvailability(skus);

    expect(get).toHaveBeenCalledTimes(3);
    expect(
      get.mock.calls.map(([, config]) => (config?.params as { sku: string[] }).sku.length),
    ).toEqual([50, 50, 20]);
    expect(result).toHaveLength(120);
  });

  it("asks nothing for no SKUs and refuses a malformed one without calling the BE", async () => {
    const get = vi.spyOn(api, "get");
    await expect(getAvailability([])).resolves.toEqual([]);
    await expect(getPrices(["has space"])).rejects.toBeInstanceOf(z.ZodError);
    expect(get).not.toHaveBeenCalled();
  });
});
