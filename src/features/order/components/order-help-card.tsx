import Link from "next/link";
import { Hourglass, MessageCircle } from "lucide-react";

import { STORE_ROUTES } from "@/constants";
import { Alert } from "@/components/shared";
import { Button } from "@/components/ui/button";

import { isCancellationRequestable, isOrderCancellable, isOrderTerminal } from "../lifecycle";
import { requestReason } from "../labels";
import { ORDER_STATUS_UNKNOWN } from "../schemas";
import type { Order } from "../types";

interface OrderHelpCardProps {
  order: Order;
  /** Opens the cancellation dialog in the mode the order's status calls for. */
  onCancel: (mode: "cancel" | "request") => void;
  /** The account still holds sales-orders:UPDATE (an admin can take it away from CUSTOMER). */
  mayCancel: boolean;
  /** A cancellation request this browser knows is waiting for Sales to decide. */
  requestPending: boolean;
}

function helpText(order: Order, mode: "cancel" | "request" | null, mayCancel: boolean) {
  if (mode === "cancel") {
    return "Bạn có thể huỷ đơn khi đơn chưa chuyển cho kho hoặc sản xuất, hoặc chat với chúng tôi nếu cần đổi thông tin.";
  }
  if (mode === "request") return requestReason(order.status, order.holdReasonPublic).help;
  if (isOrderCancellable(order.status) || isCancellationRequestable(order.status)) {
    return mayCancel
      ? "Có thắc mắc về đơn này? Đội chăm sóc khách hàng luôn sẵn sàng hỗ trợ."
      : "Tài khoản của bạn hiện không thể tự huỷ đơn. Hãy chat với chúng tôi để được hỗ trợ.";
  }
  if (order.status === ORDER_STATUS_UNKNOWN) {
    return "Nếu bạn cần huỷ hoặc thay đổi đơn này, hãy chat với chúng tôi.";
  }
  return isOrderTerminal(order.status)
    ? "Có thắc mắc về đơn này? Đội chăm sóc khách hàng luôn sẵn sàng hỗ trợ."
    : "Đơn đã được đóng gói hoặc giao đi nên không thể huỷ. Nếu cần trả hàng, hãy chat với chúng tôi.";
}

/**
 * Support first, cancellation second: cancelling is a quiet secondary action. The status decides
 * what the BE will do with it — cancel at once (DRAFT, PENDING_PAYMENT, CONFIRMED) or record a
 * request Sales decide (released to production or the warehouse) — and the button says which.
 */
export function OrderHelpCard({ order, onCancel, mayCancel, requestPending }: OrderHelpCardProps) {
  const mode = !mayCancel
    ? null
    : isOrderCancellable(order.status)
      ? "cancel"
      : isCancellationRequestable(order.status)
        ? "request"
        : null;

  return (
    <section
      aria-labelledby="order-help-heading"
      className="bg-bg-surface border-border-default space-y-3 rounded-[var(--r-lg)] border p-[var(--card-pad)] shadow-[var(--card-shadow)]"
    >
      <div>
        <h2
          id="order-help-heading"
          className="font-display text-ink-primary text-base font-semibold"
        >
          Cần hỗ trợ?
        </h2>
        <p className="text-ink-secondary mt-1 text-sm">{helpText(order, mode, mayCancel)}</p>
      </div>
      {requestPending && mode === "request" ? (
        <div role="status">
          <Alert tone="info" title="Đã gửi yêu cầu huỷ.">
            <Hourglass aria-hidden className="mr-1 inline size-3.5" />
            Sales đang xem xét. Đơn giữ nguyên trạng thái cho đến khi có quyết định, và chúng tôi sẽ
            liên hệ với bạn.
          </Alert>
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        <Button asChild className="min-h-11 rounded-[var(--r-md)] px-5">
          <Link href={STORE_ROUTES.chat.list}>
            <MessageCircle aria-hidden className="mr-2 size-4" />
            Chat với CSKH
          </Link>
        </Button>
        {mode && !(requestPending && mode === "request") ? (
          <Button
            type="button"
            variant="outline"
            className="border-border-strong text-danger hover:bg-bg-muted min-h-11 rounded-[var(--r-md)] px-5"
            onClick={() => onCancel(mode)}
            aria-label={`${mode === "cancel" ? "Huỷ đơn hàng" : "Gửi yêu cầu huỷ đơn hàng"} ${order.orderNumber}`}
          >
            {mode === "cancel" ? "Huỷ đơn hàng" : "Gửi yêu cầu huỷ"}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
