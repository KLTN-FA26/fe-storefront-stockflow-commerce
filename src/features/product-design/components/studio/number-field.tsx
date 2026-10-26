"use client";

import { useId, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const session = useRef<string | null>(null);

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
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id} className="text-ink-secondary text-xs">
        {label}
      </Label>
      <Input
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
        className="h-11 rounded-[var(--r-md)] tabular-nums"
      />
    </div>
  );
}
