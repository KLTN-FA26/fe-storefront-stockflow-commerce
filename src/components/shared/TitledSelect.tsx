"use client";

import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/cn";
import { SelectContent, SelectGroup, SelectItem, SelectLabel } from "@/components/ui/select";

/**
 * A select's open list with its title on top ("Sắp xếp theo", "Trạng thái"): the title shows only when the list is
 * open, inside it, as a shadcn `SelectLabel`, not as a label beside the trigger.
 */
export function TitledSelectContent({
  title,
  children,
  ...props
}: { title: string; children: ReactNode } & ComponentProps<typeof SelectContent>) {
  return (
    <SelectContent {...props}>
      <SelectGroup>
        <SelectLabel>{title}</SelectLabel>
        {children}
      </SelectGroup>
    </SelectContent>
  );
}

/**
 * A shadcn `SelectItem` with shadcn's neutral highlight. The project's `accent` token is the brand blue, not shadcn's
 * grey, so the primitive's own `focus:bg-accent` would paint the hovered option blue.
 */
export function SelectOption({ className, ...props }: ComponentProps<typeof SelectItem>) {
  return (
    <SelectItem className={cn("focus:bg-bg-muted focus:text-ink-primary", className)} {...props} />
  );
}
