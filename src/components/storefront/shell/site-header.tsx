import Link from "next/link";
import { MessageCircle, ShoppingBag, UserRound } from "lucide-react";

import { BRAND, STORE_ROUTES } from "@/constants";
import { cn } from "@/lib/cn";

import { ThemeToggle } from "@/components/storefront/theme-toggle";

import { HeaderSearch } from "./header-search";
import { MobileNav } from "./mobile-nav";
import { categoryLinks, utilityLinks } from "./nav-config";

const container = "mx-auto flex h-full w-full max-w-7xl items-center px-4 sm:px-6 lg:px-8";
const focusRing = "focus-visible:ring-accent focus-visible:ring-2 focus-visible:outline-none";
const actionLink = cn(
  "text-ink-secondary hover:bg-bg-muted hover:text-ink-primary inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-[var(--r-md)] px-2.5 text-sm font-medium transition-colors",
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
            className={cn(
              "font-display shrink-0 rounded-sm text-lg font-bold tracking-tight",
              focusRing,
            )}
          >
            <span>{BRAND.wordmark.primary}</span>
            <span className="text-accent">{BRAND.wordmark.accent}</span>
          </Link>
          <HeaderSearch className="mx-auto hidden max-w-xl md:flex" />
          <div className="ml-auto flex items-center gap-1 md:ml-0">
            <Link href={STORE_ROUTES.chat.list} className={cn(actionLink, "hidden sm:inline-flex")}>
              <MessageCircle className="size-5" aria-hidden="true" />
              <span className="sr-only lg:not-sr-only">Tư vấn</span>
            </Link>
            <Link
              href={STORE_ROUTES.account.home}
              className={cn(actionLink, "hidden sm:inline-flex")}
            >
              <UserRound className="size-5" aria-hidden="true" />
              <span className="sr-only lg:not-sr-only">Tài khoản</span>
            </Link>
            <ThemeToggle />
            <Link href={STORE_ROUTES.cart} className={cn(actionLink, "text-ink-primary")}>
              <span className="relative">
                <ShoppingBag className="size-5" aria-hidden="true" />
                <span className="bg-accent text-ink-inverse absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-xs leading-none font-bold tabular-nums">
                  2
                </span>
              </span>
              <span className="sr-only sm:not-sr-only">Giỏ hàng</span>
            </Link>
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
          <nav aria-label="Danh mục sản phẩm" className="-ml-2 flex items-center lg:-ml-3">
            {categoryLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className={cn(
                  tier2Link,
                  "hover:text-accent px-2 lg:px-3",
                  link.highlight ? "text-accent font-semibold" : "text-ink-primary font-medium",
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <nav aria-label="Tiện ích" className="-mr-3 hidden items-center lg:flex">
            {utilityLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className={cn(tier2Link, "text-ink-secondary hover:text-ink-primary px-3")}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </header>
  );
}
