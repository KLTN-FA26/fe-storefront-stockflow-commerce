"use client";

import { useId, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/cn";

let sessions = 0;
/** One id per editing session of a field: the edits typed in one visit are one undo step. */
const nextSession = () => `field-${++sessions}`;

const format = (value: number, decimals: number) => {
  const factor = 10 ** decimals;
  return String(Math.round(value * factor) / factor);
};

/**
 * A labelled number input that edits live: every complete number typed is handed to `onChange`
 * (clamped to `min`/`max`) with the id of the current editing session, which lasts from focus to
 * blur or Enter. While focused it keeps what the customer typed (an empty field, "-"); otherwise it
 * shows `value` rounded to `decimals`.
 */
export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  decimals = 1,
  disabled = false,
  describedBy,
  inline = false,
}: {
  label: string;
  value: number;
  onChange: (value: number, session: string) => void;
  min?: number;
  max?: number;
  step?: number;
  decimals?: number;
  disabled?: boolean;
  describedBy?: string | undefined;
  /** For a toolbar: the label is for assistive technology only, the input is 36 px tall and the
   * padding around it (a click there focuses it) makes the 44 px target. */
  inline?: boolean;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const session = useRef<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const edit = (text: string) => {
    setDraft(text);
    const parsed = text.trim() === "" ? Number.NaN : Number(text);
    if (!Number.isFinite(parsed)) return;
    session.current ??= nextSession();
    onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, parsed)), session.current);
  };
  const settle = () => {
    setDraft(null);
    session.current = null;
  };

  return (
    <div
      className={cn("flex min-w-0 flex-col gap-1.5", inline && "cursor-text py-1")}
      onPointerDown={(event) => {
        if (inline && event.target === event.currentTarget) {
          event.preventDefault();
          input.current?.focus();
        }
      }}
    >
      <Label htmlFor={id} className={cn("text-ink-secondary text-xs", inline && "sr-only")}>
        {label}
      </Label>
      <Input
        ref={input}
        id={id}
        type="number"
        inputMode="decimal"
        value={draft ?? format(value, decimals)}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        aria-describedby={describedBy}
        onChange={(event) => edit(event.target.value)}
        onBlur={settle}
        onKeyDown={(event) => {
          if (event.key === "Enter") settle();
        }}
        className={cn("rounded-[var(--r-md)] tabular-nums", inline ? "h-9 w-18 px-2" : "h-11")}
      />
    </div>
  );
}
