import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

/**
 * One filter of a list's row of pills (orders, payments, returns): the chosen one solid ink, the others outlined, and a
 * light hover that only darkens the text (the shadcn outline button's hover fill read too heavy here).
 */
export function FilterPill({
  active,
  className,
  ...props
}: { active: boolean } & ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "focus-visible:ring-accent min-h-11 rounded-full border px-4 text-sm font-medium tabular-nums transition-colors focus-visible:ring-2 focus-visible:outline-none",
        active
          ? "border-ink-primary bg-ink-primary text-ink-inverse"
          : "border-border-default bg-bg-surface text-ink-secondary hover:text-ink-primary",
        className,
      )}
      {...props}
    />
  );
}
