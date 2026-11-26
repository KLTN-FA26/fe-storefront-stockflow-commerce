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
 * cover the composer, and from lg up in the account area, whose rail already links to the chat.
 *
 * On a phone the button sits over the right edge of the content (an order line's amount on a
 * 375px screen), so the page ends with as much room as the button takes (48px + its 20px offset,
 * plus a margin): scrolled to the bottom, the last content is never under it. The room comes and
 * goes with the button, so the chat pages keep their full height.
 */
export function ChatFab({ spaceClassName }: ChatFabProps) {
  const pathname = usePathname();
  if (pathname?.startsWith(STORE_ROUTES.chat.list)) return null;
  // The account area has its own "Chat với Sale" in the rail from lg up: there the button would only sit over the
  // last row of a list (the "Sau" button of the quotes and orders lists), so it stays a phone and tablet shortcut.
  const railHasChat = pathname?.startsWith(STORE_ROUTES.account.home) === true;

  return (
    <>
      <div
        aria-hidden="true"
        data-chat-fab-space
        className={cn("h-20", railHasChat ? "lg:hidden" : "md:hidden", spaceClassName)}
      />
      <div className={cn("fixed right-5 bottom-5 z-50", railHasChat && "lg:hidden")}>
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
