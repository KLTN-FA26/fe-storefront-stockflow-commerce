"use client";

import Link from "next/link";

import { STORE_ROUTES } from "@/constants";
import { Button } from "@/components/ui/button";
import { PageContainer, PageHeader, EmptyState, Skeleton } from "@/components/shared";
import { OrderCard } from "@/components/storefront/order-card";
import { useMyOrders } from "@/features/order";

const ORDER_PAGE_SIZE = 10;

// formatDate: "2026-05-26T10:00:00+07:00" → "26/05/2026"
function formatDate(iso: string): string {
  const date = new Date(iso);
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${date.getFullYear()}`;
}

export default function OrdersPage() {
  const { data, isLoading, error } = useMyOrders({ page: 1, pageSize: ORDER_PAGE_SIZE });

  return (
    <PageContainer className="max-w-4xl">
      <PageHeader title="Đơn hàng" subtitle="Theo dõi trạng thái và giao hàng." />

      {isLoading ? (
        <div className="mt-6 space-y-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <div className="bg-bg-surface text-danger mt-6 rounded-xl p-6">{error.message}</div>
      ) : data?.items.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="Bạn chưa có đơn hàng nào"
            description="Khi bạn đặt hàng lần đầu, lịch sử đơn hàng sẽ xuất hiện tại đây."
            action={
              <Button asChild className="rounded-full">
                <Link href={STORE_ROUTES.catalog.list}>Tiếp tục mua sắm</Link>
              </Button>
            }
          />
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {(data?.items ?? []).map((order) => (
            <OrderCard
              key={order.orderId}
              href={STORE_ROUTES.account.orders.detail(order.orderId)}
              orderCode={order.orderNumber}
              status={order.status}
              itemCount={order.lines.length}
              total={order.grandTotal}
              createdAt={formatDate(order.placedAt)}
            />
          ))}
        </div>
      )}
    </PageContainer>
  );
}
