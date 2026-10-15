import { STORE_ROUTES } from "@/constants";

export type NavLink = { href: string; label: string; highlight?: boolean };
export type FooterColumn = { title: string; links: NavLink[] };

export const categoryLinks: NavLink[] = [
  { href: STORE_ROUTES.catalog.list, label: "Tất cả sản phẩm" },
  { href: STORE_ROUTES.catalog.list, label: "Áo & hoodie" },
  { href: STORE_ROUTES.catalog.list, label: "Quà tặng in ấn" },
  { href: STORE_ROUTES.catalog.list, label: "Ấn phẩm doanh nghiệp" },
  { href: STORE_ROUTES.design.list, label: "Thiết kế riêng", highlight: true },
];

export const utilityLinks: NavLink[] = [
  { href: STORE_ROUTES.account.orders.list, label: "Theo dõi đơn hàng" },
  { href: STORE_ROUTES.chat.list, label: "Hỗ trợ" },
];

export const accountLinks: NavLink[] = [
  { href: STORE_ROUTES.account.home, label: "Tài khoản" },
  { href: STORE_ROUTES.cart, label: "Giỏ hàng" },
  { href: STORE_ROUTES.chat.list, label: "Tư vấn" },
];

export const footerColumns: FooterColumn[] = [
  {
    title: "Mua sắm",
    links: [
      { href: STORE_ROUTES.catalog.list, label: "Catalog" },
      { href: STORE_ROUTES.design.list, label: "Thiết kế riêng" },
      { href: STORE_ROUTES.cart, label: "Giỏ hàng" },
    ],
  },
  {
    title: "Hỗ trợ",
    links: [
      { href: STORE_ROUTES.chat.list, label: "Sales chat" },
      { href: STORE_ROUTES.account.orders.list, label: "Theo dõi đơn" },
      { href: STORE_ROUTES.account.addresses, label: "Sổ địa chỉ" },
    ],
  },
  {
    title: "Tài khoản",
    links: [
      { href: STORE_ROUTES.account.home, label: "Customer portal" },
      { href: STORE_ROUTES.account.security, label: "Bảo mật" },
      { href: STORE_ROUTES.account.privacy, label: "Quyền riêng tư" },
    ],
  },
  {
    title: "Về StockFlow",
    links: [
      { href: "/", label: "Giới thiệu" },
      { href: STORE_ROUTES.chat.list, label: "Liên hệ" },
      { href: STORE_ROUTES.design.list, label: "Dịch vụ thiết kế" },
    ],
  },
];

export const paymentMethods = ["VietQR", "Visa", "Mastercard", "COD"] as const;
