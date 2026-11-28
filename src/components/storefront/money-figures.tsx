import { cn } from "@/lib/cn";

export interface MoneyFigure {
  label: string;
  /** Already formatted (`formatMoney`). */
  value: string;
  /** One short line under the value: what it counts, or what is left of a limit. */
  note?: string | undefined;
  /** A figure that needs the customer's attention now (an overdue amount above zero). */
  alert?: boolean | undefined;
}

/**
 * A row of money figures, each with its label and a short note under it: the account page's credit
 * card and the payments page's summary. Two or three per row from `sm` up, stacked on a phone.
 */
export function MoneyFigures({
  figures,
  label,
  className,
}: {
  figures: readonly MoneyFigure[];
  /** Names the group for assistive technology. */
  label: string;
  className?: string;
}) {
  return (
    <dl
      aria-label={label}
      className={cn(
        "grid gap-3",
        figures.length >= 3 ? "sm:grid-cols-3" : "sm:grid-cols-2",
        className,
      )}
    >
      {figures.map((figure) => (
        <div
          key={figure.label}
          data-alert={figure.alert || undefined}
          className={cn(
            "bg-bg-subtle min-w-0 rounded-[var(--r-md)] border p-3",
            figure.alert ? "border-danger/40" : "border-border-default",
          )}
        >
          <dt className="text-ink-secondary text-sm">{figure.label}</dt>
          <dd
            className={cn(
              "font-display text-lg font-bold tabular-nums",
              figure.alert ? "text-danger-ink" : "text-ink-primary",
            )}
          >
            {figure.value}
          </dd>
          {figure.note ? <dd className="text-ink-tertiary text-xs">{figure.note}</dd> : null}
        </div>
      ))}
    </dl>
  );
}
