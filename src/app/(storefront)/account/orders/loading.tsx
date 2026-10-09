import { PageContainer } from "@/components/shared";
import { OrderListSkeleton } from "@/features/order/components/order-states";

export default function OrdersLoading() {
  return (
    <PageContainer className="max-w-4xl">
      <OrderListSkeleton />
    </PageContainer>
  );
}
