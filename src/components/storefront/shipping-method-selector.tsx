"use client";

import { Truck } from "lucide-react";
import { cn } from "cn";

import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface ShippingMethod {
  id: string;
  name: string;
  eta: string;
  price: number;
}

interface ShippingMethodSelectorProps {
  methods: ShippingMethod[];
  value?: string;
  onChange: (id: string) => void;
}

export function ShippingMethodSelector({ methods, value, onChange }: ShippingMethodSelectorProps) {
  const formatter = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" });

  return (
    <RadioGroup {...(value ? { value } : {})} onValueChange={onChange} className="grid gap-3">
      {methods.map((method) => (
        <Label
          key={method.id}
          htmlFor={`shipping-${method.id}`}
          className={cn(
            "bg-bg-surface hover:border-border-strong focus-within:ring-accent flex min-h-11 cursor-pointer items-center gap-3 rounded-[var(--r-md)] border p-3 text-left transition-colors duration-200 focus-within:ring-2 sm:gap-4 sm:p-4",
            value === method.id ? "border-accent bg-accent/5" : "border-border-default",
          )}
        >
          <RadioGroupItem id={`shipping-${method.id}`} value={method.id} />
          <Truck className="text-accent h-5 w-5 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{method.name}</span>
            <span className="text-ink-secondary text-sm">{method.eta}</span>
          </span>
          <span className="font-semibold tabular-nums">{formatter.format(method.price)}</span>
        </Label>
      ))}
    </RadioGroup>
  );
}
