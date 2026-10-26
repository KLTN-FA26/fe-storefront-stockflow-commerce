"use client";

import { useEffect, useId, useRef } from "react";

import { Slider } from "@/components/ui/slider";
import { formatNumber } from "@/lib/format";

let sessions = 0;
/** One id per scrub of a slider: everything dragged in one go is one undo step. */
const nextSession = () => `slider-${++sessions}`;

/**
 * A labelled slider with its value beside the label, `format`ted (default: the number, then
 * `unit`). `onChange` gets every value with the id of the current scrub, which lasts from the
 * first move until the slider is released (a key press is its own scrub). The row is 44 px tall,
 * and the whole of it takes the pointer.
 */
export function SliderField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (value: number, session: string) => void;
  min: number;
  max: number;
  step?: number;
  unit: string;
  disabled?: boolean;
}) {
  const labelId = useId();
  const rootRef = useRef<HTMLSpanElement>(null);
  const session = useRef<string | null>(null);
  const text = `${formatNumber(value)} ${unit}`;

  // The shadcn slider cannot label its thumb (the element Radix gives `role="slider"`), so the
  // label and the value as words are set on it here; Radix never sets these two attributes.
  useEffect(() => {
    const thumb = rootRef.current?.querySelector('[role="slider"]');
    thumb?.setAttribute("aria-labelledby", labelId);
    thumb?.setAttribute("aria-valuetext", text);
  }, [labelId, text]);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3">
        <span id={labelId} className="text-ink-secondary text-xs">
          {label}
        </span>
        <span aria-hidden className="text-ink-primary text-sm tabular-nums">
          {text}
        </span>
      </div>
      <Slider
        ref={rootRef}
        value={[value]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        className="h-11"
        onValueChange={([next]) => {
          if (next === undefined) return;
          session.current ??= nextSession();
          onChange(next, session.current);
        }}
        onValueCommit={() => {
          session.current = null;
        }}
      />
    </div>
  );
}
