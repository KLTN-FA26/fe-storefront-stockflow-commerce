import { ReturnRequestScreen } from "@/features/order/components/return-request-screen";

export default async function ReturnRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="max-w-3xl">
      <ReturnRequestScreen orderId={id} />
    </div>
  );
}
