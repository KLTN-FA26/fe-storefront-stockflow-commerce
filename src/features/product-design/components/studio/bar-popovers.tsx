"use client";

import type { LucideIcon } from "lucide-react";
import { useState, type ReactNode, type Ref } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";

import type { Hex } from "../../engine";
import { BAR_HIT } from "./bar-controls";
import { ColorField } from "./color-field";

const POPOVER_BOX = "bg-bg-surface rounded-[var(--r-lg)] p-[var(--card-pad)]";
const BAR_BUTTON = `h-9 shrink-0 rounded-[var(--r-md)] px-2.5 ${BAR_HIT}`;

/**
 * A bar button that opens a popover holding `children` (a form, a slider): the shadcn Popover, so
 * Enter/Space open it, Esc closes it and focus returns to the button. The button shows `icon`, and
 * `text` beside it from `xl` up (below it the icon alone; its label stays the accessible name and
 * the tooltip), or `face` instead (a colour swatch). It closes by itself when `disabled` turns on
 * (a design sent for review).
 */
export function BarPopover({
  label,
  icon: Icon,
  text,
  face,
  disabled = false,
  children,
  className,
  contentRef,
}: {
  /** The accessible name of the button, and its tooltip. */
  label: string;
  icon?: LucideIcon;
  text?: string;
  face?: ReactNode;
  disabled?: boolean | undefined;
  children: ReactNode;
  className?: string;
  contentRef?: Ref<HTMLDivElement>;
}) {
  const [open, setOpen] = useState(false);
  // Disabled (a design sent for review) closes it for good: it does not reopen when enabled again.
  if (disabled && open) setOpen(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              aria-label={label}
              disabled={disabled}
              className={BAR_BUTTON}
            >
              {Icon ? <Icon aria-hidden className="size-4" /> : null}
              {text ? <span className="hidden xl:inline">{text}</span> : null}
              {face}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <PopoverContent ref={contentRef} align="start" className={cn(POPOVER_BOX, className)}>
        {children}
      </PopoverContent>
    </Popover>
  );
}

/** A colour button showing the swatch of `value`; its popover holds the `ColorField`. */
export function ColorPopover({
  label,
  value,
  onChange,
  warnOnKraft,
  disabled,
}: {
  label: string;
  value: Hex;
  onChange: (value: Hex) => void;
  warnOnKraft: boolean;
  disabled?: boolean;
}) {
  return (
    <BarPopover
      label={`${label}, ${value}`}
      disabled={disabled}
      face={
        <span
          aria-hidden
          className="border-border-strong size-5 rounded-full border"
          style={{ backgroundColor: value }}
        />
      }
    >
      <ColorField label={label} value={value} warnOnKraft={warnOnKraft} onChange={onChange} />
    </BarPopover>
  );
}
