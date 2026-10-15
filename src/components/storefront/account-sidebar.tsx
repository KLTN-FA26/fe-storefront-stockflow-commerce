"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, MessageCircle, UserRound } from "lucide-react";

import { cn } from "@/lib/cn";
import { STORE_ROUTES } from "@/constants";

import { accountNavItems, type AccountNavItem } from "./account-nav-items";

function isActive(pathname: string, item: AccountNavItem) {
  return item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function AccountSidebar() {
  const pathname = usePathname();
  const mobileNavRef = useRef<HTMLElement>(null);

  // Keep the active pill visible when the mobile tab strip overflows.
  useEffect(() => {
    const nav = mobileNavRef.current;
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (nav && active) {
      const navRect = nav.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      nav.scrollLeft += activeRect.left - navRect.left - (navRect.width - activeRect.width) / 2;
    }
  }, [pathname]);

  return (
    <>
      {/* Mobile: horizontally scrollable pill tabs keep every section one tap away. */}
      <nav
        ref={mobileNavRef}
        aria-label="Tài khoản"
        className="-mx-4 overflow-x-auto px-4 sm:-mx-6 sm:px-6 lg:hidden"
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
                      ? "border-accent bg-accent text-ink-inverse shadow-sm"
                      : "border-border-default bg-bg-surface text-ink-secondary hover:text-ink-primary",
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Desktop: compact sticky sidebar card, pinned below the two-tier site header. */}
      <aside className="hidden lg:sticky lg:top-[var(--sticky-top)] lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:block lg:self-start">
        <div className="space-y-3">
          <div className="border-border-default bg-bg-surface rounded-[var(--r-lg)] border p-2 shadow-[var(--card-shadow)]">
            <div className="border-border-default mb-1 flex items-center gap-2.5 border-b px-2 pt-1 pb-3">
              <span className="bg-accent/10 text-accent flex size-9 shrink-0 items-center justify-center rounded-full">
                <UserRound className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="font-display text-ink-primary truncate text-sm font-semibold">
                  Tài khoản của tôi
                </p>
                <p className="text-ink-tertiary truncate text-xs">Quản lý hồ sơ & đơn hàng</p>
              </div>
            </div>

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
                          "group focus-visible:ring-accent relative flex min-h-11 items-center gap-2.5 rounded-[var(--r-md)] px-3 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none",
                          active
                            ? "bg-accent/10 text-accent font-semibold"
                            : "text-ink-secondary hover:bg-bg-muted hover:text-ink-primary font-medium",
                        )}
                      >
                        {active && (
                          <span
                            className="bg-accent absolute inset-y-2 left-0 w-1 rounded-full"
                            aria-hidden="true"
                          />
                        )}
                        <Icon className="size-4 shrink-0" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        <ChevronRight
                          className={cn(
                            "size-4 shrink-0 transition-transform group-hover:translate-x-0.5",
                            active ? "opacity-100" : "opacity-0 group-hover:opacity-60",
                          )}
                          aria-hidden="true"
                        />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </div>

          <div className="bg-bg-surface border-border-default rounded-[var(--r-lg)] border px-4 pt-3 pb-1">
            <p className="text-ink-primary text-sm font-semibold">Cần hỗ trợ?</p>
            <p className="text-ink-secondary mt-1 text-xs">
              Đội ngũ tư vấn sẵn sàng giúp bạn về đơn hàng và thiết kế.
            </p>
            <Link
              href={STORE_ROUTES.chat.list}
              className="text-accent focus-visible:ring-accent inline-flex min-h-11 items-center gap-2 rounded-[var(--r-md)] text-sm font-semibold hover:underline focus-visible:ring-2 focus-visible:outline-none"
            >
              <MessageCircle className="size-4" aria-hidden="true" />
              Chat với tư vấn viên
            </Link>
          </div>
        </div>
      </aside>
    </>
  );
}
