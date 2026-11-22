import { Landmark, Package, Palette, Truck, type LucideIcon } from "lucide-react";

export type TrustItem = { icon: LucideIcon; title: string; desc: string };

/**
 * What the business really promises a wholesale customer (B2B printed cups and packaging, WF-02):
 * printing to the customer's design, a quote by the carton, delivery as a full truckload in the
 * contract's batches, and payment of the contract's installments by bank transfer. No retail
 * promises: no return window, no parcel delivery time, no card payment.
 */
export const defaultTrustItems: TrustItem[] = [
  { icon: Palette, title: "In theo thiết kế của bạn", desc: "Kiểm tra file in trước khi sản xuất" },
  { icon: Package, title: "Báo giá theo số thùng", desc: "Giá theo SKU riêng của bạn" },
  { icon: Truck, title: "Giao nguyên chuyến", desc: "Theo các đợt giao trong hợp đồng" },
  {
    icon: Landmark,
    title: "Chuyển khoản theo hợp đồng",
    desc: "Thanh toán từng đợt, có mã VietQR",
  },
];
