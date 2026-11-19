import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface ChatBubbleProps {
  /** Who wrote it, shown on the other side's bubbles (the customer's own need no name). */
  author?: string | undefined;
  /** Plain text content; `children` is used instead when given (files, links). */
  message?: string | undefined;
  children?: ReactNode;
  timestamp: string;
  side?: "customer" | "agent";
  /** A taken-back message or a system line: quieter, italic. */
  muted?: boolean;
  /** Under the time: e.g. "Đã chỉnh sửa", or an action on one's own message. */
  footer?: ReactNode;
}

/**
 * One chat message as the customer sees it. The storefront has no internal-note style on purpose:
 * internal notes never reach the customer (kltn-docs 16 BR-07).
 */
export function ChatBubble({
  author,
  message,
  children,
  timestamp,
  side = "customer",
  muted = false,
  footer,
}: ChatBubbleProps) {
  const isAgent = side === "agent";
  return (
    <div className={cn("flex gap-3", isAgent ? "justify-start" : "justify-end")}>
      {isAgent && (
        <Avatar className="size-8 shrink-0">
          <AvatarFallback>{(author ?? "S").slice(0, 1)}</AvatarFallback>
        </Avatar>
      )}
      <div
        className={cn(
          "max-w-[85%] min-w-0 rounded-[var(--r-lg)] px-3.5 py-2.5 shadow-[var(--card-shadow)] sm:max-w-[80%]",
          isAgent || muted
            ? "border-border-default bg-bg-surface text-ink-primary border"
            : "bg-accent text-ink-inverse",
        )}
      >
        {isAgent && author ? (
          <p className="text-ink-secondary mb-0.5 text-xs font-semibold">{author}</p>
        ) : null}
        <div
          className={cn(
            "text-sm leading-relaxed break-words whitespace-pre-line",
            muted && "text-ink-tertiary italic",
          )}
        >
          {children ?? message}
        </div>
        <p
          className={cn(
            "mt-1 text-xs tabular-nums",
            isAgent || muted ? "text-ink-tertiary" : "text-ink-inverse/70",
          )}
        >
          {timestamp}
        </p>
        {footer}
      </div>
    </div>
  );
}
