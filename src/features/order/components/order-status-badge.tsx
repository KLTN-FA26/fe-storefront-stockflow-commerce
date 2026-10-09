import { cn } from "cn";

import { Badge } from "@/components/ui/badge";
import type { SemanticTone } from "@/lib/domain/types";

import { ORDER_STATUS_META } from "../lifecycle";
import type { OrderStatus } from "../types";

/** Tinted background + text per tone, shared by the badge and the status hero icon. */
export const ORDER_TONE_CLASSES: Record<SemanticTone, string> = {
  positive: "bg-positive/10 text-positive",
  info: "bg-info/10 text-info",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger",
  neutral: "bg-neutral/10 text-neutral",
  muted: "bg-bg-muted text-ink-secondary",
  special: "bg-special/10 text-special",
};

export function OrderStatusBadge({
  status,
  className,
}: {
  status: OrderStatus;
  className?: string;
}) {
  const { label, tone } = ORDER_STATUS_META[status];
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
