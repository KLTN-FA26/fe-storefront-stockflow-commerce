import { Check } from "lucide-react";

interface CheckoutStep {
  id: string;
  label: string;
}

interface CheckoutStepperProps {
  steps: CheckoutStep[];
  currentStep: string;
  completedSteps?: string[];
}

export function CheckoutStepper({ steps, currentStep, completedSteps = [] }: CheckoutStepperProps) {
  return (
    <ol className="border-border-default bg-bg-surface flex gap-1 rounded-[var(--r-lg)] border p-1.5 shadow-[var(--card-shadow)] sm:grid sm:grid-cols-5 sm:gap-2 sm:p-2">
      {steps.map((step) => {
        const isCurrent = step.id === currentStep;
        const isDone = completedSteps.includes(step.id);
        return (
          <li
            key={step.id}
            className={`flex min-w-0 flex-col items-center gap-1 rounded-[var(--r-md)] px-0.5 py-1.5 sm:flex-row sm:gap-2 sm:px-3 sm:py-2 ${isCurrent ? "bg-accent/10 text-accent flex-2" : "text-ink-secondary flex-1"}`}
          >
            <span
              className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold sm:size-7 ${isDone ? "bg-positive text-ink-inverse" : isCurrent ? "bg-accent text-ink-inverse" : "bg-bg-muted"}`}
            >
              {isDone ? <Check className="h-4 w-4" /> : steps.indexOf(step) + 1}
            </span>
            <span
              className={`max-w-full truncate text-xs font-semibold sm:text-sm ${isCurrent ? "" : "sr-only sm:not-sr-only"}`}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
