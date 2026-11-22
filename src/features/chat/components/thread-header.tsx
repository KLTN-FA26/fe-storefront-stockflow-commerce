"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronLeft } from "lucide-react";

import { STORE_ROUTES } from "@/constants";
import { cn } from "@/lib/cn";

import { ToneBadge } from "@/components/storefront/tone-badge";

import { contextKindLabel, conversationStatusMeta } from "../labels";
import { contextHref, conversationTitle, isEnded } from "../selectors";
import { shownContexts } from "../thread-facts";
import type { ChatConversation } from "../types";
import { ResponseExpectation, responseExpectationText } from "./response-expectation";

interface ThreadHeaderProps {
  conversation: ChatConversation;
  /** Contract id → order id, so a contract chip opens its order's contract section. */
  contractOrders?: Readonly<Record<string, string>>;
}

const CHIP =
  "border-border-default bg-bg-surface inline-flex min-h-11 items-center rounded-full border px-3 text-sm";

/**
 * Subject, status, Sale in charge (marked online only when the BE or the socket says so), what it is about, when Sales
 * should answer. On a phone the documents and the expectation fold into "Chi tiết", so the messages keep the room
 * (SF-UX-22); from `sm` they are always shown.
 */
export function ThreadHeader({ conversation, contractOrders = {} }: ThreadHeaderProps) {
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const status = conversationStatusMeta(conversation.status);
  const online = conversation.agentOnline === true;
  const contexts = shownContexts(conversation.contexts);
  const expectation =
    !isEnded(conversation.status) && responseExpectationText(conversation) !== null;
  const hasDetails = contexts.length > 0 || expectation;
  return (
    <header className="space-y-1.5 sm:space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Link
          href={STORE_ROUTES.chat.list}
          className="text-ink-secondary hover:text-ink-primary focus-visible:ring-accent -ml-2 inline-flex min-h-11 items-center gap-1 rounded-[var(--r-md)] px-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
        >
          <ChevronLeft aria-hidden className="size-4" />
          Tất cả cuộc trò chuyện
        </Link>
        {hasDetails ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={detailsId}
            onClick={() => setOpen((value) => !value)}
            className="text-accent hover:bg-bg-muted focus-visible:ring-accent -mr-2 inline-flex min-h-11 shrink-0 items-center gap-1 rounded-[var(--r-md)] px-2 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none sm:hidden"
          >
            Chi tiết
            <ChevronDown
              aria-hidden
              className={cn("size-4 transition-transform", open && "rotate-180")}
            />
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h1 className="font-display text-ink-primary min-w-0 text-lg font-bold break-words sm:text-2xl">
          {conversationTitle(conversation)}
        </h1>
        <ToneBadge label={status.label} tone={status.tone} size="sm" />
      </div>
      <p className="text-ink-secondary flex items-center gap-2 text-sm">
        {online ? <span aria-hidden className="bg-positive size-2 shrink-0 rounded-full" /> : null}
        {conversation.assignedAgentName
          ? `Sale phụ trách: ${conversation.assignedAgentName}${online ? " · Đang trực tuyến" : ""}`
          : "Đang chờ Sale nhận cuộc trò chuyện"}
      </p>
      {hasDetails ? (
        <div id={detailsId} className={cn("space-y-2 sm:block", open ? "block" : "hidden")}>
          {contexts.length > 0 ? (
            <ul aria-label="Chứng từ của cuộc trò chuyện" className="flex flex-wrap gap-2">
              {contexts.map((context) => {
                const href = contextHref(context, contractOrders[context.refId]);
                const text = `${contextKindLabel(context.kind)}${context.label ? ` ${context.label}` : ""}`;
                return (
                  <li key={context.id}>
                    {href ? (
                      <Link
                        href={href}
                        className={cn(
                          CHIP,
                          "text-accent hover:bg-bg-muted focus-visible:ring-accent font-medium focus-visible:ring-2 focus-visible:outline-none",
                        )}
                      >
                        {text}
                      </Link>
                    ) : (
                      <span className={cn(CHIP, "text-ink-secondary")}>{text}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : null}
          {expectation ? (
            <ResponseExpectation
              expectedResponseAt={conversation.expectedResponseAt}
              withinBusinessHours={conversation.withinBusinessHours}
            />
          ) : null}
        </div>
      ) : null}
    </header>
  );
}
