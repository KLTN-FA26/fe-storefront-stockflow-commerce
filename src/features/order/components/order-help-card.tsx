import Link from "next/link";
import { Hourglass, MessageCircle, Undo2 } from "lucide-react";

import { STORE_ROUTES } from "@/constants";
import { Alert } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { RETURN_WINDOW_DAYS, lastReturnDay } from "@/lib/domain/return-window";
import { formatDate } from "@/lib/format/date";

import { allowedCancellation, isCancellationRequestable, isOrderTerminal } from "../lifecycle";
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
  /** Where to open a return, when the order is delivered, in its window and the account may (17 §4.10). */
  returnHref?: string | null | undefined;
  /** The contract's complaint period in days, else the BE default (SF-UX-34). */
  windowDays?: number | undefined;
  /** When the goods were delivered, for the last day a return can be asked. */
  deliveredAt?: string | undefined;
}

type CancelMode = "cancel" | "request" | null;

/**
 * What cancelling this order looks like, the permission aside: the BE's allowedActions decide; a
 * request already waiting makes the BE answer requestCancellation=false, yet the order is still one
 * a request was made for, so it stays "request" (the card then shows the request as waiting).
 */
function cancellationOf(order: Order, requestPending: boolean): CancelMode {
  const fromBe = allowedCancellation(order.status, order.allowedActions);
  if (fromBe) return fromBe;
  return requestPending && isCancellationRequestable(order.status) ? "request" : null;
}

/**
 * "… trong 10 ngày kể từ ngày giao (đến hết 03/12/2026)": the contract's own period, not a fixed
 * seven days (SF-UX-34), and the last day when the delivery day is known.
 */
export function returnWindowText(days: number, deliveredAt: string | undefined): string {
  const until = deliveredAt
    ? ` (đến hết ${formatDate(lastReturnDay(deliveredAt, days).toISOString())})`
    : "";
  return `Hàng nhận được bị lỗi, hỏng hoặc giao sai? Gửi yêu cầu trả hàng kèm ảnh trong ${days} ngày kể từ ngày giao${until}.`;
}

function helpText(
  order: Order,
  mode: CancelMode,
  possible: CancelMode,
  mayCancel: boolean,
  returnWindow: { days: number; deliveredAt: string | undefined } | null,
) {
  if (returnWindow) return returnWindowText(returnWindow.days, returnWindow.deliveredAt);
  if (mode === "cancel") {
    return "Bạn có thể huỷ đơn khi đơn chưa chuyển cho kho hoặc sản xuất, hoặc chat với Sale nếu cần đổi thông tin.";
  }
  if (mode === "request") return requestReason(order.status, order.holdReasonPublic).help;
  if (possible !== null) {
    return mayCancel
      ? "Có thắc mắc về đơn này? Sale phụ trách đơn luôn sẵn sàng hỗ trợ qua chat."
      : "Tài khoản của bạn hiện không thể tự huỷ đơn. Hãy chat với Sale để được hỗ trợ.";
  }
  if (order.status === ORDER_STATUS_UNKNOWN) {
    return "Nếu bạn cần huỷ hoặc thay đổi đơn này, hãy chat với Sale.";
  }
  return isOrderTerminal(order.status)
    ? "Có thắc mắc về đơn này? Sale phụ trách đơn luôn sẵn sàng hỗ trợ qua chat."
    : "Đơn đã được đóng gói hoặc giao đi nên không thể huỷ. Nếu cần trả hàng, hãy chat với Sale.";
}

/**
 * Support first, cancellation second: cancelling is a quiet secondary action. The BE's
 * allowedActions decide what it will do — cancel at once or record a request Sales decide (since the
 * 4B rescope always a request: the order runs under a signed contract) — and the button says which.
 */
export function OrderHelpCard({
  order,
  onCancel,
  mayCancel,
  requestPending,
  returnHref,
  windowDays = RETURN_WINDOW_DAYS,
  deliveredAt,
}: OrderHelpCardProps) {
  const possible = cancellationOf(order, requestPending);
  const mode = mayCancel ? possible : null;

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
        <p className="text-ink-secondary mt-1 text-sm">
          {helpText(
            order,
            mode,
            possible,
            mayCancel,
            returnHref ? { days: windowDays, deliveredAt } : null,
          )}
        </p>
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
        {returnHref ? (
          <Button asChild variant="outline" className="min-h-11 rounded-[var(--r-md)] px-5">
            <Link href={returnHref}>
              <Undo2 aria-hidden className="mr-2 size-4" />
              Yêu cầu trả hàng
            </Link>
          </Button>
        ) : null}
        <Button asChild className="min-h-11 rounded-[var(--r-md)] px-5">
          <Link
            href={STORE_ROUTES.chat.about("ORDER", order.orderId)}
            aria-label={`Chat với Sale về đơn ${order.orderNumber}`}
          >
            <MessageCircle aria-hidden className="mr-2 size-4" />
            Chat với Sale
          </Link>
        </Button>
        {mode && !(requestPending && mode === "request") ? (
          <Button
            type="button"
            variant="outline"
            className="border-border-strong text-danger-ink hover:bg-bg-muted min-h-11 rounded-[var(--r-md)] px-5"
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
