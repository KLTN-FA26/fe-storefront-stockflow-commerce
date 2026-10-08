import { OrderTimeline } from "@/components/storefront/order-timeline";
import { TrackingProgress } from "@/components/storefront/tracking-progress";

export default function OrderDetailPage() {
  return (
    <section className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div><h1 className="font-display text-3xl font-bold">SO-2026-001</h1><p className="text-ink-secondary">Design snapshot đã locked sau khi đơn confirmed.</p></div>
      <TrackingProgress current={3} total={5} label="Đang vận chuyển" eta="16/09/2026" />
      <OrderTimeline items={[{ id: "created", label: "Đã tạo", completed: true, time: "14/09 09:00" }, { id: "paid", label: "Đã thanh toán", completed: true, time: "14/09 09:05" }, { id: "ship", label: "Bàn giao vận chuyển", completed: true, time: "14/09 15:00" }, { id: "done", label: "Đã giao", completed: false }]} />
    </section>
  );
}
