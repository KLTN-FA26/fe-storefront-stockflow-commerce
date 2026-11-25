import Link from "next/link";
import { FolderOpen, Palette } from "lucide-react";

import { STORE_ROUTES } from "@/constants";
import { cn } from "@/lib/cn";

const SECTIONS = [
  { id: "designs", label: "Thiết kế của tôi", href: STORE_ROUTES.design.list, icon: Palette },
  { id: "projects", label: "Dự án", href: STORE_ROUTES.design.projects, icon: FolderOpen },
] as const;

/**
 * The two sections of the design area (spec 2026-11-12 §5): one rounded switch, a link each with its icon, the current
 * one a solid blue pill inside a white track. Kept apart from the status tabs below it (a grey track with a white pill).
 */
export function DesignSectionSwitch({ current }: { current: (typeof SECTIONS)[number]["id"] }) {
  return (
    <nav
      aria-label="Chuyển mục thiết kế"
      className="bg-bg-surface border-border-default mb-5 inline-flex rounded-full border p-1"
    >
      {SECTIONS.map(({ id, label, href, icon: Icon }) => {
        const active = id === current;
        return (
          <Link
            key={id}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "focus-visible:ring-accent/40 inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none",
              active
                ? "bg-accent text-ink-inverse"
                : "text-ink-secondary hover:text-ink-primary",
            )}
          >
            <Icon aria-hidden className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
