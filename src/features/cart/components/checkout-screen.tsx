"use client";

import { useState } from "react";
import Link from "next/link";
import { CreditCard, RefreshCw, ShieldCheck } from "lucide-react";

import { APP_ROUTES, STORE_ROUTES } from "@/constants";
import { Alert, EmptyState, Skeleton } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { SurfaceCard } from "@/components/storefront/layout";
import { OrderTotals } from "@/components/storefront/order-totals";
import { describeApiError } from "@/lib/api/describe-error";
import { useSignedIn } from "@/lib/auth/use-signed-in";
import { useCartStore } from "@/lib/store/use-cart-store";

import { describeCheckoutError } from "../checkout-errors";
import { usePlaceOrder } from "../checkout-mutations";
import type { PlacedOrder } from "../checkout-schemas";
import type { CheckoutCustomer } from "../checkout-types";
import { ISSUE_MESSAGE } from "../selectors";
import { useCartView } from "../use-cart-view";
import { forgetRequestId, requestIdFor } from "../request-id";
import { CheckoutAddressPicker } from "./checkout-address-picker";
import { CheckoutLines } from "./checkout-lines";
import { OrderPlacedPanel } from "./order-placed-panel";

const Heading = ({ children }: { children: string }) => (
  <h2 className="font-display text-ink-primary text-lg font-bold sm:text-xl">{children}</h2>
);

function Gate({
  title,
  description,
  href,
  label,
}: {
  title: string;
  description: string;
  href: string;
  label: string;
}) {
  return (
    <EmptyState
      title={title}
      description={description}
      action={
        <Button asChild className="min-h-11 rounded-[var(--r-md)] px-5">
          <Link href={href}>{label}</Link>
        </Button>
      }
    />
  );
}

export function CheckoutScreen({ customer }: { customer: CheckoutCustomer }) {
  const signedIn = useSignedIn();
  const { hydrated, view, status } = useCartView(signedIn === true);
  const place = usePlaceOrder();
  const [placed, setPlaced] = useState<PlacedOrder>();
  const [pickedAddress, setPickedAddress] = useState<string>();

  const addresses = customer.addresses ?? [];
  const addressId =
    (pickedAddress && addresses.some((a) => a.addressId === pickedAddress)
      ? pickedAddress
      : undefined) ??
    addresses.find((a) => a.isDefault)?.addressId ??
    addresses[0]?.addressId;

  const lines = view.lines.map((row) => ({
    sku: row.line.sku,
    quantity: row.line.quantity,
    unitPrice: row.unitPrice ?? 0,
  }));
  const contentKey = JSON.stringify([customer.customerId, addressId, lines]);

  if (placed) return <OrderPlacedPanel order={placed} />;
  if (signedIn === undefined || !hydrated || customer.isLoading) {
    return (
      <Skeleton role="status" aria-label="Đang tải" className="h-64 w-full rounded-[var(--r-lg)]" />
    );
  }
  if (view.lines.length === 0) {
    return (
      <Gate
        title="Giỏ hàng trống"
        description="Hãy thêm sản phẩm vào giỏ trước khi đặt hàng."
        href={STORE_ROUTES.catalog.list}
        label="Xem sản phẩm"
      />
    );
  }
  if (!signedIn) {
    return (
      <Gate
        title="Đăng nhập để đặt hàng"
        description="Chỉ khách sỉ đã đăng nhập mới đặt hàng được."
        href={APP_ROUTES.login}
        label="Đăng nhập"
      />
    );
  }

  const blockedLine = view.lines.find((row) => row.issue);
  const ready =
    status === "ready" && !view.blocked && Boolean(customer.customerId) && Boolean(addressId);

  const submit = () => {
    if (!ready || !customer.customerId || !addressId) return;
    place.mutate(
      {
        requestId: requestIdFor(contentKey),
        customerId: customer.customerId,
        shippingAddressId: addressId,
        lines,
      },
      {
        // Show the order and empty the cart in one step: emptied first, the screen would flash
        // "Giỏ hàng trống". If this screen is gone by now the cart stays, and ordering it again
        // reuses the same key, so the BE hands back this order instead of placing a second.
        onSuccess: (order) => {
          setPlaced(order);
          forgetRequestId();
          useCartStore.getState().clear();
        },
      },
    );
  };

  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22.5rem] lg:gap-8">
      <div className="min-w-0 space-y-4">
        <SurfaceCard className="space-y-3">
          <Heading>Địa chỉ giao hàng</Heading>
          {customer.error ? (
            <div className="space-y-3" role="alert">
              <Alert tone="danger" title="Không tải được sổ địa chỉ.">
                {describeApiError(customer.error)}
              </Alert>
              <Button
                type="button"
                variant="outline"
                className="min-h-11 rounded-[var(--r-md)] px-4"
                onClick={customer.onRetry}
              >
                <RefreshCw aria-hidden className="mr-2 size-4" />
                Thử lại
              </Button>
            </div>
          ) : (
            <CheckoutAddressPicker
              addresses={addresses}
              value={addressId}
              onChange={setPickedAddress}
            />
          )}
        </SurfaceCard>

        <CheckoutLines lines={view.lines} />

        <SurfaceCard className="space-y-2">
          <div className="flex items-center gap-2">
            <CreditCard aria-hidden className="text-accent size-5" />
            <Heading>Thanh toán</Heading>
          </div>
          <p className="text-ink-secondary text-sm">
            Đơn được thanh toán theo điều khoản đã thoả thuận với Sales cho tài khoản của bạn (trả
            trước, đặt cọc hoặc công nợ). Sau khi đặt, đơn hàng cho biết số tiền cần thanh toán.
          </p>
        </SurfaceCard>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-[var(--sticky-top)] lg:self-start">
        <OrderTotals
          subtotal={view.subtotal}
          note="Giá cuối cùng được xác nhận khi đặt hàng; nếu giá đã đổi, bạn sẽ được báo trước khi đơn được tạo."
        />
        {place.error ? (
          <div role="alert">
            <Alert tone="danger" title="Không đặt được hàng.">
              {describeCheckoutError(place.error)}
            </Alert>
          </div>
        ) : blockedLine?.issue ? (
          <Alert tone="danger" title={`${blockedLine.line.title}:`}>
            {ISSUE_MESSAGE[blockedLine.issue](blockedLine.schedule?.moq)}
          </Alert>
        ) : null}
        <SurfaceCard>
          <div className="text-ink-secondary flex gap-3 text-sm">
            <ShieldCheck className="text-positive h-5 w-5 shrink-0" aria-hidden />
            <p>Khi đặt hàng, tồn kho được giữ ngay cho đơn của bạn.</p>
          </div>
          <Button
            className="mt-4 min-h-11 w-full rounded-[var(--r-md)]"
            disabled={!ready || place.isPending}
            onClick={submit}
          >
            {place.isPending ? "Đang đặt hàng..." : "Đặt hàng"}
          </Button>
          {place.error ? (
            <Button asChild variant="ghost" className="mt-2 min-h-11 w-full rounded-[var(--r-md)]">
              <Link href={STORE_ROUTES.cart}>Quay lại giỏ hàng</Link>
            </Button>
          ) : null}
        </SurfaceCard>
      </aside>
    </section>
  );
}
