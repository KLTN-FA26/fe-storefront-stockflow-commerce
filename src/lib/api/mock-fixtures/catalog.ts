/**
 * In-memory B2B catalogue that mirrors the BE contract, for USE_MOCK=true and tests.
 *
 * Shapes follow `CatalogCardResponse`, `CatalogProductResponse`, `CatalogGalleryResponse`,
 * `SearchSuggestionResponse`, `SkuAvailabilityResponse` and `PriceScheduleResponse`; rules follow
 * `StorefrontCatalogController`, `CatalogController`, `CatalogSearchController` and
 * `CatalogSearchService` (develop):
 *  - list/search: zero-based pages, sort relevance|newest|title (price is UNSUPPORTED_PARAMETER),
 *    q over 100 characters (code points, after trim) is VALIDATION_FAILED;
 *  - suggestions: limit 1..10, the same q bound, then 2 letters or digits; 30 calls per 10 s per
 *    caller (token bucket, 3 back per second), past that 429 RATE_LIMITED with Retry-After, a
 *    refused call counting too (the BE limiter runs before validation);
 *  - the detail knows only IN_STOCK / OUT_OF_STOCK; /availability adds LOW_STOCK (≤ 5 units);
 *  - /prices leaves out a SKU with no price (it cannot be ordered either);
 *  - a product with a variant that has no base price has no readable detail: 409 PRICE_NOT_AVAILABLE;
 *  - an unknown slug is 404 NOT_FOUND; unknown SKUs are OUT_OF_STOCK in /availability;
 *  - every call needs a signed-in caller; availability and prices need a CUSTOMER (mock: always);
 *  - `kind` (STANDARD | CUSTOMIZABLE) on the detail and the list card is proposed (spec 2026-10-25
 *    §7.2 P2): the BE's responses do not carry it yet; `kindOf` is what the design mock asks.
 * NON_NULL serialisation: absent optional fields are omitted, never sent as null.
 * Intentionally independent from mock-data.ts (legacy, non-BE shapes).
 */

export interface MockPriceTier {
  minQuantity: number;
  unitPrice: number;
}

export interface MockVariant {
  sku: string;
  /** Units available to promise. */
  stock: number;
  /** The customer's price list; absent = no price (left out of /prices). */
  tiers?: MockPriceTier[];
  source?: "CUSTOMER" | "SEGMENT" | "BASE";
  /** The listing's own price shown by the detail; absent = no base price (the detail answers 409). */
  listPrice?: number;
}

/** BE `product.products.kind`: a CUSTOMIZABLE product's variants carry design templates. */
export type MockProductKind = "STANDARD" | "CUSTOMIZABLE";

export interface MockProduct {
  productId: string;
  slug: string;
  title: string;
  kind: MockProductKind;
  description?: string;
  seoTitle?: string;
  /** Position in the "newest" order: higher = listed more recently. */
  listedOrder: number;
  /** Not published: invisible everywhere. */
  published?: boolean;
  variants: MockVariant[];
  /** Pictures keyed by SKU; the first is the primary image. */
  images: Array<{ sku?: string; url: string; altText?: string; primary?: boolean }>;
}

export interface MockResult {
  status: number;
  data: unknown;
  headers?: Record<string, string>;
}

export const LOW_STOCK_THRESHOLD = 5; // BE stockflow.catalog.availability.low-stock-threshold
export const MAX_SKUS_PER_REQUEST = 50;
const MAX_PAGE_SIZE = 200;
const MAX_QUERY = 100;
// BE @RateLimit(limit = 30, perSeconds = 10, key = USER) on CatalogSearchController.suggestions
const SUGGESTION_BUDGET = 30;
const SUGGESTION_REFILL_MS = 10_000 / SUGGESTION_BUDGET;

/** BE SearchQueryNormalizer bound: trimmed text, counted in code points. */
const tooLong = (q: string) => [...q.trim()].length > MAX_QUERY;
const queryTooLong = () =>
  fail(400, "VALIDATION_FAILED", "Search text must be at most 100 characters", [
    { field: "q", message: "must be at most 100 characters" },
  ]);

const ok = (data: unknown): MockResult => ({
  status: 200,
  data: { success: true, data, timestamp: new Date().toISOString() },
});

const fail = (
  status: number,
  errorCode: string,
  message: string,
  fieldErrors?: Array<{ field: string; message: string }>,
): MockResult => ({
  status,
  data: {
    success: false,
    errorCode,
    message,
    ...(fieldErrors ? { fieldErrors } : {}),
    correlationId: `mock-${Date.now()}`,
    timestamp: new Date().toISOString(),
  },
});

const SKU_RE = /^[A-Z0-9][A-Z0-9._-]{0,63}$/;
const fold = (text: string) =>
  text.normalize("NFD").replace(/[̀-ͯ]/g, "").replaceAll("đ", "d").replaceAll("Đ", "D").toLowerCase();

function toInt(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  return Number.isInteger(n) ? n : Number.NaN;
}

const asList = (value: unknown): string[] =>
  value === undefined ? [] : (Array.isArray(value) ? value : [value]).map((v) => String(v));

export function availabilityOf(stock: number): "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK" {
  if (stock <= 0) return "OUT_OF_STOCK";
  return stock <= LOW_STOCK_THRESHOLD ? "LOW_STOCK" : "IN_STOCK";
}

export function createMockCatalog(
  seed: readonly MockProduct[],
  { now = Date.now }: { now?: () => number } = {},
) {
  const products: MockProduct[] = seed.map((p) => structuredClone(p));
  let tokens = SUGGESTION_BUDGET;
  let refilledAt = now();
  /** One call out of the suggestion budget; false when it is spent. */
  const takeSuggestionToken = () => {
    const at = now();
    tokens = Math.min(SUGGESTION_BUDGET, tokens + (at - refilledAt) / SUGGESTION_REFILL_MS);
    refilledAt = at;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };
  const visible = () => products.filter((p) => p.published !== false);
  const bySlug = (slug: string) => visible().find((p) => p.slug === slug);
  const variantOf = (sku: string) =>
    visible()
      .flatMap((p) => p.variants)
      .find((v) => v.sku === sku);

  /** BE rule: the primary image leads, then the listing order (several variants may each have a primary). */
  const isPrimary = (product: MockProduct, index: number) =>
    product.images[index]?.primary ?? (index === 0 && !product.images.some((i) => i.primary));
  const leadImage = (product: MockProduct) =>
    product.images
      .map((image, index) => ({ image, index }))
      .sort(
        (a, b) =>
          Number(isPrimary(product, b.index)) - Number(isPrimary(product, a.index)) ||
          a.index - b.index,
      )[0]?.image;

  const imageId = (product: MockProduct, index: number) =>
    `${product.productId.slice(0, 24)}${String(index + 1).padStart(12, "0")}`;

  return {
    /** GET /catalog/products?q=&sort=&page=&size= */
    list(query: { q?: unknown; sort?: unknown; page?: unknown; size?: unknown } = {}): MockResult {
      const page = toInt(query.page, 0);
      const size = toInt(query.size, 20);
      if (!(page >= 0) || !(size >= 1) || size > MAX_PAGE_SIZE) {
        return fail(
          400,
          "UNSUPPORTED_PARAMETER",
          `page must be >= 0 and size between 1 and ${MAX_PAGE_SIZE}`,
        );
      }
      const sortText = typeof query.sort === "string" ? query.sort.trim().toLowerCase() : "";
      if (sortText && !["relevance", "newest", "title"].includes(sortText)) {
        return fail(400, "UNSUPPORTED_PARAMETER", "Sort must be one of relevance, newest, title", [
          { field: "sort", message: "must be one of relevance, newest, title" },
        ]);
      }
      const q = typeof query.q === "string" ? query.q : "";
      if (tooLong(q)) return queryTooLong();
      const terms = fold(q)
        .split(/[^a-z0-9]+/)
        .filter(Boolean);
      let found = visible().filter((p) =>
        terms.every(
          (term) =>
            fold(p.title).includes(term) || p.variants.some((v) => fold(v.sku).includes(term)),
        ),
      );
      const sort = sortText || (terms.length > 0 ? "relevance" : "newest");
      if (sort === "title")
        found = found.sort((a, b) => fold(a.title).localeCompare(fold(b.title)));
      else found = found.sort((a, b) => b.listedOrder - a.listedOrder); // relevance ≈ newest here
      const totalPages = Math.ceil(found.length / size);
      return ok({
        items: found.slice(page * size, (page + 1) * size).map((p) => ({
          productId: p.productId,
          slug: p.slug,
          title: p.title,
          kind: p.kind,
          ...(p.seoTitle ? { seoTitle: p.seoTitle } : {}),
          // Card fields (BE CatalogCardResponse): the primary image and the variants, never a price or stock.
          ...(leadImage(p) ? { primaryImageUrl: leadImage(p)!.url } : {}),
          skus: p.variants.map((v) => ({ sku: v.sku, name: `${p.title} · ${v.sku}` })),
        })),
        page,
        size,
        totalElements: found.length,
        totalPages,
        hasNext: page + 1 < totalPages,
        hasPrevious: page > 0,
      });
    },

    /** GET /catalog/products/{slug}: IN_STOCK / OUT_OF_STOCK only. */
    detail(slug: string): MockResult {
      const product = bySlug(slug);
      if (!product) return fail(404, "NOT_FOUND", "Resource not found");
      if (product.variants.some((v) => v.listPrice === undefined)) {
        return fail(409, "PRICE_NOT_AVAILABLE", "No selling price is available for this SKU");
      }
      return ok({
        productId: product.productId,
        slug: product.slug,
        title: product.title,
        kind: product.kind,
        ...(product.description ? { description: product.description } : {}),
        ...(product.seoTitle ? { seoTitle: product.seoTitle } : {}),
        variants: product.variants.map((v) => ({
          sku: v.sku,
          price: v.listPrice ?? 0,
          currency: "VND",
          availability: v.stock > 0 ? "IN_STOCK" : "OUT_OF_STOCK",
        })),
        galleryUrl: `/api/v1/catalog/products/${product.slug}/gallery`,
      });
    },

    /**
     * What the design backend asks of the catalogue: a product's id, kind and every SKU. Unlike the
     * detail it does not need a price, so a customizable product awaiting one is still answered.
     */
    kindOf(slug: string): { productId: string; kind: MockProductKind; skus: string[] } | undefined {
      const product = bySlug(slug);
      return product
        ? {
            productId: product.productId,
            kind: product.kind,
            skus: product.variants.map((v) => v.sku),
          }
        : undefined;
    },

    /** GET /catalog/products/{slug}/gallery */
    gallery(slug: string): MockResult {
      const product = bySlug(slug);
      if (!product) return fail(404, "NOT_FOUND", "Resource not found");
      return ok({
        images: product.images.map((image, index) => ({
          id: imageId(product, index),
          ...(image.sku ? { sku: image.sku } : {}),
          url: image.url,
          ...(image.altText ? { altText: image.altText } : {}),
          sortOrder: index,
          primary: isPrimary(product, index),
        })),
      });
    },

    /** GET /catalog/search/suggestions?q=&limit= */
    suggestions(query: { q?: unknown; limit?: unknown } = {}): MockResult {
      if (!takeSuggestionToken()) {
        return {
          ...fail(429, "RATE_LIMITED", "Too many requests. Try again in 1 second(s)."),
          headers: { "Retry-After": "1" },
        };
      }
      const limit = toInt(query.limit, 5);
      if (!(limit >= 1) || limit > 10) {
        return fail(400, "UNSUPPORTED_PARAMETER", "Limit must be between 1 and 10", [
          { field: "limit", message: "must be between 1 and 10" },
        ]);
      }
      const q = typeof query.q === "string" ? query.q : "";
      if (tooLong(q)) return queryTooLong();
      const squash = (text: string) =>
        fold(text)
          .replace(/[^a-z0-9]+/g, " ")
          .trim();
      const folded = squash(q);
      if (folded.length < 2) {
        return fail(400, "VALIDATION_FAILED", "Type at least 2 characters", [
          { field: "q", message: "must have at least 2 letters or digits" },
        ]);
      }
      const matches = visible()
        .map((p) => ({ p, sku: p.variants.find((v) => squash(v.sku).includes(folded)) }))
        .filter(({ p, sku }) => sku || squash(p.title).includes(folded))
        .slice(0, limit)
        .map(({ p, sku }) => ({
          title: p.title,
          slug: p.slug,
          sku: (sku ?? p.variants[0])!.sku,
        }));
      return ok(matches);
    },

    /** GET /catalog/products/availability?sku=…&sku=… */
    availability(skuParam: unknown): MockResult {
      const codes = asList(skuParam);
      if (codes.length === 0) return fail(400, "VALIDATION_FAILED", "At least one sku is required");
      const skus = new Set<string>();
      for (const code of codes) {
        const sku = code.trim().toUpperCase();
        if (!SKU_RE.test(sku)) return fail(400, "VALIDATION_FAILED", `Malformed sku: ${code}`);
        skus.add(sku);
      }
      if (skus.size > MAX_SKUS_PER_REQUEST) {
        return fail(400, "VALIDATION_FAILED", `At most ${MAX_SKUS_PER_REQUEST} skus per request`);
      }
      return ok(
        [...skus].map((sku) => ({ sku, availability: availabilityOf(variantOf(sku)?.stock ?? 0) })),
      );
    },

    /** GET /catalog/products/prices?sku=…&sku=… — a SKU with no price is left out. */
    prices(skuParam: unknown): MockResult {
      const codes = asList(skuParam);
      if (codes.length === 0 || codes.length > MAX_SKUS_PER_REQUEST) {
        return fail(400, "VALIDATION_FAILED", `Between 1 and ${MAX_SKUS_PER_REQUEST} skus`);
      }
      const skus = [...new Set(codes.map((c) => c.trim().toUpperCase()))];
      return ok(
        skus.flatMap((sku) => {
          const variant = variantOf(sku);
          if (!variant?.tiers?.length) return [];
          const tiers = [...variant.tiers].sort((a, b) => a.minQuantity - b.minQuantity);
          return [
            {
              sku,
              source: variant.source ?? "BASE",
              moq: tiers[0]!.minQuantity,
              currency: "VND",
              tiers,
            },
          ];
        }),
      );
    },

    /* ── Reads and writes the order book needs (checkout is one BE transaction) ── */

    /** The customer's checkout price (BE checkoutPrices): the tier the SKU's total quantity reaches. */
    checkoutPrice(
      sku: string,
      quantity: number,
    ): { price: number } | { error: "NOT_PURCHASABLE" | "NO_PRICE" | "BELOW_MOQ" } {
      const variant = variantOf(sku);
      if (!variant) return { error: "NOT_PURCHASABLE" };
      const tiers = [...(variant.tiers ?? [])].sort((a, b) => a.minQuantity - b.minQuantity);
      if (tiers.length === 0) return { error: "NO_PRICE" };
      const reached = tiers.filter((t) => t.minQuantity <= quantity).at(-1);
      return reached ? { price: reached.unitPrice } : { error: "BELOW_MOQ" };
    },

    /**
     * Where a SKU is on sale (BE CatalogService.listings, SCRUM-190): the product page and its title
     * and lead image; undefined for a SKU that is not on sale now.
     */
    listingOf(sku: string): { slug: string; title: string; imageUrl?: string } | undefined {
      const product = visible().find((p) => p.variants.some((v) => v.sku === sku));
      if (!product) return undefined;
      const image = leadImage(product);
      return {
        slug: product.slug,
        title: product.title,
        ...(image ? { imageUrl: image.url } : {}),
      };
    },

    stockOf: (sku: string) => variantOf(sku)?.stock ?? 0,

    /** Holds units for an order (inventory.reserve); false when there are not enough. */
    reserve(sku: string, quantity: number): boolean {
      const variant = variantOf(sku);
      if (!variant || variant.stock < quantity) return false;
      variant.stock -= quantity;
      return true;
    },

    release(sku: string, quantity: number) {
      const variant = variantOf(sku);
      if (variant) variant.stock += quantity;
    },
  };
}

export type MockCatalog = ReturnType<typeof createMockCatalog>;

/* ── Seed ─────────────────────────────────────────────────────────────── */

const id = (n: number) => `7c1f0a00-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const LOGO = "/logo.png";

interface Spec {
  slug: string;
  title: string;
  /** Absent = STANDARD. */
  kind?: MockProductKind;
  description?: string;
  variants: Array<{
    sku: string;
    stock: number;
    price?: number;
    bulk?: number;
    source?: "CUSTOMER" | "SEGMENT" | "BASE";
    moq?: number;
    /** No base price at all: the BE detail then answers 409 PRICE_NOT_AVAILABLE. */
    noListPrice?: boolean;
  }>;
}

const SPECS: Spec[] = [
  {
    slug: "ly-giay-2-lop-8oz",
    title: "Ly giấy 2 lớp 8oz",
    kind: "CUSTOMIZABLE",
    description:
      "Ly giấy hai lớp cách nhiệt, miệng 80 mm, đóng thùng 1.000 cái.\nPhù hợp cà phê mang đi và đồ uống nóng.",
    variants: [
      {
        sku: "CUP-PAPER-8OZ-WHT",
        stock: 120000,
        price: 780,
        bulk: 720,
        moq: 1000,
        source: "CUSTOMER",
      },
      { sku: "CUP-PAPER-8OZ-KRAFT", stock: 3, price: 820, moq: 1000, source: "CUSTOMER" },
    ],
  },
  {
    slug: "ly-giay-2-lop-12oz",
    title: "Ly giấy 2 lớp 12oz",
    kind: "CUSTOMIZABLE",
    description: "Ly giấy hai lớp 12oz, miệng 90 mm.",
    variants: [
      {
        sku: "CUP-PAPER-12OZ-WHT",
        stock: 60000,
        price: 980,
        bulk: 910,
        moq: 1000,
        source: "SEGMENT",
      },
    ],
  },
  {
    slug: "ly-nhua-pet-500ml",
    title: "Ly nhựa PET 500ml",
    kind: "CUSTOMIZABLE",
    description: "Ly nhựa PET trong suốt 500 ml, dùng cho trà sữa và đồ uống lạnh.",
    variants: [{ sku: "CUP-PET-500ML", stock: 0, price: 1250, moq: 500, source: "BASE" }],
  },
  {
    slug: "ly-giay-in-logo",
    title: "Ly giấy in logo theo yêu cầu",
    kind: "CUSTOMIZABLE",
    description: "Ly in thương hiệu riêng. Giá theo báo giá của Sales.",
    variants: [{ sku: "CUP-CUSTOM-LOGO", stock: 20000 }],
  },
  {
    slug: "hop-giay-mang-di-m",
    title: "Hộp giấy mang đi size M",
    variants: [
      { sku: "BOX-TAKEAWAY-M", stock: 8000, price: 2100, bulk: 1950, moq: 200, source: "BASE" },
    ],
  },
  {
    slug: "tui-giay-kraft",
    title: "Túi giấy kraft quai xoắn",
    kind: "CUSTOMIZABLE",
    description: "Túi giấy kraft nâu, quai xoắn, nhiều cỡ.",
    variants: [
      { sku: "BAG-KRAFT-M", stock: 15000, price: 1800, bulk: 1650, moq: 500, source: "BASE" },
      { sku: "BAG-KRAFT-L", stock: 0, price: 2400, moq: 500, source: "BASE" },
    ],
  },
  {
    slug: "nap-ly-90mm",
    title: "Nắp ly 90 mm",
    variants: [
      { sku: "LID-90MM-BLK", stock: 90000, price: 250, bulk: 220, moq: 2000, source: "BASE" },
    ],
  },
  {
    slug: "ong-hut-giay",
    title: "Ống hút giấy 6 mm",
    variants: [{ sku: "STRAW-PAPER-6MM", stock: 4, price: 180, moq: 5000, source: "BASE" }],
  },
  {
    slug: "khay-giay-4-ly",
    title: "Khay giấy đựng 4 ly",
    variants: [{ sku: "TRAY-PAPER-4CUP", stock: 5200, price: 1500, moq: 300, source: "BASE" }],
  },
  {
    slug: "ao-thun-cotton-co-tron",
    title: "Áo thun cotton cổ tròn",
    description: "Áo thun cotton 220gsm, in logo đồng phục.",
    variants: [
      {
        sku: "TEE-CLASSIC-WHT-M",
        stock: 900,
        price: 189000,
        bulk: 175000,
        moq: 10,
        source: "CUSTOMER",
      },
      {
        sku: "TEE-CLASSIC-WHT-L",
        stock: 640,
        price: 189000,
        bulk: 175000,
        moq: 10,
        source: "CUSTOMER",
      },
    ],
  },
  {
    slug: "ao-hoodie-essential",
    title: "Áo hoodie Essential",
    variants: [{ sku: "HOODIE-ESS-BLK-L", stock: 220, price: 459000, moq: 5, source: "BASE" }],
  },
  {
    slug: "coc-su-11oz",
    title: "Cốc sứ 11oz",
    variants: [
      {
        sku: "MUG-CERAMIC-11OZ",
        stock: 1800,
        price: 129000,
        bulk: 119000,
        moq: 24,
        source: "BASE",
      },
    ],
  },
  {
    slug: "tui-canvas",
    title: "Túi canvas tự nhiên",
    variants: [{ sku: "TOTE-CANVAS-NAT", stock: 2600, price: 159000, moq: 20, source: "BASE" }],
  },
  {
    slug: "ly-giay-kraft-16oz",
    title: "Ly giấy kraft 16oz (chờ niêm yết giá)",
    kind: "CUSTOMIZABLE",
    variants: [{ sku: "CUP-KRAFT-16OZ", stock: 3000, noListPrice: true }],
  },
  {
    slug: "giay-in-a4",
    title: "Giấy in A4 định lượng 80",
    variants: [{ sku: "PAPER-A4-80", stock: 700, price: 78000, moq: 5, source: "BASE" }],
  },
];

export function seedMockCatalog(): MockProduct[] {
  return SPECS.map((spec, index) => ({
    productId: id(index + 1),
    slug: spec.slug,
    title: spec.title,
    kind: spec.kind ?? "STANDARD",
    ...(spec.description ? { description: spec.description } : {}),
    listedOrder: SPECS.length - index,
    variants: spec.variants.map((v) => ({
      sku: v.sku,
      stock: v.stock,
      // The listing price the detail shows; SKUs without a customer price keep one too.
      ...(v.noListPrice ? {} : { listPrice: v.price ?? 9500 }),
      ...(v.price !== undefined
        ? {
            source: v.source ?? "BASE",
            tiers: [
              { minQuantity: v.moq ?? 1, unitPrice: v.price },
              ...(v.bulk !== undefined
                ? [{ minQuantity: (v.moq ?? 1) * 5, unitPrice: v.bulk }]
                : []),
            ],
          }
        : {}),
    })),
    images: [
      ...spec.variants.map((v) => ({ sku: v.sku, url: LOGO, altText: `${spec.title} · ${v.sku}` })),
    ],
  }));
}
