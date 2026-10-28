import Link from "next/link";
import { CopyCheck } from "lucide-react";

import { STORE_ROUTES } from "@/constants";
import { Alert } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format/date";

import type { DuplicateOrder } from "../checkout-errors";

interface CheckoutDuplicateNoticeProps {
  earlier: DuplicateOrder;
  /** Place the order anyway: the screen resends it with `confirmDuplicate`. */
  onConfirm: () => void;
  pending: boolean;
}

/**
 * SCRUM-190 (kltn-docs 14, "trùng đơn"): the customer placed the same lines a moment ago, so the
 * order is not created until they say they want another. They can look at the earlier order first.
 */
export function CheckoutDuplicateNotice({
  earlier,
  onConfirm,
  pending,
}: CheckoutDuplicateNoticeProps) {
  const when = earlier.placedAt ? ` lúc ${formatDateTime(earlier.placedAt)}` : "";
  return (
    <div role="alert" className="space-y-3">
      <Alert tone="warning" title="Đơn này có thể bị trùng.">
        {earlier.orderNumber ? (
          <>
            Bạn đã đặt đơn <span className="font-mono font-semibold">{earlier.orderNumber}</span>
            {when} với cùng sản phẩm và số lượng.
          </>
        ) : (
          <>Bạn vừa đặt một đơn có cùng sản phẩm và số lượng.</>
        )}{" "}
        Nếu bạn vẫn muốn đặt thêm một đơn nữa, hãy xác nhận bên dưới.
      </Alert>
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          className="min-h-11 w-full rounded-[var(--r-md)]"
          onClick={onConfirm}
          disabled={pending}
        >
          <CopyCheck aria-hidden className="mr-2 size-4" />
          {pending ? "Đang đặt hàng..." : "Vẫn đặt đơn"}
        </Button>
        {earlier.orderId ? (
          <Button asChild variant="outline" className="min-h-11 w-full rounded-[var(--r-md)]">
            <Link href={STORE_ROUTES.account.orders.detail(earlier.orderId)}>Xem đơn trước</Link>
          </Button>
        ) : (
          <Button asChild variant="outline" className="min-h-11 w-full rounded-[var(--r-md)]">
            <Link href={STORE_ROUTES.account.orders.list}>Xem đơn trước</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
