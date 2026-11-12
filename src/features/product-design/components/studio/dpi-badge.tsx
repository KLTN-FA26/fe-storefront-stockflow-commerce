import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import type { SemanticTone } from "@/lib/domain/types";

import { dpiTier, placedDpi, type ImageElement, type PrintSurface } from "../../engine";

const TIERS = {
  "below-min": {
    tone: "danger",
    classes: "bg-danger/10 text-danger",
    advice: "Thấp hơn mức in rõ tối thiểu của sản phẩm. Hãy thu nhỏ ảnh hoặc dùng ảnh lớn hơn.",
  },
  ok: {
    tone: "positive",
    classes: "bg-positive/10 text-positive",
    advice: "Đủ độ phân giải để in rõ.",
  },
} as const satisfies Record<
  ReturnType<typeof dpiTier>,
  { tone: SemanticTone; classes: string; advice: string }
>;

/**
 * The resolution the image reaches where it sits: the worse of its two axes at the placed size,
 * judged by the same threshold as the print check (under `minDpi` is blurry). `surface` is the one
 * the image sits on: bent around the cup, its stretched outer edge counts, as in the print check.
 */
export function DpiBadge({
  element,
  surface,
  minDpi,
  className,
  compact = false,
}: {
  element: ImageElement;
  surface?: PrintSurface;
  minDpi: number;
  className?: string;
  /** For a toolbar: the advice is read by assistive technology and shown as a tooltip only. */
  compact?: boolean;
}) {
  const dpi = placedDpi(element, surface);
  const tier = dpiTier(dpi, minDpi);
  const { tone, classes, advice } = TIERS[tier];
  const shown = Math.round(dpi);
  return (
    <div className={cn("flex flex-col items-start gap-1.5", className)}>
      <Badge
        data-tone={tone}
        title={compact ? advice : undefined}
        className={cn("h-7 rounded-full px-3 text-sm font-semibold tabular-nums", classes)}
      >
        {tier === "ok" ? `${shown} DPI ✓` : `${shown} DPI – sẽ mờ`}
      </Badge>
      <p className={compact ? "sr-only" : "text-ink-tertiary text-xs"}>{advice}</p>
    </div>
  );
}
