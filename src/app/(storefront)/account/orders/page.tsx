import { Suspense } from "react";

import { OrdersScreen } from "@/features/order/components/orders-screen";
import { OrderListSkeleton } from "@/features/order/components/order-states";

export default function OrdersPage() {
  return (
    <div className="max-w-5xl">
      {/* nuqs reads search params: Suspense keeps the rest of the route static. */}
      <Suspense fallback={<OrderListSkeleton />}>
        <OrdersScreen />
      </Suspense>
    </div>
  );
}
