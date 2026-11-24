import { cn } from "cn";
import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  actions?: ReactNode;
  subtitle?: string;
  className?: string;
  /**
   * The page is already named elsewhere on screen (the account rail's current item): the heading stays for screen
   * readers only, the subtitle is dropped, and only the actions, if any, are shown.
   */
  titleHidden?: boolean;
}

export function PageHeader({
  title,
  actions,
  subtitle,
  className,
  titleHidden = false,
}: PageHeaderProps) {
  if (titleHidden) {
    return (
      <div className={cn(actions ? "mb-4 flex justify-end gap-2" : undefined, className)}>
        <h1 className="sr-only">{title}</h1>
        {actions}
      </div>
    );
  }
  return (
    <div
      className={cn(
        "border-border-default mb-5 flex flex-wrap items-end justify-between gap-4 border-b pb-3.5",
        className,
      )}
    >
      <div>
        <h1 className="text-ink-primary font-[family-name:var(--font-display)] text-[1.475rem] leading-[1.2] font-bold tracking-[-0.02em]">
          {title}
        </h1>
        {subtitle && <p className="text-ink-secondary mt-1 text-[0.875rem]">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
