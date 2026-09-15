"use client";

import { CreditCard, Landmark, Wallet } from "lucide-react";
import { cn } from "cn";

import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface PaymentMethod {
  id: string;
  label: string;
  description: string;
  type: "cod" | "bank" | "online";
  last4?: string;
}

interface PaymentMethodSelectorProps {
  methods: PaymentMethod[];
  value?: string;
  onChange: (id: string) => void;
}

const icons = { cod: Wallet, bank: Landmark, online: CreditCard } as const;

export function PaymentMethodSelector({ methods, value, onChange }: PaymentMethodSelectorProps) {
  return (
    <RadioGroup {...(value ? { value } : {})} onValueChange={onChange} className="grid gap-3">
      {methods.map((method) => {
        const Icon = icons[method.type];
        return (
          <Label key={method.id} htmlFor={`payment-${method.id}`} className={cn("flex cursor-pointer items-center gap-4 rounded-xl border bg-bg-surface p-4 text-left transition duration-200", value === method.id ? "border-accent shadow-md" : "border-border-default")}>
            <RadioGroupItem id={`payment-${method.id}`} value={method.id} />
            <Icon className="h-5 w-5 text-accent" />
            <span className="flex-1"><span className="block font-semibold">{method.label}</span><span className="text-sm text-ink-secondary">{method.description}{method.last4 ? ` · **** ${method.last4}` : ""}</span></span>
          </Label>
        );
      })}
    </RadioGroup>
  );
}
