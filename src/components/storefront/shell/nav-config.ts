import { STORE_ROUTES } from "@/constants";

export type NavLink = { href: string; label: string; highlight?: boolean };
export type FooterColumn = { title: string; links: NavLink[] };

// The business sells cups and packaging printed to its wholesale customers' own designs, B2B only
// (decided 2026-10-06): a customer designs, asks for a quote, signs a contract and pays its
// installments by transfer. There is no cart, no retail category tree, no card payment.

/** One name for the chat with Sales everywhere in the shell (SF-UX-4). */
export const CHAT_WITH_SALES = "Chat với Sale";

const productsLink: NavLink = { href: STORE_ROUTES.catalog.list, label: "Sản phẩm" };
const designsLink: NavLink = { href: STORE_ROUTES.design.list, label: "Thiết kế của tôi" };
const projectsLink: NavLink = { href: STORE_ROUTES.design.projects, label: "Dự án thiết kế" };
const quotesLink: NavLink = { href: STORE_ROUTES.account.quotes.list, label: "Báo giá của tôi" };
const ordersLink: NavLink = { href: STORE_ROUTES.account.orders.list, label: "Đơn hàng" };
const paymentsLink: NavLink = { href: STORE_ROUTES.account.payments, label: "Thanh toán" };
const chatLink: NavLink = { href: STORE_ROUTES.chat.list, label: CHAT_WITH_SALES };

/** The header's main row: the products, then the customer's own work, design to quote. */
export const mainLinks: NavLink[] = [
  productsLink,
  { ...designsLink, highlight: true },
  projectsLink,
  quotesLink,
];

/** The header's right-hand links on a wide screen; the chat has its own icon link with the badge. */
export const utilityLinks: NavLink[] = [ordersLink, paymentsLink];

/** The account group of the phone menu. */
export const accountLinks: NavLink[] = [
  { href: STORE_ROUTES.account.home, label: "Tài khoản" },
  ordersLink,
  paymentsLink,
];

/** The help group of the phone menu. */
export const supportLinks: NavLink[] = [chatLink];

/** The anchor of the home page's "how ordering works" strip, which the footer links to. */
export const ORDER_FLOW_ANCHOR = "quy-trinh-dat-in";

export const footerColumns: FooterColumn[] = [
  { title: "Sản phẩm & thiết kế", links: [productsLink, designsLink, projectsLink] },
  { title: "Đặt in", links: [quotesLink, ordersLink, paymentsLink] },
  {
    title: "Tài khoản",
    links: [
      { href: STORE_ROUTES.account.home, label: "Tài khoản của tôi" },
      { href: STORE_ROUTES.account.addresses, label: "Sổ địa chỉ" },
      { href: STORE_ROUTES.account.security, label: "Bảo mật" },
    ],
  },
  {
    title: "Hỗ trợ",
    links: [chatLink, { href: `/#${ORDER_FLOW_ANCHOR}`, label: "Quy trình đặt in" }],
  },
];

// No COD and no card: a customer pays the installments of the signed contract by bank transfer,
// with a VietQR code (WF-02, kltn-docs 15 BR-01).
export const paymentMethods = ["Chuyển khoản ngân hàng", "VietQR"] as const;
