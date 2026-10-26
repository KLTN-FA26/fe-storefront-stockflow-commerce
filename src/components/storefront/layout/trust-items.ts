import { Headphones, RotateCcw, ShieldCheck, Truck, type LucideIcon } from "lucide-react";

export type TrustItem = { icon: LucideIcon; title: string; desc: string };

export const defaultTrustItems: TrustItem[] = [
  { icon: Truck, title: "Giao hàng toàn quốc", desc: "Nhận hàng 2–4 ngày" },
  { icon: RotateCcw, title: "Đổi trả 7 ngày", desc: "Lỗi in ấn được làm lại" },
  { icon: ShieldCheck, title: "Thanh toán an toàn", desc: "Không lưu dữ liệu thẻ" },
  { icon: Headphones, title: "Hỗ trợ thiết kế", desc: "Tư vấn miễn phí qua chat" },
];
