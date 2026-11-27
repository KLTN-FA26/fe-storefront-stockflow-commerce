"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle } from "lucide-react";

import { cn } from "@/lib/cn";
import { CHAT_WITH_SALES, STORE_ROUTES } from "@/constants";
import { useHydrated } from "@/hooks/use-hydrated";
import { useAuthStore } from "@/lib/auth/auth-store";

import { LogoutButton } from "@/features/auth/components/logout-button";
import { ChatUnreadBadge } from "@/features/chat/components/chat-entry";

import { accountNavItems, type AccountNavItem } from "./account-nav-items";

function isActive(pathname: string, item: AccountNavItem) {
  return item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/**
 * How far to scroll a horizontal strip so `item` is wholly in view, keeping `edge` px of room: 0 when
 * it already is, so the strip keeps starting at its first item.
 */
export function scrollToReveal(strip: HTMLElement, item: HTMLElement, edge = 16): number {
  const view = strip.getBoundingClientRect();
  const box = item.getBoundingClientRect();
  if (box.left < view.left + edge) return box.left - view.left - edge;
  if (box.right > view.right - edge) return box.right - view.right + edge;
  return 0;
}

export function AccountSidebar() {
  const pathname = usePathname();
  const mobileNavRef = useRef<HTMLElement>(null);

  // Keep the active pill visible when the mobile tab strip overflows, scrolling only as far as it
  // takes: the strip starts at its first tab, and centring an active tab that is already in view
  // cut the first one off at the left edge (UI/UX 27/11, sf-10).
  useEffect(() => {
    const nav = mobileNavRef.current;
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (nav && active) nav.scrollLeft += scrollToReveal(nav, active);
  }, [pathname]);

  return (
    <>
      {/* Mobile: horizontally scrollable pill tabs keep every section one tap away. */}
      <nav
        ref={mobileNavRef}
        aria-label="Tài khoản"
        className="border-border-default overflow-x-auto border-b px-4 py-3 sm:px-6 lg:hidden"
      >
        <ul className="flex w-max gap-2 pb-1">
          {accountNavItems.map((item) => {
            const active = isActive(pathname, item);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "focus-visible:ring-accent inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:outline-none",
                    active
                      ? "border-ink-primary bg-bg-muted text-ink-primary"
                      : "border-border-default bg-bg-surface text-ink-secondary hover:text-ink-primary",
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {item.label}
                </Link>
              </li>
            );
          })}
          {/* The floating chat button is hidden in the account area: chat is a tab here, as in the rail. */}
          <li className="relative">
            <Link
              href={STORE_ROUTES.chat.list}
              className="border-border-default bg-bg-surface text-ink-secondary hover:text-ink-primary focus-visible:ring-accent inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              <MessageCircle className="size-4" aria-hidden="true" />
              {CHAT_WITH_SALES}
            </Link>
            <ChatUnreadBadge />
          </li>
          <li>
            <LogoutButton className="border-border-default bg-bg-surface text-ink-secondary rounded-full border px-4 text-sm whitespace-nowrap" />
          </li>
        </ul>
      </nav>

      {/* Desktop: a rail flush with the window's left edge, as in the back office: full height under the site header,
          sticky while the page scrolls. */}
      <aside className="bg-bg-surface border-border-default hidden border-r px-3 pt-6 pb-3 lg:sticky lg:top-[var(--header-h)] lg:flex lg:h-[calc(100dvh-var(--header-h))] lg:flex-col lg:overflow-y-auto">
        <p className="text-ink-tertiary px-3 pb-2 text-xs font-medium">Tài khoản của tôi</p>
        <nav aria-label="Tài khoản">
          <ul className="space-y-0.5">
            {accountNavItems.map((item) => {
              const active = isActive(pathname, item);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "focus-visible:ring-accent relative flex min-h-11 items-center gap-3 rounded-[var(--r-md)] px-3 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none",
                      active
                        ? "bg-bg-muted text-ink-primary font-semibold"
                        : "text-ink-secondary hover:bg-bg-subtle hover:text-ink-primary",
                    )}
                  >
                    {active ? (
                      <span
                        className="bg-accent absolute inset-y-2.5 left-0 w-0.5 rounded-full"
                        aria-hidden="true"
                      />
                    ) : null}
                    <Icon
                      className={cn(
                        "size-4 shrink-0",
                        active ? "text-accent" : "text-ink-tertiary",
                      )}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="mt-auto space-y-3 pt-3">
          <Link
            href={STORE_ROUTES.chat.list}
            className="text-ink-secondary hover:bg-bg-subtle hover:text-ink-primary focus-visible:ring-accent flex min-h-11 items-center gap-3 rounded-[var(--r-md)] px-3 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
            <MessageCircle className="text-ink-tertiary size-4 shrink-0" aria-hidden="true" />
            Chat với Sale
          </Link>
          <AccountFooter />
        </div>
      </aside>
    </>
  );
}

/** Initials of a name for the avatar: "Công ty CP Trà Sữa Mây" → "CM". */
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0]?.[0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

/**
 * The foot of the rail, as in the back office: who is signed in (name and e-mail, from the session) and an icon to
 * sign out. The session lives in localStorage, so nothing is shown before hydration.
 */
function AccountFooter() {
  const hydrated = useHydrated();
  const user = useAuthStore((state) => state.user);
  const name = hydrated ? (user?.fullName ?? "") : "";
  const email = hydrated ? (user?.email ?? "") : "";
  return (
    <div className="border-border-default flex items-center gap-3 border-t px-1 pt-3">
      <span
        aria-hidden="true"
        className="bg-accent/10 text-accent flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
      >
        {name ? initialsOf(name) : null}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-ink-primary truncate text-sm font-medium" title={name || undefined}>
          {name || "Tài khoản"}
        </p>
        {email ? (
          <p className="text-ink-tertiary truncate text-xs" title={email}>
            {email}
          </p>
        ) : null}
      </div>
      <LogoutButton iconOnly className="text-ink-tertiary hover:text-danger shrink-0" />
    </div>
  );
}
