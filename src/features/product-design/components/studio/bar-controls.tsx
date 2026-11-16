"use client";

import { useId, type ComponentProps } from "react";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/cn";

import { StudioIconButton } from "./studio-icon-button";

/** A control of the context bar: 36 px tall, its 44 px hit area made by the pseudo-element. */
export const BAR_HIT = "relative after:absolute after:-inset-1";
/** The same for the items of a group with no gap between them: the extension is vertical only. */
export const BAR_HIT_Y = "relative after:absolute after:inset-x-0 after:-inset-y-1";

/** An icon button of the bar (label = accessible name and tooltip). */
export function BarIconButton({ className, ...props }: ComponentProps<typeof StudioIconButton>) {
  return <StudioIconButton className={cn("size-9", BAR_HIT, className)} {...props} />;
}

/** The thin rule between groups of the bar. */
export function BarDivider() {
  return <span aria-hidden className="bg-border-default mx-1 h-5 w-px shrink-0" />;
}

/**
 * "Uốn theo thân ly": the bar's switch for a text or an image on a cup body's sector. The whole
 * label is the 44 px target.
 */
export function WrapSwitch({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (wrap: boolean) => void;
}) {
  const id = useId();
  return (
    <Label
      htmlFor={id}
      className="text-ink-primary flex h-11 shrink-0 cursor-pointer items-center gap-2 text-xs whitespace-nowrap"
    >
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
      Uốn theo thân ly
    </Label>
  );
}
