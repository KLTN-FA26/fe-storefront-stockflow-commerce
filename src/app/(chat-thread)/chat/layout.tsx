import { Suspense } from "react";

import { ChatListScreen } from "@/features/chat";
import { ChatShell } from "@/features/chat/components/chat-shell";
import { ConversationListSkeleton } from "@/features/chat/components/chat-states";

import type { ReactNode } from "react";

/** Every chat page shares the conversation list on the left (a messaging app, not a page per step). */
export default function ChatLayout({ children }: { children: ReactNode }) {
  return (
    <ChatShell
      inbox={
        // nuqs reads the list's page: Suspense keeps the rest of the route static.
        <Suspense fallback={<ConversationListSkeleton />}>
          <ChatListScreen />
        </Suspense>
      }
    >
      {children}
    </ChatShell>
  );
}
