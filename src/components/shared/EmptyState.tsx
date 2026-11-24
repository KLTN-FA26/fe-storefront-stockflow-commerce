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

/**
 * Nothing to list yet: a large icon on a soft tinted disc, a short title and one line on what will appear here, and
 * the way to start. Open on the page, not boxed in a dashed frame.
 */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 py-14 text-center sm:py-16",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="bg-accent/10 text-accent mb-5 flex size-16 items-center justify-center rounded-full [&_svg]:size-7"
      >
        {icon ?? <Inbox />}
      </div>
      <h4 className="text-ink-primary font-[family-name:var(--font-display)] text-lg font-semibold">
        {title}
      </h4>
      {description && (
        <p className="text-ink-secondary mx-auto mt-1.5 max-w-[46ch] text-sm leading-6">
          {description}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
