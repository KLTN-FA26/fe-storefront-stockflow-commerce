"use client";

import Link from "next/link";
import { MessageCircle } from "lucide-react";

import { STORE_ROUTES } from "@/constants";
import { PERM } from "@/lib/auth/permission-codes";
import { useHasPermission } from "@/lib/auth/my-permissions";
import { useSignedIn } from "@/lib/auth/use-signed-in";

import { useChatUnread } from "../queries";

/** The unread messages of the signed-in customer (C14), 0 for a visitor; polled lightly. */
function useUnreadMessages(): number {
  const signedIn = useSignedIn();
  const canRead = useHasPermission(PERM.chatRead);
  const unread = useChatUnread(signedIn === true && canRead);
  return unread.data?.messages ?? 0;
}

const badgeText = (count: number) => (count > 99 ? "99+" : String(count));

/** The header's chat entry with its unread badge. */
export function ChatHeaderLink({ className }: { className: string }) {
  const count = useUnreadMessages();
  return (
    <Link
      href={STORE_ROUTES.chat.list}
      className={className}
      aria-label={count > 0 ? `Tư vấn, ${count} tin nhắn chưa đọc` : undefined}
    >
      <span className="relative inline-flex">
        <MessageCircle className="size-5" aria-hidden="true" />
        {count > 0 ? (
          <span
            aria-hidden
            className="bg-danger text-ink-inverse absolute -top-1.5 -right-2 flex min-h-4 min-w-4 items-center justify-center rounded-full px-1 text-[0.625rem] font-semibold tabular-nums"
          >
            {badgeText(count)}
          </span>
        ) : null}
      </span>
      <span className="sr-only lg:not-sr-only">Tư vấn</span>
    </Link>
  );
}

/** The same count as a dot-badge over another chat entry (the floating button on phones). */
export function ChatUnreadBadge() {
  const count = useUnreadMessages();
  if (count === 0) return null;
  return (
    <span
      role="status"
      aria-label={`${count} tin nhắn chưa đọc`}
      className="bg-danger text-ink-inverse pointer-events-none absolute -top-1 -right-1 flex min-h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-semibold tabular-nums"
    >
      {badgeText(count)}
    </span>
  );
}
