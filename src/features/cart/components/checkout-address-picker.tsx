"use client";

import Link from "next/link";
import { MapPin, Plus } from "lucide-react";
import { cn } from "cn";

import { STORE_ROUTES } from "@/constants";
import { Alert } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

import type { ShippingAddressOption } from "../checkout-types";

interface CheckoutAddressPickerProps {
  addresses: ShippingAddressOption[];
  value: string | undefined;
  onChange: (addressId: string) => void;
}

/**
 * Where the order is delivered: one of the customer's saved SHIPPING addresses (kltn-docs 14
 * §4.3 step 10). The BE takes the address id, not the text, so there is no free-form address here.
 */
export function CheckoutAddressPicker({ addresses, value, onChange }: CheckoutAddressPickerProps) {
  if (addresses.length === 0) {
    return (
      <div className="space-y-3">
        <Alert tone="warning" title="Bạn chưa có địa chỉ giao hàng.">
          Thêm địa chỉ trong sổ địa chỉ để có thể đặt hàng.
        </Alert>
        <Button asChild className="min-h-11 rounded-[var(--r-md)] px-5">
          <Link href={STORE_ROUTES.account.addresses}>
            <Plus aria-hidden className="mr-2 size-4" />
            Thêm địa chỉ giao hàng
          </Link>
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <RadioGroup
        {...(value ? { value } : {})}
        onValueChange={onChange}
        className="grid gap-3"
        aria-label="Địa chỉ giao hàng"
      >
        {addresses.map((address) => (
          <Label
            key={address.addressId}
            htmlFor={`ship-${address.addressId}`}
            className={cn(
              "bg-bg-surface hover:border-border-strong focus-within:ring-accent flex min-h-11 cursor-pointer items-start gap-3 rounded-[var(--r-md)] border p-3 text-left font-normal transition-colors focus-within:ring-2 sm:p-4",
              value === address.addressId ? "border-accent bg-accent/5" : "border-border-default",
            )}
          >
            <RadioGroupItem
              id={`ship-${address.addressId}`}
              value={address.addressId}
              className="mt-1"
            />
            <MapPin aria-hidden className="text-accent mt-0.5 size-5 shrink-0" />
            <span className="min-w-0 flex-1 text-sm">
              <span className="text-ink-primary block font-semibold">
                {address.recipientName}
                <span className="text-ink-secondary font-normal tabular-nums">
                  {" "}
                  · {address.phone}
                </span>
                {address.isDefault ? (
                  <span className="bg-accent/10 text-accent ml-2 rounded-full px-2 py-0.5 text-xs font-medium">
                    Mặc định
                  </span>
                ) : null}
              </span>
              <span className="text-ink-secondary block">{address.summary}</span>
            </span>
          </Label>
        ))}
      </RadioGroup>
      <Link
        href={STORE_ROUTES.account.addresses}
        className="text-accent focus-visible:ring-accent inline-flex min-h-11 items-center gap-1 rounded-[var(--r-md)] text-sm font-semibold hover:underline focus-visible:ring-2 focus-visible:outline-none"
      >
        Quản lý sổ địa chỉ
      </Link>
    </div>
  );
}
