"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle } from "lucide-react";

import { STORE_ROUTES } from "@/constants";
import { formatRelative } from "@/lib/format/date";
import { cn } from "@/lib/cn";

import { ToneBadge } from "@/components/storefront/tone-badge";

import { contextKindLabel, conversationStatusMeta } from "../labels";
import { conversationTitle, isEnded, messagePreview } from "../selectors";
import type { ChatConversation } from "../types";

/** One conversation of the list: subject, what it is about, last message, unread, status. */
export function ConversationRow({ conversation }: { conversation: ChatConversation }) {
  const status = conversationStatusMeta(conversation.status);
  const ended = isEnded(conversation.status);
  const unread = conversation.unread ?? 0;
  const href = STORE_ROUTES.chat.detail(conversation.id);
  const active = usePathname() === href;
  const kinds = [
    ...new Set(conversation.contexts.map((context) => contextKindLabel(context.kind))),
  ];
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "focus-visible:ring-accent flex min-h-16 items-start gap-3 rounded-[var(--r-md)] px-3 py-2.5 transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset",
        active ? "bg-accent/10" : "hover:bg-bg-subtle",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-full",
          ended ? "bg-bg-muted text-ink-tertiary" : "bg-accent/10 text-accent",
        )}
      >
        <MessageCircle className="size-5" />
      </span>
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-start justify-between gap-2">
          <h2
            className={cn(
              "truncate text-sm",
              unread > 0 ? "text-ink-primary font-bold" : "text-ink-primary font-semibold",
            )}
          >
            {conversationTitle(conversation)}
          </h2>
          {conversation.lastMessageAt ? (
            <span className="text-ink-tertiary shrink-0 text-xs tabular-nums">
              {formatRelative(conversation.lastMessageAt)}
            </span>
          ) : null}
        </div>
        {kinds.length > 0 ? (
          <p className="text-ink-tertiary truncate text-xs">Về: {kinds.join(", ")}</p>
        ) : null}
        <p
          className={cn("truncate text-sm", unread > 0 ? "text-ink-primary" : "text-ink-secondary")}
        >
          {messagePreview(conversation.lastMessage)}
        </p>
        <div className="flex items-center gap-2 pt-1">
          <ToneBadge label={status.label} tone={status.tone} size="sm" />
          {unread > 0 ? (
            <span
              aria-label={`${unread} tin chưa đọc`}
              className="bg-accent text-ink-inverse rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums"
            >
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
