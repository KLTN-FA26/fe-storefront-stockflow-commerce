"use client";

import { CloudOff, Loader2, TriangleAlert } from "lucide-react";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import { hasErrorCode } from "@/lib/api/describe-error";
import { cn } from "@/lib/cn";
import { formatTime } from "@/lib/format";

import type { AutosaveState } from "../../autosave";
import { describeDesignError } from "../../errors";

/** The oversize refusal is about the design, not a file: say what the customer can do about it. */
function saveErrorReason(error: unknown) {
  return hasErrorCode(error, "PAYLOAD_TOO_LARGE")
    ? "Thiết kế quá phức tạp để lưu. Hãy bớt chi tiết rồi thử lại."
    : describeDesignError(error);
}

/**
 * The header's save state (it replaces a separate offline banner): "Đang lưu…", "Đã lưu lúc HH:mm",
 * "Lưu lỗi – Thử lại" (a button), "Mất kết nối – sẽ lưu khi có mạng", or the conflict title;
 * nothing before the first save of this visit.
 */
export function SaveState({
  state,
  savedAt,
  error,
  onRetry,
  className,
}: {
  state: AutosaveState;
  savedAt: string | undefined;
  error: unknown;
  onRetry: () => void;
  className?: string;
}) {
  const reasonId = useId();
  const base = cn("flex min-w-0 items-center gap-1.5 text-sm", className);

  switch (state) {
    case "pending":
    case "saving":
      return (
        <p className={cn(base, "text-ink-secondary")}>
          <Loader2 aria-hidden className="size-4 shrink-0 animate-spin" />
          <span className="truncate">Đang lưu…</span>
        </p>
      );
    case "error":
      return (
        <div className={base}>
          <Button
            type="button"
            variant="ghost"
            className="text-danger min-h-11 rounded-[var(--r-md)] px-2"
            onClick={onRetry}
            aria-describedby={reasonId}
            title={saveErrorReason(error)}
          >
            <TriangleAlert aria-hidden className="mr-1.5 size-4" />
            Lưu lỗi – Thử lại
          </Button>
          <span id={reasonId} className="sr-only">
            {saveErrorReason(error)}
          </span>
        </div>
      );
    case "offline":
      return (
        <p className={cn(base, "text-warning")}>
          <CloudOff aria-hidden className="size-4 shrink-0" />
          <span className="truncate">Mất kết nối – sẽ lưu khi có mạng</span>
        </p>
      );
    case "conflict":
      return (
        <p className={cn(base, "text-danger")}>
          <TriangleAlert aria-hidden className="size-4 shrink-0" />
          <span className="truncate">Thiết kế đã thay đổi ở nơi khác</span>
        </p>
      );
    case "idle":
    case "saved":
      return savedAt ? (
        <p className={cn(base, "text-ink-tertiary")}>
          <span className="truncate tabular-nums">Đã lưu lúc {formatTime(savedAt)}</span>
        </p>
      ) : null;
  }
}
