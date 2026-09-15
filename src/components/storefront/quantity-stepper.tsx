"use client";

import { Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

interface QuantityStepperProps {
  value: number;
  min?: number;
  max?: number | undefined;
  onChange: (value: number) => void;
}

export function QuantityStepper({ value, min = 1, max = 99, onChange }: QuantityStepperProps) {
  return (
    <div className="inline-flex items-center rounded-full border border-border-default bg-bg-surface p-1">
      <Button type="button" size="icon" variant="ghost" className="h-8 w-8 rounded-full" disabled={value <= min} onClick={() => onChange(value - 1)}>
        <Minus className="h-4 w-4" />
      </Button>
      <span className="min-w-10 text-center text-sm font-semibold tabular-nums">{value}</span>
      <Button type="button" size="icon" variant="ghost" className="h-8 w-8 rounded-full" disabled={value >= max} onClick={() => onChange(value + 1)}>
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}
