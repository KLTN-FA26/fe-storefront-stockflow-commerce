"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, PackageCheck, ShieldAlert } from "lucide-react";

import { STORE_ROUTES } from "@/constants";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, EmptyState } from "@/components/shared";
import { CartLineItem } from "@/components/storefront/cart-line-item";
import { OrderTotals } from "@/components/storefront/order-totals";
import { VoucherInput } from "@/components/storefront/voucher-input";

interface CartLine {
  id: string;
  name: string;
  imageSrc: string;
  variant: string;
  price: number;
  maxQuantity: number;
  unavailableReason?: string;
}

const cartLines: CartLine[] = [
  { id: "line-1", name: "Áo thun cotton premium", imageSrc: "/logo.png", variant: "Ink · Size M · design-001", price: 249000, maxQuantity: 24 },
  { id: "line-2", name: "Túi canvas in logo", imageSrc: "/logo.png", variant: "Natural · Logo thương hiệu", price: 189000, maxQuantity: 12 },
  { id: "line-3", name: "Sticker pack thương hiệu", imageSrc: "/logo.png", variant: "Set 50 · Cán mờ", price: 79000, maxQuantity: 0, unavailableReason: "Hết tồn kho, cần xoá hoặc đổi sản phẩm để checkout." },
];

export default function CartPage() {
  const [quantities, setQuantities] = useState<Record<string, number>>({ "line-1": 1, "line-2": 2, "line-3": 1 });
  const visibleLines = cartLines.filter((line) => (quantities[line.id] ?? 0) > 0);
  const subtotal = visibleLines.reduce((sum, line) => sum + line.price * (quantities[line.id] ?? 0), 0);
  const hasBlockedLine = visibleLines.some((line) => line.unavailableReason);
  const canCheckout = visibleLines.length > 0 && !hasBlockedLine;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <section className="flex flex-col gap-4 rounded-[var(--r-xl)] bg-bg-surface p-[var(--card-pad)] shadow-md sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge className="rounded-full bg-accent/10 text-accent hover:bg-accent/10">Cart & checkout</Badge>
          <h1 className="mt-4 font-display text-4xl font-bold">Giỏ hàng</h1>
          <p className="mt-2 text-ink-secondary">Kiểm tra tồn kho, voucher và tổng tiền trước khi giữ hàng.</p>
        </div>
        <div className="rounded-full bg-bg-subtle px-4 py-2 text-sm text-ink-secondary">
          {visibleLines.length} dòng sản phẩm
        </div>
      </section>

      {visibleLines.length === 0 ? (
        <EmptyState title="Giỏ hàng trống" description="Khám phá catalog để thêm sản phẩm in ấn vào giỏ." action={<Button asChild className="rounded-full"><Link href={STORE_ROUTES.catalog.list}>Khám phá sản phẩm</Link></Button>} />
      ) : (
        <section className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <div className="space-y-4">
            <Alert tone={hasBlockedLine ? "danger" : "warning"} title={hasBlockedLine ? "Có sản phẩm đang chặn checkout" : "Giá có thể thay đổi"}>
              {hasBlockedLine ? "Xoá hoặc đổi sản phẩm hết tồn trước khi tiếp tục thanh toán." : "Hệ thống sẽ xác nhận lại giá và tồn kho ở bước checkout."}
            </Alert>
            {visibleLines.map((line) => (
              <CartLineItem
                key={line.id}
                name={line.name}
                imageSrc={line.imageSrc}
                variant={line.variant}
                price={line.price}
                quantity={quantities[line.id] ?? 0}
                maxQuantity={line.maxQuantity}
                {...(line.unavailableReason ? { unavailableReason: line.unavailableReason } : {})}
                onQuantityChange={(quantity) => setQuantities((current) => ({ ...current, [line.id]: quantity }))}
                onRemove={() => setQuantities((current) => ({ ...current, [line.id]: 0 }))}
              />
            ))}
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <VoucherInput onApply={() => undefined} />
            <OrderTotals subtotal={subtotal} shipping={30000} tax={0} discount={20000} />
            <div className="rounded-[var(--r-xl)] bg-bg-surface p-[var(--card-pad)] shadow-md">
              <div className="flex gap-3 text-sm text-ink-secondary">
                {hasBlockedLine ? <ShieldAlert className="h-5 w-5 shrink-0 text-danger" /> : <PackageCheck className="h-5 w-5 shrink-0 text-positive" />}
                <p>{canCheckout ? "Sản phẩm đủ điều kiện để chuyển sang checkout." : "Checkout bị khóa cho đến khi giỏ hàng hợp lệ."}</p>
              </div>
              <Button asChild={canCheckout} className="mt-4 w-full rounded-full" disabled={!canCheckout}>
                {canCheckout ? <Link href={STORE_ROUTES.checkout.index}>Tiếp tục checkout <ArrowRight className="h-4 w-4" /></Link> : <span>Tiếp tục checkout</span>}
              </Button>
            </div>
          </aside>
        </section>
      )}
    </div>
  );
}
