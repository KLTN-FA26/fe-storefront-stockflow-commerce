import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import type { SemanticTone } from "@/lib/domain/types";

import { DESIGN_UI_STATE_META, type DesignUiState } from "../lifecycle";

/** Tinted background + text per tone, the same mapping as the order status badge. */
const TONE_CLASSES: Record<SemanticTone, string> = {
  positive: "bg-positive/10 text-positive",
  info: "bg-info/10 text-info",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger",
  neutral: "bg-neutral/10 text-neutral",
  muted: "bg-bg-muted text-ink-secondary",
  special: "bg-special/10 text-special",
};

export function DesignStatusBadge({
  state,
  className,
}: {
  state: DesignUiState;
  className?: string;
}) {
  const { label, tone } = DESIGN_UI_STATE_META[state];
  return (
    <Badge
      data-tone={tone}
      className={cn("h-7 rounded-full px-3 text-sm font-semibold", TONE_CLASSES[tone], className)}
    >
      {label}
    </Badge>
  );
}
