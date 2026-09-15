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
    <ol className="grid gap-2 rounded-xl bg-bg-surface p-3 shadow-md sm:grid-cols-2 lg:grid-cols-5">
      {steps.map((step) => {
        const isCurrent = step.id === currentStep;
        const isDone = completedSteps.includes(step.id);
        return (
          <li key={step.id} className={`flex items-center gap-3 rounded-lg px-3 py-2 ${isCurrent ? "bg-accent/10 text-accent" : "text-ink-secondary"}`}>
            <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${isDone ? "bg-positive text-ink-inverse" : isCurrent ? "bg-accent text-ink-inverse" : "bg-bg-muted"}`}>
              {isDone ? <Check className="h-4 w-4" /> : steps.indexOf(step) + 1}
            </span>
            <span className="text-sm font-semibold">{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
