import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useId, type ReactNode } from "react";

import { cn } from "@/lib/cn";

type SectionAction = { href: string; label: string };

type SectionHeaderProps = {
  title: string;
  eyebrow?: string | undefined;
  action?: SectionAction | undefined;
  as?: "h2" | "h3" | undefined;
  titleId?: string | undefined;
};

export function SectionHeader({
  title,
  eyebrow,
  action,
  as: Heading = "h2",
  titleId,
}: SectionHeaderProps) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="min-w-0 space-y-1">
        {eyebrow ? (
          <p className="text-ink-tertiary text-xs font-semibold tracking-wider uppercase">
            {eyebrow}
          </p>
        ) : null}
        <Heading
          id={titleId}
          className="font-display text-ink-primary text-xl font-bold sm:text-2xl"
        >
          {title}
        </Heading>
      </div>
      {action ? (
        <Link
          href={action.href}
          className="text-accent focus-visible:ring-accent inline-flex min-h-11 shrink-0 items-center gap-1 rounded-[var(--r-md)] text-sm font-semibold hover:underline focus-visible:ring-2 focus-visible:outline-none"
        >
          {action.label}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}

type SectionProps = {
  title?: string | undefined;
  eyebrow?: string | undefined;
  action?: SectionAction | undefined;
  id?: string | undefined;
  className?: string | undefined;
  children: ReactNode;
};

export function Section({ title, eyebrow, action, id, className, children }: SectionProps) {
  const titleId = `${useId()}-title`;
  return (
    <section
      id={id}
      aria-labelledby={title ? titleId : undefined}
      className={cn("space-y-4", className)}
    >
      {title ? (
        <SectionHeader title={title} eyebrow={eyebrow} action={action} titleId={titleId} />
      ) : null}
      {children}
    </section>
  );
}
