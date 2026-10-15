import { CheckCircle2, RotateCcw, Ruler, ShieldCheck, Truck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { SurfaceCard } from "@/components/storefront/layout";

const detailCards = [
  { icon: Truck, title: "Giao dự kiến", desc: "2–4 ngày cho sản phẩm tiêu chuẩn." },
  {
    icon: ShieldCheck,
    title: "Preflight QC",
    desc: "Thiết kế custom được kiểm tra trước checkout.",
  },
  {
    icon: RotateCcw,
    title: "Đổi trả rõ ràng",
    desc: "Hỗ trợ nếu lỗi sản xuất hoặc sai mẫu duyệt.",
  },
] as const;

const specs = [
  ["Chất liệu", "Cotton compact 220gsm"],
  ["Kỹ thuật", "In chuyển nhiệt / DTF"],
  ["Form", "Unisex regular fit"],
  ["Bảo quản", "Giặt mặt trái, không sấy nhiệt cao"],
] as const;

export function DeliveryPromise() {
  return (
    <SurfaceCard padded={false}>
      <ul className="divide-border-default divide-y">
        {detailCards.map(({ icon: Icon, title, desc }) => (
          <li key={title} className="flex items-start gap-3 p-[var(--card-pad)]">
            <Icon className="text-accent mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <h2 className="text-ink-primary text-sm font-semibold">{title}</h2>
              <p className="text-ink-secondary text-sm">{desc}</p>
            </div>
          </li>
        ))}
      </ul>
    </SurfaceCard>
  );
}

export function ProductSpecs() {
  return (
    <SurfaceCard
      as="section"
      padded={false}
      className="divide-border-default grid divide-y lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:divide-x lg:divide-y-0"
    >
      <div className="p-[var(--card-pad)]">
        <div className="flex items-center gap-2">
          <Ruler className="text-accent size-5" aria-hidden="true" />
          <h2 className="font-display text-ink-primary text-lg font-bold">Thông số sản phẩm</h2>
        </div>
        <dl className="mt-3 grid text-sm">
          {specs.map(([label, value]) => (
            <div
              key={label}
              className="border-border-default flex justify-between gap-4 border-b py-2.5 last:border-0"
            >
              <dt className="text-ink-secondary">{label}</dt>
              <dd className="text-ink-primary text-right font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="p-[var(--card-pad)]">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="text-positive size-5" aria-hidden="true" />
          <h2 className="font-display text-ink-primary text-lg font-bold">
            Cam kết trước sản xuất
          </h2>
        </div>
        <p className="text-ink-secondary mt-3 text-sm">
          Mỗi thiết kế được kiểm tra vùng in, cảnh báo ảnh mờ và yêu cầu xác nhận snapshot để hạn
          chế sai lệch khi sản xuất.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {["Print area", "Safe area", "Preview 2D"].map((item) => (
            <Badge key={item} variant="secondary" className="rounded-full">
              {item}
            </Badge>
          ))}
        </div>
      </div>
    </SurfaceCard>
  );
}
