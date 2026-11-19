import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { STORE_ROUTES } from "@/constants";
import { cn } from "@/lib/cn";

import { ToneBadge } from "@/components/storefront/tone-badge";

import { contextKindLabel, conversationStatusMeta } from "../labels";
import { contextHref, conversationTitle, isEnded } from "../selectors";
import type { ChatConversation } from "../types";
import { ResponseExpectation } from "./response-expectation";

/** Subject, status, Sale in charge (online or not), what it is about, when Sales should answer. */
export function ThreadHeader({ conversation }: { conversation: ChatConversation }) {
  const status = conversationStatusMeta(conversation.status);
  const online = conversation.agentOnline === true;
  return (
    <header className="space-y-2">
      <Link
        href={STORE_ROUTES.chat.list}
        className="text-ink-secondary hover:text-ink-primary focus-visible:ring-accent -ml-2 inline-flex min-h-11 items-center gap-1 rounded-[var(--r-md)] px-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
      >
        <ChevronLeft aria-hidden className="size-4" />
        Tất cả cuộc trò chuyện
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h1 className="font-display text-ink-primary min-w-0 text-xl font-bold break-words sm:text-2xl">
          {conversationTitle(conversation)}
        </h1>
        <ToneBadge label={status.label} tone={status.tone} size="sm" />
      </div>
      <p className="text-ink-secondary flex items-center gap-2 text-sm">
        <span
          aria-hidden
          className={cn("size-2 shrink-0 rounded-full", online ? "bg-positive" : "bg-ink-tertiary")}
        />
        {conversation.assignedAgentName
          ? `${conversation.assignedAgentName} · ${online ? "Đang trực tuyến" : "Ngoại tuyến"}`
          : "Đang chờ Sale nhận cuộc trò chuyện"}
      </p>
      {conversation.contexts.length > 0 ? (
        <ul aria-label="Chứng từ của cuộc trò chuyện" className="flex flex-wrap gap-2">
          {conversation.contexts.map((context) => {
            const href = contextHref(context);
            const text = `${contextKindLabel(context.kind)}${context.label ? ` ${context.label}` : ""}`;
            const chip =
              "border-border-default bg-bg-surface inline-flex min-h-11 items-center rounded-full border px-3 text-sm";
            return (
              <li key={context.id}>
                {href ? (
                  <Link
                    href={href}
                    className={cn(
                      chip,
                      "text-accent hover:bg-bg-muted focus-visible:ring-accent font-medium focus-visible:ring-2 focus-visible:outline-none",
                    )}
                  >
                    {text}
                  </Link>
                ) : (
                  <span className={cn(chip, "text-ink-secondary")}>{text}</span>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
      {isEnded(conversation.status) ? null : (
        <ResponseExpectation
          expectedResponseAt={conversation.expectedResponseAt}
          withinBusinessHours={conversation.withinBusinessHours}
        />
      )}
    </header>
  );
}
