import { OrderDetailSkeleton } from "@/features/order/components/order-states";

export default function ReturnRequestLoading() {
  return (
    <div className="max-w-3xl">
      <OrderDetailSkeleton />
    </div>
  );
}
