import { Suspense } from "react";

import { PageContainer } from "@/components/shared";
import { OrdersScreen } from "@/features/order/components/orders-screen";
import { OrderListSkeleton } from "@/features/order/components/order-states";

export default function OrdersPage() {
  return (
    <PageContainer className="max-w-4xl">
      {/* nuqs reads search params: Suspense keeps the rest of the route static. */}
      <Suspense fallback={<OrderListSkeleton />}>
        <OrdersScreen />
      </Suspense>
    </PageContainer>
  );
}
