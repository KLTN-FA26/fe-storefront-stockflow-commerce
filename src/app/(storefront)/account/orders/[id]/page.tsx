"use client";

import { useState } from "react";
import { useParams, useRouter, notFound } from "next/navigation";
import Link from "next/link";

import { STORE_ROUTES } from "@/constants";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, PageContainer, PageHeader, Skeleton } from "@/components/shared";
import { OrderTimeline } from "@/components/storefront/order-timeline";
import { TrackingProgress } from "@/components/storefront/tracking-progress";
import { useOrder, useCancelMyOrder, isOrderCancellable } from "@/features/order";
import type { ApiError } from "@/lib/api/error";

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const orderId = decodeURIComponent(params.id);

  const [cancelOpen, setCancelOpen] = useState(false);

  const { data: order, isLoading, error } = useOrder(orderId);
  const cancelMutation = useCancelMyOrder();

  if (isLoading) {
    return (
      <PageContainer className="max-w-4xl">
        <Skeleton className="h-9 w-56" />
        <div className="mt-6 space-y-4">
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      </PageContainer>
    );
  }

  if (error) {
    if ((error as ApiError).status === 404) notFound();
    return (
      <PageContainer className="max-w-4xl">
        <PageHeader title="Đơn hàng" />
        <div className="bg-bg-surface text-danger mt-6 rounded-xl p-6">{error.message}</div>
      </PageContainer>
    );
  }

  if (!order) return null;

  const cancellable = isOrderCancellable(order.status);

  const handleCancel = () => {
    cancelMutation.mutate(
      { id: order.orderId },
      {
        onSuccess: () => {
          router.push(STORE_ROUTES.account.orders.list);
        },
      },
    );
  };

  return (
    <PageContainer className="max-w-4xl">
      <PageHeader
        title={order.orderNumber}
        subtitle="Xem chi tiết và theo dõi đơn hàng của bạn."
        actions={
          cancellable && (
            <Button
              variant="outline"
              className="border-border-strong text-danger hover:bg-bg-muted rounded-full"
              onClick={() => setCancelOpen(true)}
              disabled={cancelMutation.isPending}
            >
              Huỷ đơn hàng
            </Button>
          )
        }
      />

      <div className="mt-6 space-y-6">
        <TrackingProgress
          current={order.status === "Completed" || order.status === "Delivered" ? 4 : 2}
          total={4}
          label={order.status}
          eta={order.deliveredAt ? formatDate(order.deliveredAt) : "Đang xử lý"}
        />
        <OrderTimeline
          items={[
            {
              id: "created",
              label: "Đã tạo",
              completed: true,
              time: formatDateTime(order.placedAt),
            },
            {
              id: "status",
              label: order.status,
              completed: order.status !== "Pending Payment" && order.status !== "Payment Failed",
            },
            { id: "done", label: "Hoàn tất", completed: order.status === "Completed" },
          ]}
        />

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary" className="rounded-full">
            <Link href={STORE_ROUTES.account.orders.list}>Quay lại danh sách</Link>
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Huỷ đơn hàng?"
        description="Đơn hàng của bạn sẽ bị huỷ. Hàng đã thanh toán sẽ được hoàn tiền theo chính sách của StockFlowCommerce."
        confirmLabel="Xác nhận huỷ"
        requireReason={false}
        onConfirm={handleCancel}
      />
    </PageContainer>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${date.getFullYear()}`;
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  return `${dd}/${mm} ${hh}:${mi}`;
}
