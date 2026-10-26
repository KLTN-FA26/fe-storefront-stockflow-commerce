import { OrderListSkeleton } from "@/features/order/components/order-states";

export default function OrdersLoading() {
  return (
    <div className="max-w-5xl">
      <OrderListSkeleton />
    </div>
  );
}
