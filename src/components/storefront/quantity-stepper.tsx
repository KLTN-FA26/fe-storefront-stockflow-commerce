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
    <div className="border-border-default bg-bg-surface inline-flex items-center rounded-full border">
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label="Giảm số lượng"
        className="size-11 rounded-full"
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
      >
        <Minus className="h-4 w-4" aria-hidden="true" />
      </Button>
      <span className="min-w-10 text-center text-sm font-semibold tabular-nums">{value}</span>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label="Tăng số lượng"
        className="size-11 rounded-full"
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
