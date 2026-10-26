import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

import { Breadcrumbs, type BreadcrumbItem } from "./breadcrumbs";

type PageShellProps = {
  breadcrumbs?: BreadcrumbItem[] | undefined;
  title?: string | undefined;
  subtitle?: string | undefined;
  actions?: ReactNode;
  width?: "default" | "narrow" | undefined;
  className?: string | undefined;
  children: ReactNode;
};

export function PageShell({
  breadcrumbs,
  title,
  subtitle,
  actions,
  width = "default",
  className,
  children,
}: PageShellProps) {
  const hasHeading = Boolean(breadcrumbs?.length || title || subtitle || actions);
  return (
    <div
      className={cn(
        "mx-auto w-full space-y-8 px-4 py-5 sm:px-6 lg:space-y-10 lg:px-8 lg:py-6",
        width === "narrow" ? "max-w-3xl" : "max-w-7xl",
        className,
      )}
    >
      {hasHeading ? (
        <div className="space-y-3">
          {breadcrumbs?.length ? <Breadcrumbs items={breadcrumbs} /> : null}
          {title || subtitle || actions ? (
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="min-w-0 space-y-1">
                {title ? (
                  <h1 className="font-display text-ink-primary text-2xl font-bold sm:text-3xl">
                    {title}
                  </h1>
                ) : null}
                {subtitle ? (
                  <p className="text-ink-secondary text-sm sm:text-base">{subtitle}</p>
                ) : null}
              </div>
              {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}
