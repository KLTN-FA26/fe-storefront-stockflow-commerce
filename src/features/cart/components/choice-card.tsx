import { cn } from "cn";

import { Label } from "@/components/ui/label";
import { RadioGroupItem } from "@/components/ui/radio-group";

interface ChoiceCardProps {
  /** DOM id of the radio; the label points at it. */
  id: string;
  value: string;
  label: string;
  description: string;
  chosen: boolean;
}

/** One radio option of a payment choice: a tappable card with a title and a short explanation. */
export function ChoiceCard({ id, value, label, description, chosen }: ChoiceCardProps) {
  return (
    <Label
      htmlFor={id}
      className={cn(
        "bg-bg-surface hover:border-border-strong focus-within:ring-accent flex min-h-11 cursor-pointer items-start gap-3 rounded-[var(--r-md)] border p-3 text-left font-normal transition-colors focus-within:ring-2 sm:p-4",
        chosen ? "border-accent bg-accent/5" : "border-border-default",
      )}
    >
      <RadioGroupItem id={id} value={value} className="mt-1" />
      <span className="min-w-0 flex-1 text-sm">
        <span className="text-ink-primary block font-semibold">{label}</span>
        <span className="text-ink-secondary block font-normal">{description}</span>
      </span>
    </Label>
  );
}
