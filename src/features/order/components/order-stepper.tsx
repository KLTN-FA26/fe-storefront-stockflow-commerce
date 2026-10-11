import { cn } from "cn";
import { Check } from "lucide-react";

import { ORDER_PROGRESS_STEPS } from "../lifecycle";

/**
 * Horizontal fulfilment stepper. `done` comes from the status alone (orderProgressOf); the step
 * after the completed ones is the current one. Room is left under each label for a timestamp once
 * the BE order history is wired in.
 */
export function OrderStepper({ done }: { done: number }) {
  return (
    <ol className="grid grid-cols-5" aria-label="Tiến trình đơn hàng">
      {ORDER_PROGRESS_STEPS.map((step, index) => {
        const complete = index < done;
        const current = index === done;
        return (
          <li
            key={step.id}
            aria-current={current ? "step" : undefined}
            className="relative flex flex-col items-center gap-2 px-0.5 text-center"
          >
            {/* Runs edge to edge between the previous dot and this one (dots are size-6 = 1.5rem),
                so it never shows through the hollow dots. */}
            {index > 0 && (
              <span
                aria-hidden
                className={cn(
                  "absolute top-3 right-[calc(50%+0.75rem)] h-0.5 w-[calc(100%-1.5rem)] -translate-y-1/2",
                  complete || current ? "bg-positive" : "bg-border-default",
                )}
              />
            )}
            <span
              className={cn(
                "relative flex size-6 items-center justify-center rounded-full border-2",
                complete && "border-positive bg-positive text-ink-inverse",
                current && "border-accent bg-bg-surface",
                !complete && !current && "border-border-strong bg-bg-surface",
              )}
            >
              {complete && <Check aria-hidden className="size-3.5" />}
              {current && <span className="bg-accent size-2 rounded-full" />}
            </span>
            <span
              className={cn(
                "text-xs leading-tight",
                current ? "text-accent font-semibold" : "text-ink-secondary",
              )}
            >
              {step.label}
              <span className="sr-only">
                {complete ? " (đã xong)" : current ? " (hiện tại)" : " (chưa tới)"}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
