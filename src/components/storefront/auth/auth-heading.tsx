import type { LucideIcon } from "lucide-react";

/** The top of an auth form: an icon tile, the page's heading and a line on who it is for. */
export function AuthHeading({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description?: string | undefined;
}) {
  return (
    <div className="space-y-3">
      <div className="bg-bg-subtle text-accent flex size-11 items-center justify-center rounded-[var(--r-md)]">
        <Icon className="size-5" aria-hidden="true" />
      </div>
      <h1 className="font-display text-ink-primary text-3xl font-bold tracking-tight">{title}</h1>
      {description ? <p className="text-ink-secondary text-sm leading-6">{description}</p> : null}
    </div>
  );
}
