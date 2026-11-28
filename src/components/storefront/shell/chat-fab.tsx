"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle } from "lucide-react";

import { CHAT_WITH_SALES, STORE_ROUTES } from "@/constants";
import { cn } from "@/lib/cn";

import { ChatUnreadBadge } from "@/features/chat/components/chat-entry";

import { Button } from "@/components/ui/button";

interface ChatFabProps {
  /**
   * Background of the room kept free under the page on a phone, so it reads as part of what is
   * above it (the footer's surface) rather than a strip of another colour.
   */
  spaceClassName?: string | undefined;
}

/**
 * Pages that carry their own way to chat, where a floating button would be a third entry and cover
 * content (UI/UX 27/11, sf-02, sf-04, sf-10, sf-12): the chat itself (it would cover the composer);
 * the account area, whose rail and phone tab strip hold "Chat với Sale" (the pager's "Sau", the
 * contract steps sat under the button); a design project, with its own "Chat với Sale" and a sticky
 * bar at the bottom.
 */
export function hidesChatFab(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const under = (root: string) => pathname === root || pathname.startsWith(`${root}/`);
  return (
    under(STORE_ROUTES.chat.list) ||
    under(STORE_ROUTES.account.home) ||
    under("/credit-requests") ||
    // One project, not the list of projects.
    pathname.startsWith(`${STORE_ROUTES.design.projects}/`)
  );
}

/**
 * Floating shortcut to sales chat, with the unread badge; hidden where the page has its own chat
 * entry ({@link hidesChatFab}).
 *
 * On a phone the button sits over the right edge of the content (an order line's amount on a
 * 375px screen), so the page ends with as much room as the button takes (48px + its 20px offset,
 * plus a margin): scrolled to the bottom, the last content is never under it. The room comes and
 * goes with the button, so the chat pages keep their full height.
 */
export function ChatFab({ spaceClassName }: ChatFabProps) {
  const pathname = usePathname();
  if (hidesChatFab(pathname)) return null;

  return (
    <>
      <div
        aria-hidden="true"
        data-chat-fab-space
        className={cn("h-20 md:hidden", spaceClassName)}
      />
      <div className="fixed right-5 bottom-5 z-50">
        <Button asChild size="icon" variant="secondary" className="size-12 rounded-full shadow-lg">
          <Link href={STORE_ROUTES.chat.list} aria-label={CHAT_WITH_SALES}>
            <MessageCircle className="size-5" />
          </Link>
        </Button>
        <ChatUnreadBadge />
      </div>
    </>
  );
}
