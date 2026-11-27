"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, Files, FileText } from "lucide-react";

import { STORE_ROUTES } from "@/constants";

import { ToneBadge } from "@/components/storefront/tone-badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

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

/**
 * Subject, status, Sale in charge (marked online only when the BE or the socket says so), when Sales should answer,
 * and a "Chứng từ (n)" button that slides the documents the conversation is about out in a side panel, so a long list
 * of them never pushes the messages down.
 */
export function ThreadHeader({ conversation, contractOrders = {} }: ThreadHeaderProps) {
  const status = conversationStatusMeta(conversation.status);
  const online = conversation.agentOnline === true;
  const contexts = shownContexts(conversation.contexts);
  const expectation =
    !isEnded(conversation.status) && responseExpectationText(conversation) !== null;
  return (
    <header className="flex items-center gap-3">
      <Link
        href={STORE_ROUTES.chat.list}
        aria-label="Tất cả cuộc trò chuyện"
        className="text-ink-secondary hover:text-ink-primary focus-visible:ring-accent -ml-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:outline-none lg:hidden"
      >
        <ChevronLeft aria-hidden className="size-5" />
      </Link>
      <div className="min-w-0 flex-1 space-y-0.5">
        {/* The status reads as part of the title line, as a messaging app marks a thread. */}
        <div className="flex min-w-0 items-start gap-2">
          <h1 className="font-display text-ink-primary line-clamp-2 min-w-0 text-base font-semibold break-words sm:text-lg">
            {conversationTitle(conversation)}
          </h1>
          <span className="shrink-0">
            <ToneBadge label={status.label} tone={status.tone} size="sm" />
          </span>
        </div>
        <p className="text-ink-secondary flex items-center gap-2 text-sm">
          {online ? (
            <span aria-hidden className="bg-positive size-2 shrink-0 rounded-full" />
          ) : null}
          {conversation.assignedAgentName
            ? `Sale phụ trách: ${conversation.assignedAgentName}${online ? " · Đang trực tuyến" : ""}`
            : "Đang chờ Sale nhận cuộc trò chuyện"}
        </p>
        {expectation ? (
          <ResponseExpectation
            className="text-xs"
            expectedResponseAt={conversation.expectedResponseAt}
            withinBusinessHours={conversation.withinBusinessHours}
          />
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {contexts.length > 0 ? (
          <Sheet>
            <SheetTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="min-h-11 rounded-[var(--r-md)] px-3"
              >
                <Files aria-hidden className="size-4" />
                <span>
                  Chứng từ <span className="tabular-nums">({contexts.length})</span>
                </span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="bg-bg-surface w-full gap-0 sm:max-w-md">
              <SheetHeader className="border-border-default border-b px-5 py-4">
                <SheetTitle className="font-display text-ink-primary text-base font-semibold">
                  Chứng từ của cuộc trò chuyện
                </SheetTitle>
                <SheetDescription className="text-ink-secondary text-sm">
                  Bấm vào một chứng từ để mở trang của nó.
                </SheetDescription>
              </SheetHeader>
              <ul
                aria-label="Chứng từ của cuộc trò chuyện"
                className="space-y-1 overflow-y-auto p-3"
              >
                {contexts.map((context) => {
                  const href = contextHref(context, contractOrders[context.refId]);
                  const kind = contextKindLabel(context.kind);
                  const text = `${kind}${context.label ? ` ${context.label}` : ""}`;
                  const body = (
                    <>
                      <span
                        aria-hidden
                        className="bg-accent/10 text-accent flex size-9 shrink-0 items-center justify-center rounded-[var(--r-md)]"
                      >
                        <FileText className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="text-ink-tertiary block text-xs">{kind}</span>
                        <span className="text-ink-primary block truncate text-sm font-medium">
                          {context.label ?? kind}
                        </span>
                      </span>
                    </>
                  );
                  return (
                    <li key={context.id}>
                      {href ? (
                        <Link
                          href={href}
                          aria-label={text}
                          className="hover:bg-bg-subtle focus-visible:ring-accent flex min-h-14 items-center gap-3 rounded-[var(--r-md)] px-3 py-2 focus-visible:ring-2 focus-visible:outline-none"
                        >
                          {body}
                          <ChevronRight aria-hidden className="text-ink-tertiary size-4 shrink-0" />
                        </Link>
                      ) : (
                        <div
                          aria-label={text}
                          className="flex min-h-14 items-center gap-3 px-3 py-2"
                        >
                          {body}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </SheetContent>
          </Sheet>
        ) : null}
      </div>
    </header>
  );
}
