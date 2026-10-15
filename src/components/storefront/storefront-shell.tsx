import { ChatFab } from "@/components/storefront/shell/chat-fab";
import { SiteFooter } from "@/components/storefront/shell/site-footer";
import { SiteHeader } from "@/components/storefront/shell/site-header";

import type { ReactNode } from "react";

export function StorefrontShell({ children }: { children: ReactNode }) {
  return (
    <div className="bg-bg-base text-ink-primary flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
      <ChatFab />
    </div>
  );
}
