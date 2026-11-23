import { cn } from "@/lib/cn";

import { Badge } from "@/components/ui/badge";
import type { SemanticTone } from "@/lib/domain/types";

/**
 * Tinted background + text per semantic tone: the one table every status badge reads (SF-UX-1). The
 * text is the tone's darker `-ink` shade, since the tone itself on its own 10% tint fails WCAG 1.4.3
 * (warning 2.66:1); every ink is >= 5:1 there, light and dark (see `globals.css`).
 */
export const TONE_BADGE_CLASSES: Record<SemanticTone, string> = {
  positive: "bg-positive/10 text-positive-ink",
  info: "bg-info/10 text-info-ink",
  warning: "bg-warning/10 text-warning-ink",
  danger: "bg-danger/10 text-danger-ink",
  neutral: "bg-neutral/10 text-neutral-ink",
  muted: "bg-bg-muted text-ink-secondary",
  special: "bg-special/10 text-special-ink",
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
