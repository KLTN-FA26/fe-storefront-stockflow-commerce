import { ChatFab } from "@/components/storefront/shell/chat-fab";
import { SiteFooter } from "@/components/storefront/shell/site-footer";
import { SiteHeader } from "@/components/storefront/shell/site-header";

import type { ReactNode } from "react";

interface StorefrontShellProps {
  children: ReactNode;
  /** False for a full-height screen (one chat conversation): no footer below it. */
  footer?: boolean;
}

export function StorefrontShell({ children, footer = true }: StorefrontShellProps) {
  return (
    <div className="bg-bg-base text-ink-primary flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      {footer ? <SiteFooter /> : null}
      <ChatFab spaceClassName={footer ? "bg-bg-surface" : undefined} />
    </div>
  );
}
