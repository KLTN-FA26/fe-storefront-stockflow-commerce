import { cn } from "cn";
import { Inbox } from "lucide-react";
import type { ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-[var(--card-radius)] border border-dashed border-border-strong bg-bg-surface px-6 py-12 text-center",
        className
      )}
    >
      <div className="mb-2.5 text-2xl text-ink-tertiary">
        {icon ?? <Inbox className="size-8" />}
      </div>
      <h4 className="font-[family-name:var(--font-display)] text-[1.05rem] font-semibold text-ink-primary">
        {title}
      </h4>
      {description && (
        <p className="mx-auto mt-1 max-w-[42ch] text-[0.8125rem] text-ink-secondary">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
