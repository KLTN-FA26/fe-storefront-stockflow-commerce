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
        <Label key={method.id} htmlFor={`shipping-${method.id}`} className={cn("flex cursor-pointer items-center gap-4 rounded-xl border bg-bg-surface p-4 text-left transition duration-200", value === method.id ? "border-accent shadow-md" : "border-border-default")}>
          <RadioGroupItem id={`shipping-${method.id}`} value={method.id} />
          <Truck className="h-5 w-5 text-accent" />
          <span className="flex-1"><span className="block font-semibold">{method.name}</span><span className="text-sm text-ink-secondary">{method.eta}</span></span>
          <span className="font-semibold tabular-nums">{formatter.format(method.price)}</span>
        </Label>
      ))}
    </RadioGroup>
  );
}
