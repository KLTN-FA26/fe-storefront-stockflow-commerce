"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { notFound, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { STORE_ROUTES } from "@/constants";
import { Alert } from "@/components/shared";
import { toast } from "@/components/shared/Toast";
import { Button } from "@/components/ui/button";
import { useHasPermission } from "@/lib/auth/my-permissions";
import { formatDate } from "@/lib/format/date";
import { lastReturnDay } from "@/lib/domain/return-window";
import {
  canOpenReturn,
  describeReturnError,
  useAddMyReturnPhoto,
  useMyOrderReturns,
  useOpenMyReturn,
} from "@/lib/returns";

import { isNotFound } from "../errors";
import { useOrder } from "../queries";
import { RETURN_CREATE_PERMISSION, returnableLines, type ReturnFormValues } from "../return-form";
import { isValidOrderId } from "../schemas";
import { deliveredAtOf } from "./order-completion-hint";
import { OrderDetailSkeleton, OrderLoadError } from "./order-states";
import { ReturnRequestForm } from "./return-request-form";

function Closed({ orderId, children }: { orderId: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <Alert tone="info" title="Không thể gửi yêu cầu trả hàng cho đơn này">
        {children}
      </Alert>
      <div className="flex flex-wrap gap-3">
        <Button asChild variant="outline" className="min-h-11 rounded-[var(--r-md)] px-4">
          <Link href={STORE_ROUTES.account.orders.detail(orderId)}>Về đơn hàng</Link>
        </Button>
        <Button asChild className="min-h-11 rounded-[var(--r-md)] px-4">
          <Link href={STORE_ROUTES.chat.list}>Chat với Sales</Link>
        </Button>
      </div>
    </div>
  );
}

/** Trang mở yêu cầu trả hàng cho một đơn đã giao (17 §4.10; BR-RMA-001, BR-RMA-002). */
export function ReturnRequestScreen({ orderId: raw }: { orderId: string }) {
  const orderId = raw.toLowerCase();
  const valid = isValidOrderId(orderId);
  const router = useRouter();
  // Một mã cho cả form: gửi lại sau lỗi mạng nhận về đúng yêu cầu đã mở (BE idempotent).
  const [requestId] = useState(() => crypto.randomUUID());
  const order = useOrder(orderId);
  const returns = useMyOrderReturns(orderId, valid);
  const mayCreate = useHasPermission(RETURN_CREATE_PERMISSION);
  const open = useOpenMyReturn();
  const photo = useAddMyReturnPhoto();
  const [uploading, setUploading] = useState(false);
  const lines = useMemo(
    () => (order.data ? returnableLines(order.data.lines, returns.data ?? []) : []),
    [order.data, returns.data],
  );

  if (!valid || isNotFound(order.error)) notFound();
  if (order.isPending || (returns.isPending && returns.fetchStatus !== "idle")) {
    return <OrderDetailSkeleton />;
  }
  if (!order.data || returns.error) {
    return (
      <OrderLoadError
        title="Không tải được đơn hàng"
        error={order.error ?? returns.error}
        onRetry={() => void Promise.all([order.refetch(), returns.refetch()])}
        retrying={order.isFetching || returns.isFetching}
      />
    );
  }
  const current = order.data;
  const deliveredAt = deliveredAtOf(current);

  const submit = async (values: ReturnFormValues) => {
    const chosen = Object.entries(values.quantities)
      .filter(([, quantity]) => quantity > 0)
      .map(([orderLineId, quantity]) => ({ orderLineId, quantity }));
    const opened = await open
      .mutateAsync({
        orderId: current.orderId,
        requestId,
        reasonCode: values.reasonCode,
        description: values.description || undefined,
        lines: chosen,
      })
      .catch(() => null);
    if (!opened) return;
    setUploading(true);
    let failed = 0;
    for (const file of values.photos) {
      await photo.mutateAsync({ returnId: opened.id, file }).catch(() => {
        failed += 1;
      });
    }
    setUploading(false);
    if (failed > 0) {
      toast.warning(
        `Đã gửi yêu cầu ${opened.rmaNumber}`,
        `${failed} ảnh chưa tải được — hãy thêm lại ở trang yêu cầu.`,
      );
    } else {
      toast.success(`Đã gửi yêu cầu ${opened.rmaNumber}`, "Sales sẽ xem xét và phản hồi bạn.");
    }
    router.push(STORE_ROUTES.account.returns.detail(opened.id));
  };

  const header = (
    <div className="border-border-default border-b pb-3.5">
      <Link
        href={STORE_ROUTES.account.orders.detail(current.orderId)}
        className="text-ink-secondary hover:text-ink-primary focus-visible:ring-accent -ml-2 inline-flex min-h-11 items-center rounded-full px-2 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
      >
        <ChevronLeft aria-hidden className="mr-1 size-4" />
        Đơn <span className="ml-1 font-mono">{current.orderNumber}</span>
      </Link>
      <h1 className="font-display text-ink-primary mt-1 text-xl font-bold sm:text-2xl">
        Yêu cầu trả hàng
      </h1>
      {deliveredAt ? (
        <p className="text-ink-secondary mt-1 text-sm">
          Hạn đổi / trả đến hết ngày {formatDate(lastReturnDay(deliveredAt).toISOString())}.
        </p>
      ) : null}
    </div>
  );

  if (!mayCreate) {
    return (
      <div className="space-y-5">
        {header}
        <Closed orderId={current.orderId}>
          Tài khoản của bạn hiện không tự gửi được yêu cầu trả hàng. Hãy chat với Sales để được hỗ
          trợ.
        </Closed>
      </div>
    );
  }
  if (!canOpenReturn(current.status, deliveredAt)) {
    return (
      <div className="space-y-5">
        {header}
        <Closed orderId={current.orderId}>
          Chỉ gửi được yêu cầu trả hàng cho đơn đã giao, trong 7 ngày kể từ ngày giao. Nếu hàng có
          lỗi phát hiện muộn, hãy chat với Sales.
        </Closed>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {header}
      <ReturnRequestForm
        lines={lines}
        pending={open.isPending || uploading}
        error={open.error ? describeReturnError(open.error) : undefined}
        onSubmit={(values) => void submit(values)}
      />
    </div>
  );
}
