import Link from "next/link";

import { BRAND } from "@/constants";
import { cn } from "@/lib/cn";

import { HeaderAccountLink } from "@/features/auth/components/header-account-link";
import { ChatHeaderLink } from "@/features/chat/components/chat-entry";
import { NotificationBell } from "@/features/notification";
import { ThemeToggle } from "@/components/storefront/theme-toggle";

import { HeaderSearch } from "./header-search";
import { MobileNav } from "./mobile-nav";
import { mainLinks, utilityLinks } from "./nav-config";
import { NavLink } from "./nav-link";

const mainHrefs = mainLinks.map((link) => link.href);
const utilityHrefs = utilityLinks.map((link) => link.href);

const container = "mx-auto flex h-full w-full max-w-7xl items-center px-4 sm:px-6 lg:px-8";
const focusRing = "focus-visible:ring-accent focus-visible:ring-2 focus-visible:outline-none";
const actionLink = cn(
  "text-ink-secondary hover:bg-bg-subtle hover:text-ink-primary inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-[var(--r-md)] px-2.5 text-sm font-medium transition-colors",
  focusRing,
);
const tier2Link = cn(
  "inline-flex h-11 items-center text-sm whitespace-nowrap transition-colors",
  focusRing,
);

// Heights are load-bearing: h-16 + h-13 (mobile) / h-16 + h-11 (md+) must equal --header-h.
// Borders sit inside those heights (border-box), so never add padding or borders to <header>.
export function SiteHeader() {
  return (
    <header className="bg-bg-surface/95 sticky top-0 z-40 shadow-sm backdrop-blur">
      <div className="border-border-default h-16 md:border-b">
        <div className={cn(container, "gap-2 md:gap-4")}>
          <MobileNav />
          <Link
            href="/"
            aria-label={`${BRAND.name} – Trang chủ`}
            className={cn(
              "font-display shrink-0 rounded-sm text-base font-bold tracking-tight sm:text-lg",
              focusRing,
            )}
          >
            <span>{BRAND.wordmark.primary}</span>
            <span className="text-accent">{BRAND.wordmark.accent}</span>
          </Link>
          <HeaderSearch className="mx-auto hidden max-w-xl md:flex" />
          <div className="ml-auto flex items-center gap-1 md:ml-0">
            <ChatHeaderLink className={cn(actionLink, "hidden sm:inline-flex")} />
            <HeaderAccountLink className={cn(actionLink, "hidden sm:inline-flex")} />
            <NotificationBell />
            <ThemeToggle />
          </div>
        </div>
      </div>

      <div className="border-border-default h-13 border-b md:hidden">
        <div className={container}>
          <HeaderSearch />
        </div>
      </div>

      <div className="border-border-default hidden h-11 border-b md:block">
        <div className={cn(container, "justify-between gap-6")}>
          <nav aria-label="Điều hướng chính" className="-ml-2 flex items-center lg:-ml-3">
            {mainLinks.map((link) => (
              <NavLink
                key={link.label}
                href={link.href}
                siblings={mainHrefs}
                className={cn(tier2Link, "hover:text-accent px-2 lg:px-3")}
                currentClassName="text-accent font-semibold"
                idleClassName="text-ink-primary font-medium"
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
          <nav aria-label="Tiện ích" className="-mr-3 hidden items-center lg:flex">
            {utilityLinks.map((link) => (
              <NavLink
                key={link.label}
                href={link.href}
                siblings={utilityHrefs}
                className={cn(tier2Link, "hover:text-ink-primary px-3")}
                currentClassName="text-ink-primary font-semibold"
                idleClassName="text-ink-secondary"
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </div>
    </header>
  );
}
