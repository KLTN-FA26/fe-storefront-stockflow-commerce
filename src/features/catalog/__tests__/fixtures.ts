/** BE-shaped catalogue answers as the real API sends them (NON_NULL drops every null field). */
export const productId = "7c1f0a00-0000-4000-8000-000000000001";

export const beCard = { productId, slug: "ly-giay-2-lop-8oz", title: "Ly giấy 2 lớp 8oz" };

export const bePage = (overrides: Record<string, unknown> = {}) => ({
  items: [beCard],
  page: 0,
  size: 12,
  totalElements: 1,
  totalPages: 1,
  hasNext: false,
  hasPrevious: false,
  ...overrides,
});

export const beProduct = {
  productId,
  slug: "ly-giay-2-lop-8oz",
  title: "Ly giấy 2 lớp 8oz",
  description: "Ly giấy hai lớp cách nhiệt.",
  variants: [
    { sku: "CUP-PAPER-8OZ-WHT", price: 780, currency: "VND", availability: "IN_STOCK" },
    { sku: "CUP-PAPER-8OZ-KRAFT", price: 820, currency: "VND", availability: "OUT_OF_STOCK" },
  ],
  galleryUrl: "/api/v1/catalog/products/ly-giay-2-lop-8oz/gallery",
};

export const beGallery = {
  images: [
    {
      id: "7c1f0a00-0000-4000-8000-000000000101",
      sku: "CUP-PAPER-8OZ-KRAFT",
      url: "https://cdn.example.vn/p/kraft.jpg",
      sortOrder: 1,
      primary: false,
    },
    {
      id: "7c1f0a00-0000-4000-8000-000000000102",
      sku: "CUP-PAPER-8OZ-WHT",
      url: "https://cdn.example.vn/p/white.jpg",
      altText: "Ly trắng",
      sortOrder: 0,
      primary: true,
    },
  ],
};

export const beSchedule = {
  sku: "CUP-PAPER-8OZ-WHT",
  source: "CUSTOMER",
  moq: 1000,
  currency: "VND",
  tiers: [
    { minQuantity: 1000, unitPrice: 780 },
    { minQuantity: 5000, unitPrice: 720 },
  ],
};
