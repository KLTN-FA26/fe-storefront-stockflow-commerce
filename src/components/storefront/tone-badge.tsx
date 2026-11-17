import { cn } from "@/lib/cn";

import { Badge } from "@/components/ui/badge";
import type { SemanticTone } from "@/lib/domain/types";

/** Nền nhạt + chữ theo tone ngữ nghĩa (design-tokens: positive, info, warning…). */
export const TONE_BADGE_CLASSES: Record<SemanticTone, string> = {
  positive: "bg-positive/10 text-positive",
  info: "bg-info/10 text-info",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger",
  neutral: "bg-neutral/10 text-neutral",
  muted: "bg-bg-muted text-ink-secondary",
  special: "bg-special/10 text-special",
};

/**
 * Badge trạng thái cho một nhãn đã dịch và tone của nó — module tra nhãn / tone từ bảng của mình
 * (vd. `RETURN_STATUS_META`) rồi đưa vào đây, không tô màu trạng thái trong JSX.
 */
export function ToneBadge({
  label,
  tone,
  size = "md",
  className,
}: {
  label: string;
  tone: SemanticTone;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <Badge
      data-tone={tone}
      className={cn(
        "rounded-full font-semibold",
        size === "sm" ? "h-6 px-2.5 text-xs" : "h-7 px-3 text-sm",
        TONE_BADGE_CLASSES[tone],
        className,
      )}
    >
      {label}
    </Badge>
  );
}
