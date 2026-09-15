import Link from "next/link";
import { Menu, MessageCircle, Search, ShoppingBag, UserRound } from "lucide-react";

import { BRAND, STORE_ROUTES } from "@/constants";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/storefront/theme-toggle";

import type { ReactNode } from "react";

const navItems = [
  { href: STORE_ROUTES.catalog.list, label: "Sản phẩm" },
  { href: STORE_ROUTES.design.list, label: "Thiết kế" },
  { href: STORE_ROUTES.chat.list, label: "Tư vấn" },
  { href: STORE_ROUTES.account.orders.list, label: "Đơn hàng" },
] as const;

const footerColumns = [
  { title: "Mua sắm", links: [{ href: STORE_ROUTES.catalog.list, label: "Catalog" }, { href: STORE_ROUTES.design.list, label: "Thiết kế riêng" }, { href: STORE_ROUTES.cart, label: "Giỏ hàng" }] },
  { title: "Hỗ trợ", links: [{ href: STORE_ROUTES.chat.list, label: "Sales chat" }, { href: STORE_ROUTES.account.orders.list, label: "Theo dõi đơn" }, { href: STORE_ROUTES.account.addresses, label: "Sổ địa chỉ" }] },
  { title: "Tài khoản", links: [{ href: STORE_ROUTES.account.home, label: "Customer portal" }, { href: STORE_ROUTES.account.security, label: "Bảo mật" }, { href: STORE_ROUTES.account.privacy, label: "Quyền riêng tư" }] },
] as const;

export function StorefrontShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-bg-base text-ink-primary">
      <header className="sticky top-0 z-40 border-b border-border-default bg-bg-surface/90 shadow-sm backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Sheet>
              <SheetTrigger asChild>
                <Button type="button" size="icon" variant="ghost" className="rounded-full md:hidden" aria-label="Mở menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="border-border-default bg-bg-surface text-ink-primary">
                <SheetHeader>
                  <SheetTitle className="font-display text-xl">
                    <span>{BRAND.wordmark.primary}</span><span className="text-accent">{BRAND.wordmark.accent}</span>
                  </SheetTitle>
                </SheetHeader>
                <nav className="grid gap-2 px-4">
                  {navItems.map((item) => (
                    <Button key={item.href} asChild variant="ghost" className="h-11 justify-start rounded-full text-ink-primary">
                      <Link href={item.href}>{item.label}</Link>
                    </Button>
                  ))}
                </nav>
              </SheetContent>
            </Sheet>
            <Link href="/" className="font-display text-lg font-bold tracking-tight">
              <span>{BRAND.wordmark.primary}</span>
              <span className="text-accent">{BRAND.wordmark.accent}</span>
            </Link>
          </div>

          <nav className="hidden items-center gap-6 text-sm font-medium text-ink-secondary md:flex">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} className="transition-colors hover:text-ink-primary">
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Button asChild size="icon" variant="ghost" className="hidden rounded-full sm:inline-flex" aria-label="Tìm kiếm">
              <Link href={STORE_ROUTES.catalog.search}><Search className="h-4 w-4" /></Link>
            </Button>
            <Button asChild size="icon" variant="ghost" className="hidden rounded-full sm:inline-flex" aria-label="Tài khoản">
              <Link href={STORE_ROUTES.account.home}><UserRound className="h-4 w-4" /></Link>
            </Button>
            <ThemeToggle />
            <Button asChild size="sm" className="relative rounded-full">
              <Link href={STORE_ROUTES.cart}>
                <ShoppingBag className="h-4 w-4" />
                <span className="hidden sm:inline">Giỏ hàng</span>
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-ink-inverse">2</span>
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-border-default bg-bg-surface">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.2fr_repeat(3,1fr)] lg:px-8">
          <div className="space-y-3">
            <Link href="/" className="font-display text-xl font-bold tracking-tight">
              <span>{BRAND.wordmark.primary}</span><span className="text-accent">{BRAND.wordmark.accent}</span>
            </Link>
            <p className="max-w-sm text-sm text-ink-secondary">Storefront TMĐT cho sản phẩm in ấn, thiết kế cá nhân hóa và theo dõi đơn hàng trong một trải nghiệm mobile-first.</p>
          </div>
          {footerColumns.map((column) => (
            <div key={column.title} className="space-y-3">
              <h2 className="text-sm font-semibold text-ink-primary">{column.title}</h2>
              <div className="grid gap-2 text-sm text-ink-secondary">
                {column.links.map((link) => (
                  <Link key={link.href} href={link.href} className="transition-colors hover:text-accent">{link.label}</Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </footer>

      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-3">
        <Button asChild size="icon" className="h-12 w-12 rounded-full shadow-lg">
          <Link href={STORE_ROUTES.cart} aria-label="Mở giỏ hàng">
            <ShoppingBag className="h-5 w-5" />
          </Link>
        </Button>
        <Button asChild size="icon" variant="secondary" className="h-12 w-12 rounded-full shadow-lg">
          <Link href={STORE_ROUTES.chat.list} aria-label="Mở tư vấn">
            <MessageCircle className="h-5 w-5" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
