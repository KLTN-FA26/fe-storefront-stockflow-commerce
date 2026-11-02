"use client";

import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { NOTIFICATION_CONFIG, NOTIFICATION_LABELS } from "@/constants/notifications";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import { useMarkAllRead, useMarkRead } from "../mutations";
import { useInboxOwner, useMyInbox, useMyUnreadCount } from "../queries";
import { NotificationItems } from "./notification-items";

import type { NotificationItem } from "../types";

const L = NOTIFICATION_LABELS;

/**
 * Customer-only header action. Without an inbox owner (anonymous, expired token, no user id) nothing
 * is fetched or shown.
 */
export function NotificationBell() {
  const router = useRouter();
  const owner = useInboxOwner();
  const [open, setOpen] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(0);
  const inbox = useMyInbox({ page, unreadOnly, size: NOTIFICATION_CONFIG.pageSize });
  const count = useMyUnreadCount(inbox.isSuccess);
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();
  const unreadCount = count.data ?? inbox.data?.unreadCount ?? 0;
  // Mark-all-read (or rows read elsewhere) can shrink the unread filter below the current page;
  // step back to the last page that exists instead of an empty page with no pager.
  const lastPage = Math.max(0, (inbox.data?.totalPages ?? 1) - 1);
  if (inbox.data && page > lastPage) setPage(lastPage);

  const select = (item: NotificationItem) => {
    if (!item.read) markRead.mutate(item.id, { onError: () => toast.error(L.updateError) });
    if (item.link) {
      setOpen(false);
      router.push(item.link);
    }
  };

  if (owner === null) return null;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void inbox.refetch();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-ink-secondary hover:bg-bg-muted focus-visible:ring-accent relative size-11 shrink-0 rounded-full focus-visible:ring-2"
          aria-label={unreadCount ? L.badge(unreadCount) : L.title}
          aria-expanded={open}
        >
          <Bell className="size-5" aria-hidden />
          {unreadCount > 0 && (
            <span className="bg-danger text-ink-inverse absolute -top-0.5 -right-0.5 flex min-h-4 min-w-4 items-center justify-center rounded-full px-1 text-[0.625rem] font-semibold tabular-nums">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="border-border-default bg-bg-surface text-ink-primary w-96 max-w-[calc(100vw-1rem)] gap-0 rounded-[var(--r-lg)] border p-0 shadow-[var(--sh-lg)]"
      >
        <div className="border-border-default flex items-center justify-between gap-2 border-b px-4 py-3">
          <h2 className="font-display text-base font-semibold">{L.title}</h2>
          <Button
            type="button"
            variant="ghost"
            className="text-accent h-11 shrink-0 px-2 text-xs"
            disabled={unreadCount === 0 || markAll.isPending}
            onClick={() => markAll.mutate(undefined, { onError: () => toast.error(L.updateError) })}
          >
            {L.markAllRead}
          </Button>
        </div>
        <div className="border-border-default flex gap-1 border-b px-3 py-1.5">
          {([false, true] as const).map((onlyUnread) => (
            <Button
              key={String(onlyUnread)}
              type="button"
              variant={unreadOnly === onlyUnread ? "secondary" : "ghost"}
              className="h-11 px-3 text-sm"
              aria-pressed={unreadOnly === onlyUnread}
              onClick={() => {
                setUnreadOnly(onlyUnread);
                setPage(0);
              }}
            >
              {onlyUnread ? L.unreadOnly : L.all}
            </Button>
          ))}
        </div>
        <div className="max-h-96 overflow-y-auto" aria-busy={inbox.isFetching}>
          {inbox.isPending ? (
            <p className="text-ink-tertiary px-4 py-8 text-center text-sm">{L.loading}</p>
          ) : inbox.isError ? (
            <div className="flex flex-col items-center gap-2 px-4 py-6 text-sm">
              <p role="alert" className="text-danger">
                {L.error}
              </p>
              <Button type="button" className="min-h-11" onClick={() => void inbox.refetch()}>
                {L.retry}
              </Button>
            </div>
          ) : inbox.data?.items.length === 0 ? (
            <p className="text-ink-tertiary px-4 py-8 text-center text-sm">
              {unreadOnly ? L.emptyUnread : L.empty}
            </p>
          ) : (
            <NotificationItems items={inbox.data?.items ?? []} onSelect={select} />
          )}
        </div>
        {inbox.data && inbox.data.totalPages > 1 && (
          <div className="border-border-default flex items-center justify-between gap-2 border-t px-3 py-1.5">
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              disabled={!inbox.data.hasPrevious}
              onClick={() => setPage((p) => p - 1)}
            >
              {L.previous}
            </Button>
            <span className="text-ink-tertiary text-xs tabular-nums">
              {L.page(page + 1, inbox.data.totalPages)}
            </span>
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              disabled={!inbox.data.hasNext}
              onClick={() => setPage((p) => p + 1)}
            >
              {L.next}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
