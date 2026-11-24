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
  /** A taken-back message: quieter, italic, outlined. */
  muted?: boolean;
  /** Under the time: a note about the message. */
  footer?: ReactNode;
  /**
   * Actions on the message (e.g. "Thu hồi"), shown beside the bubble when it is hovered or focused, as in a messaging
   * app; always shown on a touch screen, which has no hover.
   */
  actions?: ReactNode;
  /**
   * Where the message sits in a run of messages from the same person (as a messaging app groups them): the name shows
   * on the first, the avatar and the time on the last, and the corners between them tighten. A lone message is both.
   */
  first?: boolean;
  last?: boolean;
}

/**
 * One chat message as the customer sees it, as a messaging app draws it: a rounded bubble, the customer's own in the
 * brand blue on the right, Sale's in grey on the left with an avatar. The storefront has no internal-note style on
 * purpose: internal notes never reach the customer (kltn-docs 16 BR-07).
 */
export function ChatBubble({
  author,
  message,
  children,
  timestamp,
  side = "customer",
  muted = false,
  footer,
  actions,
  first = true,
  last = true,
}: ChatBubbleProps) {
  const isAgent = side === "agent";
  return (
    <div
      className={cn("group/bubble flex items-end gap-2", isAgent ? "justify-start" : "justify-end")}
    >
      {isAgent ? (
        // The avatar marks the end of Sale's run; earlier bubbles keep its room so they line up.
        <span className="size-8 shrink-0">
          {last ? (
            <Avatar className="size-8">
              <AvatarFallback className="bg-accent/10 text-accent text-xs font-semibold">
                {(author ?? "S").slice(0, 1)}
              </AvatarFallback>
            </Avatar>
          ) : null}
        </span>
      ) : null}
      <div
        className={cn(
          "flex max-w-[78%] min-w-0 flex-col sm:max-w-[70%]",
          isAgent ? "items-start" : "items-end",
        )}
      >
        {isAgent && author && first ? (
          <p className="text-ink-tertiary mb-1 px-3 text-xs">{author}</p>
        ) : null}
        <div className={cn("flex items-center gap-1", isAgent ? "flex-row" : "flex-row-reverse")}>
          <div
            title={last ? undefined : timestamp}
            className={cn(
              "rounded-[1.25rem] px-3.5 py-2 text-sm leading-relaxed break-words whitespace-pre-line",
              muted
                ? "border-border-default text-ink-tertiary border bg-transparent italic"
                : isAgent
                  ? "bg-bg-muted text-ink-primary"
                  : "bg-accent text-ink-inverse",
              // Tighter corners on the side the run continues, as in a messaging app.
              isAgent ? !first && "rounded-tl-md" : !first && "rounded-tr-md",
              isAgent ? !last && "rounded-bl-md" : !last && "rounded-br-md",
            )}
          >
            {children ?? message}
          </div>
          {actions ? (
            <div className="flex shrink-0 opacity-0 transition-opacity group-hover/bubble:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100">
              {actions}
            </div>
          ) : null}
        </div>
        {last ? (
          <p className="text-ink-tertiary mt-1 px-3 text-[0.6875rem] tabular-nums">{timestamp}</p>
        ) : null}
        {footer ? <div className="px-3">{footer}</div> : null}
      </div>
    </div>
  );
}
