import { STORE_ROUTES } from "@/constants";

export const storefrontProducts = [
  { id: "p1", href: STORE_ROUTES.catalog.detail("ao-thun-premium"), name: "Áo thun cotton premium", imageSrc: "/logo.png", price: 249000, compareAtPrice: 319000, badge: "Custom", rating: 4.8, reviewCount: 124, availability: "in-stock" as const },
  { id: "p2", href: STORE_ROUTES.catalog.detail("coc-su-minimal"), name: "Cốc sứ minimal", imageSrc: "/logo.png", price: 159000, badge: "Bestseller", rating: 4.6, reviewCount: 58, availability: "low-stock" as const },
  { id: "p3", href: STORE_ROUTES.catalog.detail("tui-canvas"), name: "Túi canvas in logo", imageSrc: "/logo.png", price: 189000, compareAtPrice: 229000, badge: "New", rating: 4.7, reviewCount: 77, availability: "in-stock" as const },
  { id: "p4", href: STORE_ROUTES.catalog.detail("hoodie-team"), name: "Hoodie team logo", imageSrc: "/logo.png", price: 429000, badge: "Team", rating: 4.9, reviewCount: 42, availability: "in-stock" as const },
  { id: "p5", href: STORE_ROUTES.catalog.detail("binh-giu-nhiet"), name: "Bình giữ nhiệt khắc tên", imageSrc: "/logo.png", price: 299000, compareAtPrice: 359000, badge: "Sale", rating: 4.5, reviewCount: 36, availability: "in-stock" as const },
  { id: "p6", href: STORE_ROUTES.catalog.detail("sticker-pack"), name: "Sticker pack thương hiệu", imageSrc: "/logo.png", price: 79000, badge: "Nhanh", rating: 4.4, reviewCount: 21, availability: "out-of-stock" as const },
  { id: "p7", href: STORE_ROUTES.catalog.detail("poster-a3"), name: "Poster A3 premium", imageSrc: "/logo.png", price: 99000, rating: 4.6, reviewCount: 64, availability: "in-stock" as const },
  { id: "p8", href: STORE_ROUTES.catalog.detail("name-card"), name: "Name card cán mờ", imageSrc: "/logo.png", price: 149000, badge: "Business", rating: 4.8, reviewCount: 91, availability: "low-stock" as const },
];

export const featuredProducts = storefrontProducts.slice(0, 4);
export const relatedProducts = storefrontProducts.slice(1, 5);
