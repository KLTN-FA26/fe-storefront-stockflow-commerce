"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { STORE_ROUTES } from "@/constants";
import { cn } from "@/lib/cn";

/**
 * The chat area as a messaging app: the conversation list in a column on the left and the open conversation on the
 * right, both the full height of the window under the header. On a phone one shows at a time: the list on `/chat`,
 * the conversation (or a new one) everywhere else.
 */
export function ChatShell({ inbox, children }: { inbox: ReactNode; children: ReactNode }) {
  const onList = usePathname() === STORE_ROUTES.chat.list;
  return (
    <div className="bg-bg-surface lg:grid lg:h-[calc(100dvh-var(--header-h))] lg:grid-cols-[22rem_minmax(0,1fr)] lg:overflow-hidden">
      <aside
        aria-label="Danh sách cuộc trò chuyện"
        className={cn(
          "border-border-default min-h-[calc(100dvh-var(--header-h))] flex-col lg:flex lg:min-h-0 lg:border-r",
          onList ? "flex" : "hidden",
        )}
      >
        {inbox}
      </aside>
      <div
        className={cn(
          "bg-bg-base h-[calc(100dvh-var(--header-h))] min-w-0 flex-col lg:flex lg:h-auto lg:min-h-0",
          onList ? "hidden" : "flex",
        )}
      >
        {children}
      </div>
    </div>
  );
}
