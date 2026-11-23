"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { notFound, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { CHAT_WITH_SALES, STORE_ROUTES } from "@/constants";
import { Alert } from "@/components/shared";
import { toast } from "@/components/shared/Toast";
import { Button } from "@/components/ui/button";
import { useHasPermission } from "@/lib/auth/my-permissions";
import { formatDate } from "@/lib/format/date";
import { lastReturnDay } from "@/lib/domain/return-window";
import {
  describeReturnError,
  returnEligibility,
  useAddMyReturnPhoto,
  useMyOrderReturns,
  useOpenMyReturn,
  type ReturnClosedReason,
  type ReturnEligibility,
} from "@/lib/returns";

import { useReturnWindowDays } from "../contract-queries";
import { isNotFound } from "../errors";
import { useOrder } from "../queries";
import { RETURN_CREATE_PERMISSION, returnableLines, type ReturnFormValues } from "../return-form";
import { isValidOrderId } from "../schemas";
import { deliveredAtOf } from "./order-completion-hint";
import { OrderDetailSkeleton, OrderLoadError } from "./order-states";
import { ReturnRequestForm } from "./return-request-form";

/** Why the customer cannot open a return themselves (BE `ReturnRequest.requireReturnable`). */
const CLOSED_TEXT: Record<ReturnClosedReason, (days: number) => string> = {
  NOT_DELIVERED: () =>
    "Chỉ gửi được yêu cầu trả hàng cho hàng đã giao tới bạn. Khi một lần giao của đơn đã đến, bạn có thể yêu cầu trả hàng của lần giao đó.",
  WINDOW_CLOSED: (days) =>
    `Đã quá hạn đổi / trả ${days} ngày kể từ ngày giao. Nếu hàng có lỗi phát hiện muộn, hãy chat với Sales.`,
  NOT_RETURNABLE: () =>
    "Đơn này đã được tất toán hoặc đã đóng. Hãy chat với Sales nếu bạn cần trả thêm hàng.",
};

/**
 * The delivery the form starts on: "" names none (the order's only delivery, or the order as a
 * whole); several deliveries start on the only one still in its window, else on none.
 */
function defaultDelivery(eligibility: ReturnEligibility): string | undefined {
  if (eligibility.kind !== "open") return undefined;
  if (!eligibility.needsChoice) return eligibility.shipments[0]?.shipmentId ?? "";
  const inWindow = eligibility.shipments.filter((shipment) => shipment.windowOpen);
  return inWindow.length === 1 ? (inWindow[0]?.shipmentId ?? undefined) : undefined;
}

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
          <Link href={STORE_ROUTES.chat.list}>{CHAT_WITH_SALES}</Link>
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
  const returnWindow = useReturnWindowDays(orderId);
  const orderLines = order.data?.lines;
  const orderShipments = order.data?.shipments;
  const linesOf = useCallback(
    (shipmentId: string | undefined) => {
      // Undefined: several deliveries and none chosen yet - every open return still counts.
      if (shipmentId === undefined) return returnableLines(orderLines ?? [], returns.data ?? []);
      // "" names the order's only delivery: the one the BE made up when none was recorded.
      const shipment = orderShipments?.find(
        (s) => s.status === "DELIVERED" && (s.shipmentId ?? "") === shipmentId,
      );
      return returnableLines(orderLines ?? [], returns.data ?? [], {
        shipmentId: shipmentId || null,
        lines: shipment?.lines,
      });
    },
    [orderLines, orderShipments, returns.data],
  );

  if (!valid || isNotFound(order.error)) notFound();
  if (
    order.isPending ||
    (returns.isPending && returns.fetchStatus !== "idle") ||
    returnWindow.isPending
  ) {
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
  const eligibility = returnEligibility(
    { status: current.status, shipments: current.shipments, deliveredAt: deliveredAtOf(current) },
    returnWindow.days,
  );
  const single =
    eligibility.kind === "open" && !eligibility.needsChoice ? eligibility.shipments[0] : undefined;
  const deliveredAt =
    eligibility.kind === "open" && !eligibility.needsChoice
      ? (single?.deliveredAt ?? eligibility.deliveredAt)
      : undefined;

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
        shipmentId: values.shipmentId || undefined,
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
          Hạn đổi / trả đến hết ngày{" "}
          {formatDate(lastReturnDay(deliveredAt, returnWindow.days).toISOString())}.
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
  if (eligibility.kind === "contactSales") {
    // Delivered in several shipments, but this BE names none of them: the customer cannot say
    // which delivery the goods came on (RETURN_SHIPMENT_REQUIRED), so Sales open it for them.
    return (
      <div className="space-y-5">
        {header}
        <Closed orderId={current.orderId}>
          Đơn này được giao làm nhiều lần nhưng chưa xác định được lần giao của hàng muốn trả. Vui
          lòng liên hệ Sale để được mở yêu cầu trả hàng.
        </Closed>
      </div>
    );
  }
  if (eligibility.kind === "closed") {
    return (
      <div className="space-y-5">
        {header}
        <Closed orderId={current.orderId}>
          {CLOSED_TEXT[eligibility.reason](returnWindow.days)}
        </Closed>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {header}
      <ReturnRequestForm
        linesOf={linesOf}
        shipments={eligibility.shipments}
        needsChoice={eligibility.needsChoice}
        defaultShipmentId={defaultDelivery(eligibility)}
        pending={open.isPending || uploading}
        error={open.error ? describeReturnError(open.error) : undefined}
        onSubmit={(values) => void submit(values)}
      />
    </div>
  );
}
