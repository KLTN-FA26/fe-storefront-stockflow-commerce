import { cn } from "cn";

import { TONE_BADGE_CLASSES } from "@/components/storefront/tone-badge";
import { Badge } from "@/components/ui/badge";

import { ORDER_DISPLAY_META, type OrderDisplayGroup } from "../lifecycle";

/** Tinted background + text per tone, shared by the badge and the status hero icon. */
export const ORDER_TONE_CLASSES = TONE_BADGE_CLASSES;

export function OrderStatusBadge({
  group,
  className,
}: {
  /** `displayGroup(order)`: the status group, or COMPLETED. */
  group: OrderDisplayGroup;
  className?: string;
}) {
  const { label, tone } = ORDER_DISPLAY_META[group];
  return (
    <Badge
      data-tone={tone}
      className={cn(
        "h-7 rounded-full px-3 text-sm font-semibold",
        ORDER_TONE_CLASSES[tone],
        className,
      )}
    >
      {label}
    </Badge>
  );
}
