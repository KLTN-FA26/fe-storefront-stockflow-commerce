import Link from "next/link";

import { STORE_ROUTES } from "@/constants";
import { cn } from "@/lib/cn";

const SECTIONS = [
  { id: "designs", label: "Thiết kế của tôi", href: STORE_ROUTES.design.list },
  { id: "projects", label: "Dự án", href: STORE_ROUTES.design.projects },
] as const;

/** The two sections of the design area (spec 2026-11-12 §5): a link each, the current one marked. */
export function DesignSectionSwitch({ current }: { current: (typeof SECTIONS)[number]["id"] }) {
  return (
    <nav aria-label="Chuyển mục thiết kế" className="mb-4 flex flex-wrap gap-2">
      {SECTIONS.map(({ id, label, href }) => (
        <Link
          key={id}
          href={href}
          aria-current={id === current ? "page" : undefined}
          className={cn(
            "focus-visible:ring-accent focus-visible:ring-offset-bg-base inline-flex min-h-11 items-center rounded-full border px-5 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
            id === current
              ? "bg-accent text-ink-inverse border-transparent"
              : "bg-bg-surface text-ink-secondary border-border-default hover:bg-bg-muted",
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
