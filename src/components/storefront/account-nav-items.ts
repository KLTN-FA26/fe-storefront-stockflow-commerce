import {
  FileText,
  Landmark,
  Lock,
  MapPin,
  Package,
  Palette,
  Undo2,
  UserRound,
  type LucideIcon,
} from "lucide-react";

import { STORE_ROUTES } from "@/constants";

export interface AccountNavItem {
  href: string;
  label: string;
  /** Short helper text; the compact sidebar renders one-line items and does not show it. */
  description: string;
  icon: LucideIcon;
  /** Only highlight on the exact path (the account home would otherwise match every child route). */
  exact?: boolean;
}

// Plain module (not "use client") so Server Components can read the list too.
export const accountNavItems: readonly AccountNavItem[] = [
  {
    href: STORE_ROUTES.account.home,
    label: "Hồ sơ của tôi",
    description: "Thông tin liên hệ",
    icon: UserRound,
    exact: true,
  },
  {
    // Outside the account pages, but it is where a customer's work starts (WF-02 D1).
    href: STORE_ROUTES.design.list,
    label: "Thiết kế của tôi",
    description: "Thiết kế, gửi duyệt & yêu cầu báo giá",
    icon: Palette,
  },
  {
    href: STORE_ROUTES.account.quotes.list,
    label: "Báo giá",
    description: "Báo giá Sale gửi cho bạn",
    icon: FileText,
  },
  {
    href: STORE_ROUTES.account.orders.list,
    label: "Đơn hàng",
    description: "Theo dõi & lịch sử mua",
    icon: Package,
  },
  {
    href: STORE_ROUTES.account.payments,
    label: "Thanh toán",
    description: "Các đợt thanh toán theo hợp đồng",
    icon: Landmark,
  },
  {
    href: STORE_ROUTES.account.returns.list,
    label: "Trả hàng",
    description: "Yêu cầu trả hàng & hoàn tiền",
    icon: Undo2,
  },
  {
    href: STORE_ROUTES.account.addresses,
    label: "Sổ địa chỉ",
    description: "Địa chỉ giao hàng",
    icon: MapPin,
  },
  {
    href: STORE_ROUTES.account.security,
    label: "Bảo mật",
    description: "Mật khẩu & đăng nhập",
    icon: Lock,
  },
];
