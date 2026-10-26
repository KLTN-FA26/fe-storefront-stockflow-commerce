"use client";

import { useId, type ReactNode } from "react";

import { Label } from "@/components/ui/label";
import { RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/cn";

/**
 * One option of a `RadioGroup` as a tappable card (at least 44 px): the radio is hidden but keeps
 * the focus and the arrow keys, the card shows the focus ring and which one is `chosen`.
 */
export function RadioCard({
  value,
  chosen,
  className,
  children,
}: {
  value: string;
  chosen: boolean;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <Label
      htmlFor={id}
      className={cn(
        "bg-bg-surface hover:border-border-strong focus-within:ring-accent min-h-11 cursor-pointer rounded-[var(--r-md)] border text-left font-normal transition-colors focus-within:ring-2 has-disabled:cursor-not-allowed has-disabled:opacity-50",
        chosen ? "border-accent bg-accent/5" : "border-border-default",
        className,
      )}
    >
      <RadioGroupItem id={id} value={value} className="sr-only" />
      {children}
    </Label>
  );
}
