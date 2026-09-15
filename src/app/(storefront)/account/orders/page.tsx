import { STORE_ROUTES } from "@/constants";

import { OrderCard } from "@/components/storefront/order-card";

const orders = [{ id: "o1", code: "SO-2026-001", status: "Confirmed", items: 2, total: 528000, createdAt: "14/09/2026" }, { id: "o2", code: "SO-2026-002", status: "In Transit", items: 1, total: 189000, createdAt: "13/09/2026" }];

export default function OrdersPage() {
  return (
    <section className="mx-auto w-full max-w-4xl space-y-4 px-4 py-8 sm:px-6 lg:px-8">
      <div><h1 className="font-display text-3xl font-bold">Đơn hàng</h1><p className="text-ink-secondary">Theo dõi trạng thái và giao hàng.</p></div>
      {orders.map((order) => <OrderCard key={order.id} href={STORE_ROUTES.account.orders.detail(order.id)} orderCode={order.code} status={order.status} itemCount={order.items} total={order.total} createdAt={order.createdAt} />)}
    </section>
  );
}
