import { describe, expect, it } from "vitest";

import { availabilityOf, createMockCatalog, seedMockCatalog, type MockResult } from "./catalog";
import { MOCK_DESIGN_TEMPLATES } from "./design-templates";

const catalog = () => createMockCatalog(seedMockCatalog());
const dataOf = (result: MockResult) => (result.data as { data: unknown }).data;
interface Card {
  slug: string;
  title: string;
}
interface Page {
  items: Card[];
  page: number;
  totalElements: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}
const pageOf = (result: MockResult) => dataOf(result) as Page;

describe("mock catalogue mirrors the BE catalogue rules", () => {
  it("pages zero-based and lists more than one page of 12", () => {
    const first = pageOf(catalog().list({ page: 0, size: 12 }));
    expect(first).toMatchObject({ page: 0, hasNext: true, hasPrevious: false, totalPages: 2 });
    expect(first.items).toHaveLength(12);
    const second = pageOf(catalog().list({ page: "1", size: "12" }));
    expect(second).toMatchObject({ hasNext: false, hasPrevious: true });
    expect(second.items.length).toBeGreaterThan(0);
  });

  it("answers 400 UNSUPPORTED_PARAMETER for a bad page, size or sort (price included)", () => {
    expect(catalog().list({ page: -1 }).status).toBe(400);
    expect(catalog().list({ size: 0 }).status).toBe(400);
    expect(catalog().list({ size: 201 }).status).toBe(400);
    expect(catalog().list({ sort: "price" })).toMatchObject({
      status: 400,
      data: { errorCode: "UNSUPPORTED_PARAMETER" },
    });
  });

  it("answers 400 VALIDATION_FAILED for search text over 100 characters", () => {
    expect(catalog().list({ q: "x".repeat(101) })).toMatchObject({
      status: 400,
      data: { errorCode: "VALIDATION_FAILED" },
    });
  });

  it("searches titles and SKUs ignoring case and diacritics", () => {
    expect(pageOf(catalog().list({ q: "LY GIAY" })).items.map((c) => c.slug)).toContain(
      "ly-giay-2-lop-8oz",
    );
    expect(pageOf(catalog().list({ q: "hoodie-ess" })).items.map((c) => c.slug)).toEqual([
      "ao-hoodie-essential",
    ]);
    expect(pageOf(catalog().list({ q: "zzzz-nothing" })).totalElements).toBe(0);
  });

  it("sorts by title when asked", () => {
    const titles = pageOf(catalog().list({ sort: "title", size: 200 })).items.map((c) => c.title);
    expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b, "vi")));
  });

  it("omits what the BE omits: no seoTitle on a card, no null anywhere", () => {
    const card = pageOf(catalog().list({ size: 1 })).items[0]!;
    expect(card).not.toHaveProperty("seoTitle");
    expect(JSON.stringify(catalog().detail("ly-giay-2-lop-8oz").data)).not.toContain("null");
  });

  it("detail knows only IN_STOCK / OUT_OF_STOCK; /availability adds LOW_STOCK (≤ 5 units)", () => {
    const detail = dataOf(catalog().detail("ly-giay-2-lop-8oz")) as {
      variants: Array<{ sku: string; availability: string }>;
    };
    expect(detail.variants.map((v) => v.availability)).toEqual(["IN_STOCK", "IN_STOCK"]);
    expect(dataOf(catalog().availability(["CUP-PAPER-8OZ-WHT", "CUP-PAPER-8OZ-KRAFT"]))).toEqual([
      { sku: "CUP-PAPER-8OZ-WHT", availability: "IN_STOCK" },
      { sku: "CUP-PAPER-8OZ-KRAFT", availability: "LOW_STOCK" },
    ]);
    expect(availabilityOf(0)).toBe("OUT_OF_STOCK");
    expect(availabilityOf(5)).toBe("LOW_STOCK");
    expect(availabilityOf(6)).toBe("IN_STOCK");
  });

  it("answers an unknown SKU as OUT_OF_STOCK, upper-cases and de-duplicates, keeps the order asked", () => {
    expect(dataOf(catalog().availability(["nope-1", "CUP-PET-500ML", "NOPE-1"]))).toEqual([
      { sku: "NOPE-1", availability: "OUT_OF_STOCK" },
      { sku: "CUP-PET-500ML", availability: "OUT_OF_STOCK" },
    ]);
  });

  it("refuses no SKU, a malformed one, and more than 50", () => {
    expect(catalog().availability(undefined).status).toBe(400);
    expect(catalog().availability(["bad sku"]).status).toBe(400);
    expect(catalog().availability(Array.from({ length: 51 }, (_, i) => `S${i}`)).status).toBe(400);
    expect(catalog().prices([]).status).toBe(400);
  });

  it("prices with tiers and the MOQ, and leaves out a SKU with no price (it cannot be ordered either)", () => {
    const prices = dataOf(
      catalog().prices(["CUP-PAPER-8OZ-WHT", "CUP-CUSTOM-LOGO", "NOPE"]),
    ) as Array<{
      sku: string;
      moq: number;
      tiers: unknown[];
    }>;
    expect(prices.map((p) => p.sku)).toEqual(["CUP-PAPER-8OZ-WHT"]);
    expect(prices[0]).toMatchObject({ moq: 1000, source: "CUSTOMER" });
    expect(prices[0]?.tiers).toHaveLength(2);
  });

  it("gives an unknown slug 404 NOT_FOUND on the detail and the gallery", () => {
    expect(catalog().detail("nope")).toMatchObject({
      status: 404,
      data: { errorCode: "NOT_FOUND" },
    });
    expect(catalog().gallery("nope").status).toBe(404);
  });

  it("completes only 2 or more letters or digits, at most `limit` results", () => {
    expect(catalog().suggestions({ q: "l" }).status).toBe(400);
    expect(catalog().suggestions({ q: "ly", limit: 11 }).status).toBe(400);
    const found = dataOf(catalog().suggestions({ q: "cup-paper-12", limit: 3 })) as Array<{
      slug: string;
      sku: string;
    }>;
    expect(found[0]).toMatchObject({ slug: "ly-giay-2-lop-12oz", sku: "CUP-PAPER-12OZ-WHT" });
  });

  it("refuses a completion text over 100 characters like the BE: 400 VALIDATION_FAILED on q", () => {
    expect(catalog().suggestions({ q: "a".repeat(100) }).status).toBe(200);
    expect(catalog().suggestions({ q: "a".repeat(101) })).toMatchObject({
      status: 400,
      data: { errorCode: "VALIDATION_FAILED", fieldErrors: [{ field: "q" }] },
    });
  });

  it("allows 30 completions per 10 s, then answers 429 RATE_LIMITED with Retry-After", () => {
    let now = 0;
    const c = createMockCatalog(seedMockCatalog(), { now: () => now });
    for (let i = 0; i < 30; i++) expect(c.suggestions({ q: "ly" }).status).toBe(200);

    const limited = c.suggestions({ q: "ly" });
    expect(limited).toMatchObject({
      status: 429,
      data: { success: false, errorCode: "RATE_LIMITED" },
      headers: { "Retry-After": "1" },
    });
    // A refused call is counted too, as on the BE (the limiter runs before validation).
    expect(c.suggestions({ q: "l" }).status).toBe(429);

    now += 1000; // the bucket refills 3 calls per second
    expect(c.suggestions({ q: "ly" }).status).toBe(200);
  });

  it("prices checkout on the SKU's total quantity and holds stock all or nothing", () => {
    const c = catalog();
    expect(c.checkoutPrice("CUP-PAPER-8OZ-WHT", 999)).toEqual({ error: "BELOW_MOQ" });
    expect(c.checkoutPrice("CUP-PAPER-8OZ-WHT", 1000)).toEqual({ price: 780 });
    expect(c.checkoutPrice("CUP-PAPER-8OZ-WHT", 5000)).toEqual({ price: 720 });
    expect(c.checkoutPrice("CUP-CUSTOM-LOGO", 10)).toEqual({ error: "NO_PRICE" });
    expect(c.checkoutPrice("NOPE", 1)).toEqual({ error: "NOT_PURCHASABLE" });
    expect(c.reserve("CUP-PAPER-8OZ-KRAFT", 4)).toBe(false);
    expect(c.stockOf("CUP-PAPER-8OZ-KRAFT")).toBe(3);
    expect(c.reserve("CUP-PAPER-8OZ-KRAFT", 3)).toBe(true);
    expect(c.stockOf("CUP-PAPER-8OZ-KRAFT")).toBe(0);
  });
});

describe("mock catalogue tells customizable products from standard ones", () => {
  const CUSTOMIZABLE = [
    "ly-giay-2-lop-8oz",
    "ly-giay-2-lop-12oz",
    "ly-nhua-pet-500ml",
    "ly-giay-in-logo",
    "tui-giay-kraft",
    "ly-giay-kraft-16oz",
  ];

  it("sends `kind` on the detail", () => {
    expect(dataOf(catalog().detail("tui-giay-kraft"))).toMatchObject({ kind: "CUSTOMIZABLE" });
    expect(dataOf(catalog().detail("nap-ly-90mm"))).toMatchObject({ kind: "STANDARD" });
  });

  it("sends `kind` on every list card", () => {
    const cards = pageOf(catalog().list({ size: 200 })).items as Array<Card & { kind?: string }>;
    expect(cards.every((card) => card.kind === "STANDARD" || card.kind === "CUSTOMIZABLE")).toBe(
      true,
    );
    expect(
      cards
        .filter((c) => c.kind === "CUSTOMIZABLE")
        .map((c) => c.slug)
        .sort(),
    ).toEqual([...CUSTOMIZABLE].sort());
  });

  it("answers the design backend per slug: product id, kind and every SKU, even without a price", () => {
    const c = catalog();
    const bag = seedMockCatalog().find((p) => p.slug === "tui-giay-kraft")!;
    expect(c.kindOf("tui-giay-kraft")).toEqual({
      productId: bag.productId,
      kind: "CUSTOMIZABLE",
      skus: ["BAG-KRAFT-M", "BAG-KRAFT-L"],
    });
    // The detail of this product is 409 PRICE_NOT_AVAILABLE, but it is still customizable.
    expect(c.detail("ly-giay-kraft-16oz").status).toBe(409);
    expect(c.kindOf("ly-giay-kraft-16oz")).toMatchObject({ kind: "CUSTOMIZABLE" });
    expect(c.kindOf("nap-ly-90mm")).toMatchObject({ kind: "STANDARD", skus: ["LID-90MM-BLK"] });
    expect(c.kindOf("khong-ton-tai")).toBeUndefined();
  });

  it("is CUSTOMIZABLE exactly where a SKU has a design template", () => {
    const c = catalog();
    for (const product of seedMockCatalog()) {
      const hasTemplate = product.variants.some((v) => v.sku in MOCK_DESIGN_TEMPLATES);
      expect(c.kindOf(product.slug)?.kind, product.slug).toBe(
        hasTemplate ? "CUSTOMIZABLE" : "STANDARD",
      );
    }
  });
});
