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
          <Label
            key={method.id}
            htmlFor={`payment-${method.id}`}
            className={cn(
              "bg-bg-surface hover:border-border-strong focus-within:ring-accent flex min-h-11 cursor-pointer items-center gap-3 rounded-[var(--r-md)] border p-3 text-left transition-colors duration-200 focus-within:ring-2 sm:gap-4 sm:p-4",
              value === method.id ? "border-accent bg-accent/5" : "border-border-default",
            )}
          >
            <RadioGroupItem id={`payment-${method.id}`} value={method.id} />
            <Icon className="text-accent h-5 w-5 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{method.label}</span>
              <span className="text-ink-secondary text-sm">
                {method.description}
                {method.last4 ? ` · **** ${method.last4}` : ""}
              </span>
            </span>
          </Label>
        );
      })}
    </RadioGroup>
  );
}
