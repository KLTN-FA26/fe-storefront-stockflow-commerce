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
 * When Sales should answer (16 §4.1 step 3, Mode B Module 16): the expected time while a message
 * waits, and outside business hours that messages are kept until the shift starts.
 */
export function ResponseExpectation({
  expectedResponseAt,
  withinBusinessHours,
  className,
}: ResponseExpectationProps) {
  const text = expectedResponseAt
    ? `Sale dự kiến phản hồi trước ${
        isToday(expectedResponseAt)
          ? formatTime(expectedResponseAt)
          : formatDateTime(expectedResponseAt)
      }.`
    : withinBusinessHours === false
      ? "Ngoài giờ làm việc: tin nhắn của bạn được giữ lại, Sale sẽ phản hồi khi vào ca."
      : "Trong giờ làm việc, Sale thường phản hồi trong ít phút.";
  return (
    <p className={cn("text-ink-secondary flex items-center gap-2 text-sm", className)}>
      <Clock aria-hidden className="text-accent size-4 shrink-0" />
      <span className="tabular-nums">{text}</span>
    </p>
  );
}
