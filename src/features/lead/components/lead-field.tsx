import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
import { Label } from "@/components/ui/label";

/** The ids and ARIA wiring of one input: its error is announced and described by `<id>-error`. */
export const fieldA11y = (id: string, error?: string) => ({
  id,
  "aria-invalid": error ? true : undefined,
  "aria-describedby": error ? `${id}-error` : undefined,
});

export const INPUT = "min-h-11 rounded-[var(--r-md)]";

export function FieldError({ id, error }: { id: string; error?: string | undefined }) {
  if (!error) return null;
  return (
    <p id={`${id}-error`} role="alert" className="text-danger-ink text-xs">
      {error}
    </p>
  );
}

/** A labelled input of the lead form, with an optional hint and its error under it. */
export function LeadField({
  id,
  label,
  optional = false,
  hint,
  error,
  className,
  children,
}: {
  id: string;
  label: string;
  optional?: boolean;
  hint?: string;
  error?: string | undefined;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("grid content-start gap-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {optional ? <span className="text-ink-tertiary font-normal">(không bắt buộc)</span> : null}
      </Label>
      {children}
      {hint && !error ? <p className="text-ink-tertiary text-xs">{hint}</p> : null}
      <FieldError id={id} error={error} />
    </div>
  );
}

/** A titled group of fields: two columns from `sm` up. */
export function LeadFieldset({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-4 sm:grid-cols-2">
      <legend className="font-display text-ink-primary mb-3 text-base font-semibold">
        {legend}
      </legend>
      {children}
    </fieldset>
  );
}
