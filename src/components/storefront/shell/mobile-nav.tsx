import Link from "next/link";
import { Menu } from "lucide-react";

import { BRAND } from "@/constants";
import { cn } from "@/lib/cn";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

import { accountLinks, categoryLinks, utilityLinks, type NavLink } from "./nav-config";

const groups: { title: string; links: NavLink[] }[] = [
  { title: "Danh mục", links: categoryLinks },
  { title: "Tài khoản", links: accountLinks },
  { title: "Hỗ trợ", links: utilityLinks },
];

export function MobileNav() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-11 rounded-full md:hidden"
          aria-label="Mở menu"
        >
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="border-border-default bg-bg-surface text-ink-primary overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle className="font-display text-xl">
            <span>{BRAND.wordmark.primary}</span>
            <span className="text-accent">{BRAND.wordmark.accent}</span>
          </SheetTitle>
          <SheetDescription className="sr-only">Danh mục, tài khoản và hỗ trợ</SheetDescription>
        </SheetHeader>
        <nav aria-label="Menu di động" className="grid gap-5 px-4 pb-6">
          {groups.map((group) => (
            <div key={group.title} className="grid gap-1">
              <p className="text-ink-tertiary px-3 text-xs font-semibold">{group.title}</p>
              {group.links.map((link) => (
                <SheetClose asChild key={`${group.title}-${link.label}`}>
                  <Link
                    href={link.href}
                    className={cn(
                      "hover:bg-bg-muted focus-visible:ring-accent flex min-h-11 items-center rounded-[var(--r-md)] px-3 text-sm focus-visible:ring-2 focus-visible:outline-none",
                      link.highlight ? "text-accent font-semibold" : "text-ink-primary font-medium",
                    )}
                  >
                    {link.label}
                  </Link>
                </SheetClose>
              ))}
            </div>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
