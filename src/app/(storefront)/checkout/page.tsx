"use client";

import { useState } from "react";
import { Copy, CreditCard, ShieldCheck, Truck } from "lucide-react";

import { useVietnamAddresses } from "@/hooks/use-vietnam-addresses";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/shared";
import { AddressForm } from "@/components/storefront/address-form";
import { CheckoutStepper } from "@/components/storefront/checkout-stepper";
import { OrderTotals } from "@/components/storefront/order-totals";
import { PaymentMethodSelector } from "@/components/storefront/payment-method-selector";
import { ShippingMethodSelector } from "@/components/storefront/shipping-method-selector";

const checkoutSteps = [
  { id: "cart", label: "Cart" },
  { id: "address", label: "Address" },
  { id: "ship", label: "Shipping" },
  { id: "pay", label: "Payment" },
  { id: "review", label: "Review" },
] as const;

export default function CheckoutPage() {
  const [address, setAddress] = useState({ name: "Nguyễn An", phone: "0900000000", province: "", ward: "", line1: "12 Nguyễn Huệ" });
  const [shipping, setShipping] = useState("standard");
  const [payment, setPayment] = useState("cod");
  const { provinces, wards, loading } = useVietnamAddresses(address.province);
  const addressReady = Boolean(address.name && address.phone && address.province && address.ward && address.line1);
  const shippingFee = shipping === "express" ? 60000 : 30000;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <section className="rounded-[var(--r-xl)] bg-bg-surface p-[var(--card-pad)] shadow-md">
        <Badge className="rounded-full bg-accent/10 text-accent hover:bg-accent/10">Secure checkout</Badge>
        <h1 className="mt-4 font-display text-4xl font-bold">Hoàn tất đơn hàng</h1>
        <p className="mt-2 max-w-2xl text-ink-secondary">Xác nhận địa chỉ, phương thức vận chuyển và thanh toán. Hệ thống không lưu dữ liệu thẻ đầy đủ.</p>
      </section>

      <CheckoutStepper currentStep="pay" completedSteps={["cart", "address", "ship"]} steps={[...checkoutSteps]} />

      <section className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-sm font-bold text-ink-inverse">1</span>
              <h2 className="font-display text-2xl font-bold">Thông tin nhận hàng</h2>
            </div>
            <AddressForm value={address} provinces={provinces} wards={wards} loading={loading} onChange={setAddress} />
          </div>

          <div className="space-y-3 rounded-[var(--r-xl)] bg-bg-surface p-[var(--card-pad)] shadow-md">
            <div className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-accent" />
              <h2 className="font-display text-2xl font-bold">Vận chuyển</h2>
            </div>
            <ShippingMethodSelector value={shipping} onChange={setShipping} methods={[{ id: "standard", name: "Tiêu chuẩn", eta: "2–4 ngày", price: 30000 }, { id: "express", name: "Nhanh", eta: "24 giờ", price: 60000 }]} />
          </div>

          <div className="space-y-3 rounded-[var(--r-xl)] bg-bg-surface p-[var(--card-pad)] shadow-md">
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-accent" />
              <h2 className="font-display text-2xl font-bold">Thanh toán</h2>
            </div>
            <PaymentMethodSelector value={payment} onChange={setPayment} methods={[{ id: "cod", label: "COD", description: "Thanh toán khi nhận hàng", type: "cod" }, { id: "bank", label: "Chuyển khoản", description: "Xác nhận thủ công sau khi nhận tiền", type: "bank" }, { id: "online", label: "Online", description: "Visa/Mastercard", type: "online", last4: "4242" }]} />
            {payment === "bank" && (
              <div className="rounded-[var(--r-lg)] border border-border-default bg-bg-subtle p-4 text-sm">
                <p className="font-semibold text-ink-primary">Thông tin chuyển khoản</p>
                <dl className="mt-3 grid gap-2 text-ink-secondary">
                  <div className="flex justify-between gap-3"><dt>Ngân hàng</dt><dd className="font-medium text-ink-primary">StockFlow Bank</dd></div>
                  <div className="flex justify-between gap-3"><dt>Chủ tài khoản</dt><dd className="font-medium text-ink-primary">STOCKFLOW COMMERCE</dd></div>
                  <div className="flex justify-between gap-3"><dt>Nội dung</dt><dd className="font-mono font-medium text-ink-primary">SO-2026-001</dd></div>
                </dl>
                <Button type="button" variant="secondary" size="sm" className="mt-3 rounded-full"><Copy className="h-4 w-4" /> Sao chép nội dung</Button>
              </div>
            )}
          </div>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <OrderTotals subtotal={627000} shipping={shippingFee} tax={0} discount={20000} />
          <Alert tone={addressReady ? "info" : "warning"} title={addressReady ? "Sẵn sàng đặt hàng" : "Thiếu thông tin địa chỉ"}>
            {addressReady ? "Địa chỉ và phương thức thanh toán đã sẵn sàng để giữ hàng." : "Chọn tỉnh/thành và phường/xã trước khi đặt hàng."}
          </Alert>
          <div className="rounded-[var(--r-xl)] bg-bg-surface p-[var(--card-pad)] shadow-md">
            <div className="flex gap-3 text-sm text-ink-secondary">
              <ShieldCheck className="h-5 w-5 shrink-0 text-positive" />
              <p>Thông tin thanh toán được xử lý an toàn. Storefront chỉ hiển thị brand và 4 số cuối khi cần.</p>
            </div>
            <Button className="mt-4 w-full rounded-full" disabled={!addressReady}>Giữ hàng và đặt hàng</Button>
          </div>
        </aside>
      </section>
    </div>
  );
}
