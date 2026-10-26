import { OrderDetailSkeleton } from "@/features/order/components/order-states";

export default function OrderDetailLoading() {
  return (
    <div className="max-w-5xl">
      <OrderDetailSkeleton />
    </div>
  );
}
