"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";

import { STORE_ROUTES } from "@/constants";
import { Alert, toast } from "@/components/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCartStore } from "@/lib/store/use-cart-store";

import { describeReorderError } from "../errors";
import { useReorderQuotedOrder } from "../mutations";
import {
  canRefillBasket,
  describeSkippedLine,
  planBasketReorder,
  reorderKindOf,
  type ReorderPlan,
} from "../reorder";
import type { Order } from "../types";

/** What was left out of the basket and why, in words the customer can act on. */
export function SkippedLines({ plan }: { plan: ReorderPlan }) {
  if (plan.skippedDesign.length === 0 && plan.skippedUnavailable.length === 0) return null;
  return (
    <Alert tone="warning" title="Một số sản phẩm không được đưa vào giỏ hàng.">
      <div className="space-y-2">
        {plan.skippedDesign.length > 0 ? (
          <div>
            <p>Sản phẩm in theo thiết kế cần Sale báo giá riêng:</p>
            <ul className="list-disc pl-5">
              {plan.skippedDesign.map((line) => (
                <li key={line.lineId}>{describeSkippedLine(line)}</li>
              ))}
            </ul>
            <p>
              <Link href={STORE_ROUTES.chat.list} className="text-accent font-medium underline">
                Liên hệ Sale báo giá
              </Link>
            </p>
          </div>
        ) : null}
        {plan.skippedUnavailable.length > 0 ? (
          <div>
            <p>Sản phẩm hiện không còn bán:</p>
            <ul className="list-disc pl-5">
              {plan.skippedUnavailable.map((line) => (
                <li key={line.lineId}>{describeSkippedLine(line)}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Alert>
  );
}

type Step = "closed" | "choose" | "done";

/**
 * "Đặt lại" on the order detail (SCRUM-190, owner decision REORDER). An order bought at the price
 * list goes back in the basket at today's prices (the cart reads price and stock live); one that
 * came from a quote asks Sales for a new quote. A basket that already has items asks first, in the
 * page, whether to merge or replace.
 */
export function OrderReorder({ order }: { order: Order }) {
  const kind = reorderKindOf(order);
  return kind === "quote" ? <QuotedReorder order={order} /> : <BasketReorder order={order} />;
}

function ReorderButton({
  onClick,
  pending,
  disabled,
  orderNumber,
}: {
  onClick: () => void;
  pending?: boolean;
  disabled?: boolean;
  orderNumber: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className="min-h-11 rounded-[var(--r-md)] px-5"
      onClick={onClick}
      disabled={disabled === true || pending === true}
      aria-label={`Đặt lại đơn hàng ${orderNumber}`}
    >
      <RotateCcw aria-hidden className="mr-2 size-4" />
      {pending ? "Đang gửi..." : "Đặt lại"}
    </Button>
  );
}

function BasketReorder({ order }: { order: Order }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("closed");
  const [added, setAdded] = useState(0);
  const basketSize = useCartStore((state) => state.lines.length);
  const plan = planBasketReorder(order);

  if (!canRefillBasket(order)) return null;

  const apply = (mode: "merge" | "replace") => {
    useCartStore.getState().addMany(plan.lines, mode);
    setAdded(plan.lines.length);
    if (plan.skippedDesign.length === 0 && plan.skippedUnavailable.length === 0) {
      toast.success(
        "Đã thêm vào giỏ hàng",
        `${plan.lines.length} sản phẩm từ đơn ${order.orderNumber}`,
      );
      setStep("closed");
      router.push(STORE_ROUTES.cart);
    } else {
      setStep("done");
    }
  };

  const start = () => {
    if (plan.lines.length === 0) {
      setAdded(0);
      setStep("done");
    } else if (basketSize > 0) {
      setStep("choose");
    } else {
      apply("replace");
    }
  };

  return (
    <>
      <ReorderButton onClick={start} orderNumber={order.orderNumber} />
      <Dialog open={step !== "closed"} onOpenChange={(open) => !open && setStep("closed")}>
        <DialogContent>
          {step === "choose" ? (
            <>
              <DialogHeader>
                <DialogTitle>Đặt lại đơn {order.orderNumber}</DialogTitle>
                <DialogDescription>
                  Giỏ hàng của bạn đang có {basketSize} sản phẩm. Bạn muốn thêm {plan.lines.length}{" "}
                  sản phẩm của đơn này vào giỏ hiện có, hay thay thế giỏ hàng? Giá và tồn kho được
                  cập nhật theo bảng giá hiện tại.
                </DialogDescription>
              </DialogHeader>
              <SkippedLines plan={plan} />
              <DialogFooter className="gap-2 sm:gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-11"
                  onClick={() => setStep("closed")}
                >
                  Huỷ
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  onClick={() => apply("replace")}
                >
                  Thay thế giỏ hàng
                </Button>
                <Button type="button" className="min-h-11" onClick={() => apply("merge")}>
                  Gộp vào giỏ hiện có
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>
                  {added > 0
                    ? `Đã thêm ${added} sản phẩm vào giỏ hàng`
                    : "Không có sản phẩm nào để đặt lại"}
                </DialogTitle>
                <DialogDescription>
                  {added > 0
                    ? "Giá và tồn kho được cập nhật theo bảng giá hiện tại, bạn sẽ thấy ngay trong giỏ hàng."
                    : `Đơn ${order.orderNumber} không có sản phẩm nào đặt lại được trực tiếp.`}
                </DialogDescription>
              </DialogHeader>
              <SkippedLines plan={plan} />
              <DialogFooter className="gap-2 sm:gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-11"
                  onClick={() => setStep("closed")}
                >
                  Ở lại đơn hàng
                </Button>
                {added > 0 ? (
                  <Button asChild className="min-h-11">
                    <Link href={STORE_ROUTES.cart}>Đến giỏ hàng</Link>
                  </Button>
                ) : null}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function QuotedReorder({ order }: { order: Order }) {
  const reorder = useReorderQuotedOrder();
  // One key per screen visit: a retried click returns the same draft instead of drafting another.
  const requestId = useRef<string>(undefined);
  const quoted = reorder.data;

  const submit = () => {
    requestId.current ??= crypto.randomUUID();
    reorder.mutate({ orderId: order.orderId, requestId: requestId.current });
  };

  return (
    <div className="space-y-3 sm:max-w-sm">
      <ReorderButton
        onClick={submit}
        pending={reorder.isPending}
        disabled={reorder.isSuccess}
        orderNumber={order.orderNumber}
      />
      {quoted ? (
        <div role="status">
          <Alert tone="info" title="Đã gửi yêu cầu đặt lại">
            Sale sẽ gửi báo giá mới
            {quoted.quoteNumber ? ` (báo giá ${quoted.quoteNumber})` : ""}. Đơn cũ không bị thay đổi
            và giá được tính lại theo bảng giá hiện tại.
          </Alert>
        </div>
      ) : null}
      {reorder.error ? (
        <div role="alert">
          <Alert tone="danger" title="Không gửi được yêu cầu đặt lại.">
            {describeReorderError(reorder.error)}
          </Alert>
        </div>
      ) : null}
    </div>
  );
}
