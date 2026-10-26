"use client";

import { useId, useState } from "react";
import { create } from "zustand";

import { Alert } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { hexSchema, isNearWhite, PRINT_SWATCHES, type Hex } from "../../engine";

const MAX_RECENT = 6;
const KRAFT_WARNING = "Giấy kraft không in được màu trắng.";

/** What a screen reader says for each print swatch (print data, like the swatches themselves). */
const SWATCH_NAMES: Readonly<Record<string, string>> = {
  "#000000": "Đen",
  "#FFFFFF": "Trắng",
  "#374151": "Xám đậm",
  "#9CA3AF": "Xám nhạt",
  "#DC2626": "Đỏ",
  "#F97316": "Cam",
  "#FACC15": "Vàng",
  "#16A34A": "Xanh lá",
  "#2563EB": "Xanh dương",
  "#1E3A8A": "Xanh navy",
  "#7C3AED": "Tím",
  "#78350F": "Nâu",
};

/**
 * The custom colours picked during this visit, newest first: shared by every colour field, kept
 * for the session only (not in storage, so a new visit starts with the print swatches alone).
 */
export const useRecentColors = create<{
  colors: readonly Hex[];
  remember(color: Hex): void;
}>((set) => ({
  colors: [],
  remember: (color) =>
    set((state) => ({
      colors: [color, ...state.colors.filter((c) => c !== color)].slice(0, MAX_RECENT),
    })),
}));

/** `#RRGGBB` or `RRGGBB` in either case as an upper-case `Hex`; `null` when it is not one. */
function parseHex(text: string): Hex | null {
  const trimmed = text.trim();
  const parsed = hexSchema.safeParse(trimmed.startsWith("#") ? trimmed : `#${trimmed}`);
  return parsed.success ? parsed.data : null;
}

/** Digits so far of a code that may still become valid: no complaint while it is being typed. */
const isIncomplete = (text: string) => /^#?[0-9a-f]{0,5}$/i.test(text.trim());

const swatchLabel = (hex: Hex) => {
  const name = SWATCH_NAMES[hex];
  return name ? `${name} ${hex}` : hex;
};

/**
 * A colour picker for print inks: the `PRINT_SWATCHES`, the six most recent custom colours of
 * the session, and a `#RRGGBB` field (a valid code applies as soon as it is complete; an invalid
 * one is put back when the field is left). With `warnOnKraft` a near-white colour says that kraft
 * paper cannot print it (the preflight rule's threshold).
 */
export function ColorField({
  value,
  onChange,
  label,
  warnOnKraft = false,
}: {
  value: Hex;
  onChange: (value: Hex) => void;
  label: string;
  warnOnKraft?: boolean;
}) {
  const labelId = useId();
  const hintId = useId();
  const recent = useRecentColors((state) => state.colors);
  const remember = useRecentColors((state) => state.remember);
  const [draft, setDraft] = useState<string | null>(null);
  const invalid = draft !== null && parseHex(draft) === null && !isIncomplete(draft);

  const edit = (text: string) => {
    setDraft(text);
    const hex = parseHex(text);
    if (hex) onChange(hex);
  };
  const settle = () => {
    const hex = draft === null ? null : parseHex(draft);
    if (hex && !PRINT_SWATCHES.includes(hex)) remember(hex);
    setDraft(null);
  };

  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-col gap-2">
      <span id={labelId} className="text-ink-secondary text-xs">
        {label}
      </span>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-2">
        {[...PRINT_SWATCHES, ...recent].map((swatch) => (
          <Button
            key={swatch}
            type="button"
            variant="outline"
            size="icon"
            aria-label={swatchLabel(swatch)}
            aria-pressed={swatch === value}
            onClick={() => onChange(swatch)}
            style={{ backgroundColor: swatch }}
            className="border-border-strong aria-pressed:ring-accent aria-pressed:ring-offset-bg-surface size-11 rounded-full aria-pressed:ring-2 aria-pressed:ring-offset-2"
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="border-border-strong size-11 shrink-0 rounded-[var(--r-md)] border"
          style={{ backgroundColor: value }}
        />
        <Input
          aria-label="Mã màu (#RRGGBB)"
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? hintId : undefined}
          value={draft ?? value}
          maxLength={7}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => edit(event.target.value)}
          onBlur={settle}
          onKeyDown={(event) => {
            if (event.key === "Enter") settle();
          }}
          className="h-11 rounded-[var(--r-md)] font-mono uppercase tabular-nums"
        />
      </div>
      {invalid ? (
        <p id={hintId} className="text-danger text-xs">
          Nhập mã màu dạng #RRGGBB.
        </p>
      ) : null}
      <div role="status">
        {warnOnKraft && isNearWhite(value) ? <Alert tone="warning">{KRAFT_WARNING}</Alert> : null}
      </div>
    </div>
  );
}
