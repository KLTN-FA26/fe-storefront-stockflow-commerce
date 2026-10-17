import Link from "next/link";
import { MessageCircle } from "lucide-react";

import { STORE_ROUTES } from "@/constants";
import { Alert } from "@/components/shared";
import { Button } from "@/components/ui/button";

import { isOrderCancellable, isOrderTerminal } from "../lifecycle";
import { ORDER_STATUS_UNKNOWN } from "../schemas";
import type { Order } from "../types";

interface OrderHelpCardProps {
  order: Order;
  cancelling: boolean;
  onCancel: () => void;
  /** The account still holds sales-orders:UPDATE (an admin can take it away from CUSTOMER). */
  mayCancel: boolean;
  /** Why the last cancel attempt failed, shown beside the button the customer just used. */
  cancelError?: string | undefined;
}

/**
 * Support first, cancellation second: cancelling is a quiet secondary action, and when the BE
 * would not let the customer do it alone (released to production or the warehouse, BR-031) the card explains why and points to support instead.
 */
export function OrderHelpCard({
  order,
  cancelling,
  onCancel,
  mayCancel,
  cancelError,
}: OrderHelpCardProps) {
  const statusAllows = isOrderCancellable(order.status);
  const cancellable = statusAllows && mayCancel;

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
          {cancellable
            ? "Bạn có thể huỷ đơn khi đơn chưa chuyển cho kho, hoặc chat với chúng tôi nếu cần đổi thông tin."
            : statusAllows
              ? "Tài khoản của bạn hiện không thể tự huỷ đơn. Hãy chat với chúng tôi để được hỗ trợ."
              : order.status === ORDER_STATUS_UNKNOWN
                ? "Nếu bạn cần huỷ hoặc thay đổi đơn này, hãy chat với chúng tôi."
                : isOrderTerminal(order.status)
                  ? "Có thắc mắc về đơn này? Đội chăm sóc khách hàng luôn sẵn sàng hỗ trợ."
                  : "Đơn đã chuyển cho kho hoặc đơn vị vận chuyển nên không thể tự huỷ. Nếu cần huỷ hoặc trả hàng, hãy chat với chúng tôi."}
        </p>
      </div>
      {cancelError && (
        <div role="alert">
          <Alert tone="danger" title="Không huỷ được đơn hàng">
            {cancelError}
          </Alert>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <Button asChild className="min-h-11 rounded-[var(--r-md)] px-5">
          <Link href={STORE_ROUTES.chat.list}>
            <MessageCircle aria-hidden className="mr-2 size-4" />
            Chat với CSKH
          </Link>
        </Button>
        {cancellable && (
          <Button
            type="button"
            variant="outline"
            className="border-border-strong text-danger hover:bg-bg-muted min-h-11 rounded-[var(--r-md)] px-5"
            onClick={onCancel}
            disabled={cancelling}
            aria-label={`Huỷ đơn hàng ${order.orderNumber}`}
          >
            {cancelling ? "Đang huỷ..." : "Huỷ đơn hàng"}
          </Button>
        )}
      </div>
    </section>
  );
}
