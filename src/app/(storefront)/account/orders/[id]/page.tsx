import { PageContainer } from "@/components/shared";
import { OrderDetailScreen } from "@/features/order/components/order-detail-screen";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <PageContainer className="max-w-4xl">
      <OrderDetailScreen orderId={id} />
    </PageContainer>
  );
}
