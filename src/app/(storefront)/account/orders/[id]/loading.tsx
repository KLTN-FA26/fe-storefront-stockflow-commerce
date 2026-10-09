import { PageContainer } from "@/components/shared";
import { OrderDetailSkeleton } from "@/features/order/components/order-states";

export default function OrderDetailLoading() {
  return (
    <PageContainer className="max-w-4xl">
      <OrderDetailSkeleton />
    </PageContainer>
  );
}
