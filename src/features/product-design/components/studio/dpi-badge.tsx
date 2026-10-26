import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import type { SemanticTone } from "@/lib/domain/types";

import { dpiTier, placedDpi, type ImageElement } from "../../engine";

const TIERS = {
  "below-min": {
    tone: "danger",
    classes: "bg-danger/10 text-danger",
    advice: "Thấp hơn mức in rõ tối thiểu của sản phẩm. Hãy thu nhỏ ảnh hoặc dùng ảnh lớn hơn.",
  },
  low: {
    tone: "warning",
    classes: "bg-warning/10 text-warning",
    advice: "Gần mức tối thiểu, bản in có thể hơi mờ.",
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
 * judged by the same thresholds as the print check (under `minDpi`, or under the print file's DPI
 * `printDpi(minDpi)` = max(`minDpi`, 300), is blurry).
 */
export function DpiBadge({
  element,
  minDpi,
  className,
}: {
  element: ImageElement;
  minDpi: number;
  className?: string;
}) {
  const dpi = placedDpi(element);
  const tier = dpiTier(dpi, minDpi);
  const { tone, classes, advice } = TIERS[tier];
  const shown = Math.round(dpi);
  return (
    <div className={cn("flex flex-col items-start gap-1.5", className)}>
      <Badge
        data-tone={tone}
        className={cn("h-7 rounded-full px-3 text-sm font-semibold tabular-nums", classes)}
      >
        {tier === "ok" ? `${shown} DPI ✓` : `${shown} DPI – sẽ mờ`}
      </Badge>
      <p className="text-ink-tertiary text-xs">{advice}</p>
    </div>
  );
}
