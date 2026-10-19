"use client";

import Link from "next/link";
import { ArrowRight, PackageCheck, RefreshCw, ShieldAlert } from "lucide-react";

import { APP_ROUTES, STORE_ROUTES } from "@/constants";
import { Alert, EmptyState, Skeleton } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { CartLineItem } from "@/components/storefront/cart-line-item";
import { SurfaceCard } from "@/components/storefront/layout";
import { OrderTotals } from "@/components/storefront/order-totals";
import { describeApiError } from "@/lib/api/describe-error";
import { useSignedIn } from "@/lib/auth/use-signed-in";
import { useCartStore } from "@/lib/store/use-cart-store";

import { ISSUE_MESSAGE } from "../selectors";
import { useCartView } from "../use-cart-view";

function CartSkeleton() {
  return (
    <div role="status" aria-label="Đang tải giỏ hàng" className="space-y-4">
      <Skeleton className="h-28 w-full rounded-[var(--r-lg)]" />
      <Skeleton className="h-28 w-full rounded-[var(--r-lg)]" />
    </div>
  );
}

const EmptyCart = () => (
  <EmptyState
    title="Giỏ hàng trống"
    description="Chọn sản phẩm trong danh mục, đặt số lượng rồi quay lại đây để đặt hàng."
    action={
      <Button asChild className="min-h-11 rounded-[var(--r-md)]">
        <Link href={STORE_ROUTES.catalog.list}>Xem sản phẩm</Link>
      </Button>
    }
  />
);

export function CartScreen() {
  const signedIn = useSignedIn();
  const { hydrated, view, status, error, isFetching, refetch } = useCartView(signedIn === true);
  const setQuantity = useCartStore((state) => state.setQuantity);
  const remove = useCartStore((state) => state.remove);

  if (signedIn === undefined || !hydrated) return <CartSkeleton />;
  if (view.lines.length === 0) return <EmptyCart />;
  if (!signedIn) {
    return (
      <EmptyState
        title="Đăng nhập để xem giỏ hàng"
        description="Giá riêng và tồn kho chỉ hiển thị cho khách sỉ đã đăng nhập."
        action={
          <Button asChild className="min-h-11 rounded-[var(--r-md)] px-5">
            <Link href={APP_ROUTES.login}>Đăng nhập</Link>
          </Button>
        }
      />
    );
  }

  // Until the price list and stock are known, nothing can be checked, so the cart is not
  // orderable. A failed read says so instead of showing every line as "no price".
  const canCheckout = status === "ready" && !view.blocked;
  const showIssues = status === "ready";

  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22.5rem] lg:gap-8">
      <div className="min-w-0 space-y-4">
        {status === "restricted" || status === "error" ? (
          <div role="alert" className="space-y-3">
            <Alert tone="danger" title="Chưa kiểm tra được giá và tồn kho.">
              {status === "restricted"
                ? "Chỉ tài khoản khách hàng đã kích hoạt mới đặt hàng được."
                : describeApiError(error)}
            </Alert>
            {status === "error" ? (
              <Button
                type="button"
                variant="outline"
                className="min-h-11 rounded-[var(--r-md)] px-4"
                disabled={isFetching}
                onClick={() => void refetch()}
              >
                <RefreshCw aria-hidden className="mr-2 size-4" />
                {isFetching ? "Đang thử lại..." : "Thử lại"}
              </Button>
            ) : null}
          </div>
        ) : (
          <Alert
            tone={showIssues && view.blocked ? "danger" : "warning"}
            title={
              showIssues && view.blocked ? "Có sản phẩm đang chặn đặt hàng" : "Giá có thể thay đổi"
            }
          >
            {showIssues && view.blocked
              ? "Xử lý các dòng báo đỏ bên dưới trước khi tiếp tục."
              : "Giá và tồn kho được kiểm tra lại khi bạn đặt hàng."}
          </Alert>
        )}
        <SurfaceCard padded={false} className="divide-border-default divide-y">
          {view.lines.map((row) => (
            <CartLineItem
              key={row.line.sku}
              name={row.line.title}
              imageSrc={row.line.imageUrl}
              variant={row.line.sku}
              quantity={row.line.quantity}
              total={row.lineTotal}
              unitPrice={row.unitPrice}
              minQuantity={row.schedule?.moq}
              issue={
                showIssues && row.issue ? ISSUE_MESSAGE[row.issue](row.schedule?.moq) : undefined
              }
              onQuantityChange={(quantity) => setQuantity(row.line.sku, quantity)}
              onRemove={() => remove(row.line.sku)}
            />
          ))}
        </SurfaceCard>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-[var(--sticky-top)] lg:self-start">
        <OrderTotals
          subtotal={view.subtotal}
          note="Đây là tổng giá hàng theo bảng giá của bạn. Giá cuối cùng được xác nhận khi đặt hàng."
        />
        <SurfaceCard>
          <div className="text-ink-secondary flex gap-3 text-sm">
            {canCheckout ? (
              <PackageCheck className="text-positive h-5 w-5 shrink-0" />
            ) : (
              <ShieldAlert className="text-danger h-5 w-5 shrink-0" />
            )}
            <p>
              {canCheckout
                ? "Sản phẩm đủ điều kiện để chuyển sang đặt hàng."
                : status === "loading"
                  ? "Đang kiểm tra giá và tồn kho…"
                  : "Đặt hàng bị khoá cho đến khi giỏ hàng hợp lệ."}
            </p>
          </div>
          <Button
            asChild={canCheckout}
            className="mt-4 min-h-11 w-full rounded-[var(--r-md)]"
            disabled={!canCheckout}
          >
            {canCheckout ? (
              <Link href={STORE_ROUTES.checkout.index}>
                Tiếp tục đặt hàng <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <span>Tiếp tục đặt hàng</span>
            )}
          </Button>
        </SurfaceCard>
      </aside>
    </section>
  );
}
