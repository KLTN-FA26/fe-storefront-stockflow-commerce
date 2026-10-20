import { beforeEach, describe, expect, it, vi } from "vitest";

import LegacyProductPage from "../[slug]/page";
import CatalogProductsIndex from "../products/page";

const redirect = vi.hoisted(() =>
  vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
);
vi.mock("next/navigation", () => ({ redirect }));

beforeEach(() => {
  redirect.mockClear();
});

describe("old catalogue URLs", () => {
  it("sends /catalog/{slug} to the product page at /catalog/products/{slug}", async () => {
    await expect(
      LegacyProductPage({ params: Promise.resolve({ slug: "ly-giay-2-lop-8oz" }) }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/catalog/products/ly-giay-2-lop-8oz");
  });

  it("keeps a percent-encoded slug as it came", async () => {
    await expect(
      LegacyProductPage({ params: Promise.resolve({ slug: "h%E1%BB%99p-pizza" }) }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/catalog/products/h%E1%BB%99p-pizza");
  });

  it("sends the bare /catalog/products to the catalogue", () => {
    expect(() => CatalogProductsIndex()).toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/catalog");
  });
});
