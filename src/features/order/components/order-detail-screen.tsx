"use client";

import { useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { STORE_ROUTES } from "@/constants";
import { ConfirmDialog } from "@/components/shared";
import { useHasPermission } from "@/lib/auth/my-permissions";
import { formatDateTime } from "@/lib/format/date";

import { describeCancelError, isNotFound } from "../errors";
import { useCancelMyOrder } from "../mutations";
import { useOrder } from "../queries";
import { isValidOrderId } from "../schemas";
import { CopyOrderNumber } from "./copy-order-number";
import { OrderDeliveryCard, OrderLinesCard, OrderTotalCard } from "./order-detail-sections";
import { OrderHelpCard } from "./order-help-card";
import {
  OrderDetailSkeleton,
  OrderLoadError,
  OrderStaleNotice,
  OrderWaitingNotice,
} from "./order-states";
import { OrderStatusHero } from "./order-status-hero";

const CANCEL_COPY =
  "Đơn hàng sẽ bị huỷ và không thể khôi phục. Nếu bạn đã thanh toán, vui lòng liên hệ CSKH để được hỗ trợ.";

function BackToOrders() {
  return (
    <Link
      href={STORE_ROUTES.account.orders.list}
      className="text-ink-secondary hover:text-ink-primary focus-visible:ring-accent -ml-2 inline-flex min-h-11 items-center rounded-full px-2 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
    >
      <ChevronLeft aria-hidden className="mr-1 size-4" />
      Đơn hàng của tôi
    </Link>
  );
}

export function OrderDetailScreen({ orderId: rawOrderId }: { orderId: string }) {
  // The BE serialises UUIDs lower-case; keying the query on the same spelling keeps the
  // post-cancel invalidation (keyed by order.orderId) hitting this query for a pasted upper-case URL.
  const orderId = rawOrderId.toLowerCase();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { data: order, isPending, isPaused, isFetching, error, refetch } = useOrder(orderId);
  const cancel = useCancelMyOrder();
  const mayCancel = useHasPermission("sales-orders:UPDATE");

  // Not a UUID: the BE would answer 400 UNSUPPORTED_PARAMETER, and to the customer it is simply an
  // order that does not exist. The query is disabled for it, so nothing is sent.
  if (!isValidOrderId(orderId)) notFound();
  // isPending, not isLoading: a paused fetch (offline, hidden tab) has neither data nor error yet.
  if (isPending) {
    return (
      <div className="space-y-6">
        {isPaused && <OrderWaitingNotice />}
        <OrderDetailSkeleton />
      </div>
    );
  }
  // Another customer's order or a missing one: the BE answers 404 NOT_FOUND for both.
  if (isNotFound(error)) notFound();
  if (!order) {
    return (
      <OrderLoadError
        title="Không tải được đơn hàng"
        error={error}
        onRetry={() => void refetch()}
        retrying={isFetching}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="border-border-default border-b pb-3.5">
        <BackToOrders />
        <h1 className="font-display text-ink-primary mt-1 text-xl font-bold sm:text-2xl">
          Chi tiết đơn hàng
        </h1>
        <div className="text-ink-secondary mt-1 flex flex-wrap items-center gap-x-1 text-sm">
          <span>
            Mã đơn{" "}
            <span className="text-ink-primary font-mono font-semibold tabular-nums">
              {order.orderNumber}
            </span>
          </span>
          <CopyOrderNumber orderNumber={order.orderNumber} />
          <span>· Đặt lúc {formatDateTime(order.placedAt)}</span>
        </div>
      </div>

      {error ? (
        <OrderStaleNotice error={error} onRetry={() => void refetch()} retrying={isFetching} />
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
        <div className="min-w-0 space-y-5">
          <OrderStatusHero status={order.status} />
          <OrderLinesCard order={order} />
        </div>
        <div className="space-y-5 lg:sticky lg:top-[var(--sticky-top)] lg:-mx-1 lg:max-h-[calc(100dvh-var(--sticky-top)-1rem)] lg:self-start lg:overflow-y-auto lg:px-1">
          <OrderTotalCard order={order} />
          <OrderDeliveryCard order={order} />
          <OrderHelpCard
            order={order}
            cancelling={cancel.isPending}
            onCancel={() => setConfirmOpen(true)}
            mayCancel={mayCancel}
            cancelError={cancel.error ? describeCancelError(cancel.error) : undefined}
          />
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Huỷ đơn hàng?"
        description={CANCEL_COPY}
        confirmLabel="Xác nhận huỷ"
        cancelLabel="Giữ đơn hàng"
        onConfirm={() => cancel.mutate({ orderId: order.orderId })}
      />
    </div>
  );
}
