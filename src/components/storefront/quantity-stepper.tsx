"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

interface QuantityStepperProps {
  value: number;
  min?: number;
  max?: number | undefined;
  onChange: (value: number) => void;
  /** Names the field for assistive tech when several steppers share a page. */
  label?: string;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * − / + around a number the customer can also type: a wholesale line is thousands of units, not
 * one or two. The typed text is only committed (clamped to min..max) on blur or Enter.
 */
export function QuantityStepper({
  value,
  min = 1,
  max = 1_000_000,
  onChange,
  label = "Số lượng",
}: QuantityStepperProps) {
  // `draft` is what is being typed; null means "show the committed value".
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft === null) return;
    const typed = Number.parseInt(draft, 10);
    setDraft(null);
    if (Number.isFinite(typed)) {
      const next = clamp(typed, min, max);
      if (next !== value) onChange(next);
    }
  };

  return (
    <div className="border-border-default bg-bg-surface inline-flex items-center rounded-full border">
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label="Giảm số lượng"
        className="size-11 rounded-full"
        disabled={value <= min}
        onClick={() => onChange(clamp(value - 1, min, max))}
      >
        <Minus className="h-4 w-4" aria-hidden="true" />
      </Button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label={label}
        value={draft ?? String(value)}
        onChange={(event) => setDraft(event.target.value.replace(/\D/g, ""))}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
        }}
        className="focus-visible:ring-accent h-11 w-16 bg-transparent text-center text-sm font-semibold tabular-nums focus-visible:ring-2 focus-visible:outline-none"
      />
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label="Tăng số lượng"
        className="size-11 rounded-full"
        disabled={value >= max}
        onClick={() => onChange(clamp(value + 1, min, max))}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
