import { Clock } from "lucide-react";

import { formatDateTime, formatTime, isToday } from "@/lib/format/date";
import { cn } from "@/lib/cn";

interface ResponseExpectationProps {
  /** BE `expectedResponseAt`: absent when nothing is awaited or the conversation ended. */
  expectedResponseAt?: string | null | undefined;
  withinBusinessHours?: boolean | null | undefined;
  className?: string;
}

/**
 * What to promise about Sales' answer (16 §4.1 step 3, Mode B Module 16): the expected time while a message waits;
 * outside business hours, that messages are kept until the shift starts; "within minutes" only when the BE says it is
 * business hours now. Nothing when the BE says neither (SF-UX-27: no default promise).
 */
export function responseExpectationText({
  expectedResponseAt,
  withinBusinessHours,
}: Pick<ResponseExpectationProps, "expectedResponseAt" | "withinBusinessHours">): string | null {
  if (expectedResponseAt) {
    return `Sale dự kiến phản hồi trước ${
      isToday(expectedResponseAt)
        ? formatTime(expectedResponseAt)
        : formatDateTime(expectedResponseAt)
    }.`;
  }
  if (withinBusinessHours === false) {
    return "Ngoài giờ làm việc: tin nhắn của bạn được giữ lại, Sale sẽ phản hồi khi vào ca.";
  }
  if (withinBusinessHours === true)
    return "Trong giờ làm việc, Sale thường phản hồi trong ít phút.";
  return null;
}

export function ResponseExpectation({ className, ...props }: ResponseExpectationProps) {
  const text = responseExpectationText(props);
  if (!text) return null;
  return (
    <p className={cn("text-ink-secondary flex items-center gap-2 text-sm", className)}>
      <Clock aria-hidden className="text-accent size-4 shrink-0" />
      <span className="tabular-nums">{text}</span>
    </p>
  );
}
