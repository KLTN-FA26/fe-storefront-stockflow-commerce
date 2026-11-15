"use client";

import Link from "next/link";

import { STORE_ROUTES } from "@/constants";

import { useStudio } from "./studio-context";
import { useLeaveGuard } from "./use-leave-guard";

/**
 * "Dự án X ›" before the design's name: a link to the project page, asking first while an edit is
 * not stored (`unsaved`), like the back link beside it. It gives way first when the row is tight
 * (`shrink`, a shorter cap below `xl`), so the design's own name keeps its room at 1024 px.
 */
export function StudioProjectCrumb({ unsaved }: { unsaved: boolean }) {
  const { design } = useStudio();
  const { guard, dialog } = useLeaveGuard(unsaved);
  if (!design.project) return null;
  const href = STORE_ROUTES.design.project(design.project.id);
  return (
    <>
      <Link
        href={href}
        title={`Mở trang dự án ${design.project.name}`}
        onClick={guard(href)}
        className="text-ink-secondary hover:text-ink-primary focus-visible:ring-accent inline-flex min-h-11 max-w-32 min-w-0 shrink items-center rounded-[var(--r-md)] px-2 text-sm outline-none focus-visible:ring-2 xl:max-w-48"
      >
        <span className="truncate">Dự án {design.project.name}</span>
      </Link>
      <span aria-hidden className="text-ink-tertiary shrink-0 text-sm">
        ›
      </span>
      {dialog}
    </>
  );
}
