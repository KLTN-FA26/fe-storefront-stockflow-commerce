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
 * Floating shortcut to sales chat, with the unread badge; hidden on chat pages, where it would
 * cover the composer.
 *
 * On a phone the button sits over the right edge of the content (an order line's amount on a
 * 375px screen), so the page ends with as much room as the button takes (48px + its 20px offset,
 * plus a margin): scrolled to the bottom, the last content is never under it. The room comes and
 * goes with the button, so the chat pages keep their full height.
 */
export function ChatFab({ spaceClassName }: ChatFabProps) {
  const pathname = usePathname();
  if (pathname?.startsWith(STORE_ROUTES.chat.list)) return null;

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
