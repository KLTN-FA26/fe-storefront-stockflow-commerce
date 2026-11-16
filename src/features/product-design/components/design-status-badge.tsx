import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import type { SemanticTone } from "@/lib/domain/types";

import { DESIGN_STATUS_META, RETURNED_META } from "../lifecycle";
import type { DesignStatus } from "../types";

/** Tinted background + text per tone, the same mapping as the order status badge. */
export const TONE_CLASSES: Record<SemanticTone, string> = {
  positive: "bg-positive/10 text-positive",
  info: "bg-info/10 text-info",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger",
  neutral: "bg-neutral/10 text-neutral",
  muted: "bg-bg-muted text-ink-secondary",
  special: "bg-special/10 text-special",
};

export const BADGE = "h-7 rounded-full px-3 text-sm font-semibold";

/** The status of a design (spec §3.1); a returned DRAFT carries a second, secondary badge. */
export function DesignStatusBadge({
  status,
  returned = false,
  className,
}: {
  status: DesignStatus;
  returned?: boolean;
  className?: string;
}) {
  const { label, tone } = DESIGN_STATUS_META[status];
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-2", className)}>
      <Badge data-tone={tone} className={cn(BADGE, TONE_CLASSES[tone])}>
        {label}
      </Badge>
      {returned ? (
        <Badge
          data-tone={RETURNED_META.tone}
          className={cn(BADGE, TONE_CLASSES[RETURNED_META.tone])}
        >
          {RETURNED_META.label}
        </Badge>
      ) : null}
    </span>
  );
}
