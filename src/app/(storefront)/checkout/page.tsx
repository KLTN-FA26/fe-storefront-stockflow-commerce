"use client";

import { useState } from "react";
import { CreditCard, ShieldCheck, Truck } from "lucide-react";

import { useVietnamAddresses } from "@/hooks/use-vietnam-addresses";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/shared";
import { AddressForm } from "@/components/storefront/address-form";
// TODO(SCRUM-375-followup): checkout currently uses the local guest AddressForm
// (value/onChange, no BE call). When user is authenticated, offer to pick from
// saved addresses via `features/customer` (useAddressBook / AddressBook) and persist
// through `createAddress`. Guest flow keeps this local form. See also
// `components/storefront/address-form.tsx` — keep phone/ward validation in sync
// with `features/customer/address/schemas.ts` until the two forms are unified.
import { CheckoutStepper } from "@/components/storefront/checkout-stepper";
import {
  BankTransferDetails,
  CheckoutStepHeading,
} from "@/components/storefront/checkout/checkout-panels";
import { PageShell, SurfaceCard } from "@/components/storefront/layout";
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
  const [address, setAddress] = useState({
    name: "Nguyễn An",
    phone: "0900000000",
    province: "",
    ward: "",
    line1: "12 Nguyễn Huệ",
  });
  const [shipping, setShipping] = useState("standard");
  const [payment, setPayment] = useState("cod");
  const { provinces, wards, loading } = useVietnamAddresses(address.province);
  const addressReady = Boolean(
    address.name && address.phone && address.province && address.ward && address.line1,
  );
  const shippingFee = shipping === "express" ? 60000 : 30000;

  return (
    <PageShell
      title="Hoàn tất đơn hàng"
      subtitle="Xác nhận địa chỉ, phương thức vận chuyển và thanh toán. Hệ thống không lưu dữ liệu thẻ đầy đủ."
    >
      <div className="space-y-6">
        <CheckoutStepper
          currentStep="pay"
          completedSteps={["cart", "address", "ship"]}
          steps={[...checkoutSteps]}
        />

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22.5rem] lg:gap-8">
          <div className="min-w-0 space-y-4">
            <div className="space-y-3">
              <CheckoutStepHeading
                title="Thông tin nhận hàng"
                marker={
                  <span className="bg-accent text-ink-inverse flex size-7 items-center justify-center rounded-full text-sm font-bold">
                    1
                  </span>
                }
              />
              <AddressForm
                value={address}
                provinces={provinces}
                wards={wards}
                loading={loading}
                onChange={setAddress}
              />
            </div>

            <SurfaceCard className="space-y-3">
              <CheckoutStepHeading
                title="Vận chuyển"
                marker={<Truck className="text-accent h-5 w-5" />}
              />
              <ShippingMethodSelector
                value={shipping}
                onChange={setShipping}
                methods={[
                  { id: "standard", name: "Tiêu chuẩn", eta: "2–4 ngày", price: 30000 },
                  { id: "express", name: "Nhanh", eta: "24 giờ", price: 60000 },
                ]}
              />
            </SurfaceCard>

            <SurfaceCard className="space-y-3">
              <CheckoutStepHeading
                title="Thanh toán"
                marker={<CreditCard className="text-accent h-5 w-5" />}
              />
              <PaymentMethodSelector
                value={payment}
                onChange={setPayment}
                methods={[
                  { id: "cod", label: "COD", description: "Thanh toán khi nhận hàng", type: "cod" },
                  {
                    id: "bank",
                    label: "Chuyển khoản",
                    description: "Xác nhận thủ công sau khi nhận tiền",
                    type: "bank",
                  },
                  {
                    id: "online",
                    label: "Online",
                    description: "Visa/Mastercard",
                    type: "online",
                    last4: "4242",
                  },
                ]}
              />
              {payment === "bank" && <BankTransferDetails />}
            </SurfaceCard>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-[var(--sticky-top)] lg:self-start">
            <OrderTotals subtotal={627000} shipping={shippingFee} tax={0} discount={20000} />
            <Alert
              tone={addressReady ? "info" : "warning"}
              title={addressReady ? "Sẵn sàng đặt hàng" : "Thiếu thông tin địa chỉ"}
            >
              {addressReady
                ? "Địa chỉ và phương thức thanh toán đã sẵn sàng để giữ hàng."
                : "Chọn tỉnh/thành và phường/xã trước khi đặt hàng."}
            </Alert>
            <SurfaceCard>
              <div className="text-ink-secondary flex gap-3 text-sm">
                <ShieldCheck className="text-positive h-5 w-5 shrink-0" />
                <p>
                  Thông tin thanh toán được xử lý an toàn. Storefront chỉ hiển thị brand và 4 số
                  cuối khi cần.
                </p>
              </div>
              <Button
                className="mt-4 min-h-11 w-full rounded-[var(--r-md)]"
                disabled={!addressReady}
              >
                Giữ hàng và đặt hàng
              </Button>
            </SurfaceCard>
          </aside>
        </section>
      </div>
    </PageShell>
  );
}
