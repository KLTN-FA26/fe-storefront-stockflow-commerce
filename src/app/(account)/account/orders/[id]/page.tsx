import { OrderDetailScreen } from "@/features/order/components/order-detail-screen";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Same content width as the other account tabs; the detail is two columns on lg.
  return (
    <div>
      <OrderDetailScreen orderId={id} />
    </div>
  );
}
