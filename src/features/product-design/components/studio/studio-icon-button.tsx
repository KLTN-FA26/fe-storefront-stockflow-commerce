"use client";

import type { ComponentProps, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";

type StudioIconButtonProps = Omit<ComponentProps<typeof Button>, "children" | "size"> & {
  /** The accessible name, also shown as the tooltip (with the shortcut where there is one). */
  label: string;
  children: ReactNode;
};

/** A 44 px icon button of the studio: its Vietnamese label is the accessible name and the tooltip. */
export function StudioIconButton({
  label,
  children,
  className,
  variant = "ghost",
  ...props
}: StudioIconButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={variant}
          size="icon"
          aria-label={label}
          className={cn("size-11 rounded-[var(--r-md)]", className)}
          {...props}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
